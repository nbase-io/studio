import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import crypto from 'crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream, writeFileSync } from 'fs'
import { tmpdir } from 'os'

// 환경설정 파일 경로
const settingsFilePath = join(app.getPath('userData'), 'settings.dat')

// 암호화 키 (실제 앱에서는 더 안전한 방법으로 관리해야 합니다)
const ENCRYPTION_KEY = 'gamelauncher-secure-encryption-key-2024'

// 임시 파일 디렉토리 - 애플리케이션별 임시 디렉토리 생성
const appTempDir = join(tmpdir(), `gamepot-studio-${Date.now()}`);

// 단일 인스턴스 적용
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_, commandLine, workingDirectory) => {
    // 두 번째 인스턴스가 실행되면 첫 번째 인스턴스의 창을 활성화
    const windows = BrowserWindow.getAllWindows()
    if (windows.length) {
      const mainWindow = windows[0]
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// 미리 생성된 키 (성능 향상을 위해 전역으로 한 번만 생성)
const ENCRYPTION_KEY_BUFFER = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    minWidth: 800,
    minHeight: 800,
    maxWidth: 1200,
    maxHeight: 800,
    title: 'GamePot Studio',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // CSP 설정 1: 세션 수준에서 CSP 설정 (모든 요청에 적용)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';"
        ]
      }
    });
  });

  // CSP 설정 2: 실행 시 CSP 메타 태그 삽입
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';";
      document.head.appendChild(meta);
    `);
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // 개발자 도구 자동 실행
    mainWindow.webContents.openDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // CSP 설정 3: CORS 허용
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Origin': '*',
        'Access-Control-Allow-Origin': '*'
      }
    });
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 설정 저장 핸들러
ipcMain.handle('save-settings', async (_, settings: string) => {
  try {
    // 파라미터 검증 추가
    if (!settings || typeof settings !== 'string') {
      throw new Error('유효하지 않은 설정 데이터입니다');
    }

    // 객체를 JSON 문자열로 변환
    const settingsJson = JSON.stringify(settings);

    // 디버그 로그 추가
    console.log('저장할 설정 데이터:', settingsJson.substring(0, 50) + '...');

    // 추가 암호화 적용
    const encryptedSettings = encrypt(settingsJson);

    // 파일이 저장될 디렉토리 확인 및 생성
    const settingsDir = join(app.getPath('userData'));
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    // 설정 파일 저장
    fs.writeFileSync(settingsFilePath, encryptedSettings);

    console.log('설정 저장 완료:', settingsFilePath);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

// 설정 로드 핸들러
ipcMain.handle('load-settings', async () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8');

      // 설정 파일이 비어있는지 확인
      if (!encryptedSettings || encryptedSettings.trim() === '') {
        return null;
      }

      // 복호화 적용
      const decryptedData = decrypt(encryptedSettings);

      // 복호화된 데이터가 유효한 JSON인지 확인
      try {
        return JSON.parse(decryptedData);
      } catch (jsonError) {
        console.error('설정 데이터 파싱 오류:', jsonError);
        return null;
      }
    }
    return null;
  } catch (error: any) {
    console.error('Error loading settings:', error);
    return { success: false, error: error.message };
  }
});

// S3 설정 정보 가져오기 핸들러
ipcMain.handle('get-s3-config', async () => {
  try {
    // 설정 파일 존재 여부 확인
    if (fs.existsSync(settingsFilePath)) {
      const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8')
      const settingsData = JSON.parse(decrypt(encryptedSettings))

      // S3 관련 설정 반환
      return {
        bucket: settingsData.s3Bucket || 'my-default-bucket',
        region: settingsData.region || 'ap-northeast-2',
        accessKeyId: settingsData.accessKey || '',
        secretAccessKey: settingsData.secretKey || ''
      }
    }

    // 설정 파일이 없으면 기본값 반환
    return {
      bucket: 'my-default-bucket',
      region: 'ap-northeast-2',
      accessKeyId: '',
      secretAccessKey: ''
    }
  } catch (error: any) {
    console.error('S3 설정 가져오기 중 오류:', error)
    // 오류 발생 시 기본값 반환
    return {
      bucket: 'my-default-bucket',
      region: 'ap-northeast-2',
      accessKeyId: '',
      secretAccessKey: ''
    }
  }
})

// S3 파일 목록 가져오기 핸들러
ipcMain.handle('list-s3-files', async (_, { bucket, prefix }) => {
  try {
    console.log(`S3 파일 목록 요청: ${bucket}/${prefix || ''}`);

    // 설정에서 AWS 자격 증명 불러오기
    const encryptedSettings = fs.existsSync(settingsFilePath)
      ? fs.readFileSync(settingsFilePath, 'utf-8')
      : null

    if (!encryptedSettings) {
      throw new Error('AWS 자격 증명을 찾을 수 없습니다. 먼저 환경 설정을 완료해주세요.')
    }

    const settings = JSON.parse(decrypt(encryptedSettings))

    // AWS SDK 임포트 및 S3 클라이언트 생성
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: settings.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: settings.accessKey,
        secretAccessKey: settings.secretKey
      }
    });

    // ListObjectsV2 명령 생성
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || '',
      Delimiter: '/'
    });

    // S3 객체 목록 조회
    const response = await s3Client.send(command);

    // 파일과 폴더 목록 분리
    const files = (response.Contents || [])
      .filter(item => !item.Key.endsWith('/') && item.Key !== prefix)
      .map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      }));

    // 폴더 목록 (접두사/폴더명 형식)
    const folders = (response.CommonPrefixes || [])
      .map(prefix => prefix.Prefix);

    return { files, folders };
  } catch (error) {
    console.error('S3 파일 목록 가져오기 중 오류:', error);
    // 오류 발생 시 빈 목록 반환
    return { files: [], folders: [], error: error.message };
  }
})

// 파일 선택 대화상자 핸들러
ipcMain.handle('select-file', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return []

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      ...((options && options.filters) || [])
    ],
    ...options
  })

  if (canceled) return []
  return filePaths
})

// S3 파일 업로드 핸들러
ipcMain.handle('upload-file-to-s3', async (_, params: any) => {
  try {
    // 파라미터 형식 검증
    if (!params || typeof params !== 'object') {
      throw new Error('파라미터는 객체 형태로 전달되어야 합니다');
    }

    const { filePath, bucket, key, accessKeyId, secretAccessKey, region } = params;

    // 파라미터 검증
    if (!filePath || !bucket || !key) {
      throw new Error('필수 파라미터가 누락되었습니다 (filePath, bucket, key)');
    }

    console.log(`S3 업로드 요청: ${filePath} -> ${bucket}/${key}`);

    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      throw new Error(`파일이 존재하지 않습니다: ${filePath}`);
    }

    // S3 클라이언트 생성
    const s3Client = new S3Client({
      region: region || 'ap-northeast-2',
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || ''
      }
    });

    // 파일 객체 생성
    const fileStream = createReadStream(filePath);
    const fileStats = fs.statSync(filePath);

    console.log(`파일 크기: ${fileStats.size} 바이트`);

    // 파일 확장자 및 컨텐츠 타입 결정
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    let contentType = 'application/octet-stream'; // 기본값

    // 일반적인 파일 확장자에 따른 MIME 타입 설정
    const mimeTypes = {
      'exe': 'application/octet-stream',
      'dmg': 'application/x-apple-diskimage',
      'apk': 'application/vnd.android.package-archive',
      'ipa': 'application/octet-stream',
      'zip': 'application/zip',
      'app': 'application/octet-stream',
      'json': 'application/json',
      'txt': 'text/plain'
    };

    if (ext && mimeTypes[ext]) {
      contentType = mimeTypes[ext];
    }

    // 파일 업로드 명령 생성
    const uploadParams = {
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: contentType
    };

    // S3에 파일 업로드
    const command = new PutObjectCommand(uploadParams);
    const response = await s3Client.send(command);

    console.log(`파일 업로드 완료: ${bucket}/${key}`);

    // 업로드 성공 응답 반환
    return {
      success: true,
      location: `https://${bucket}.s3.${region || 'ap-northeast-2'}.amazonaws.com/${key}`,
      response
    };
  } catch (error: any) {
    console.error('Error uploading file to S3:', error);
    return { success: false, error: error.message };
  }
});

// S3 파일 삭제 핸들러
ipcMain.handle('delete-file-from-s3', async (_, params: any) => {
  try {
    // 파라미터 검증
    if (!params || typeof params !== 'object') {
      throw new Error('파라미터는 객체 형태로 전달되어야 합니다');
    }

    const { bucket, key } = params;

    // 설정에서 AWS 자격 증명 불러오기
    const encryptedSettings = fs.existsSync(settingsFilePath)
      ? fs.readFileSync(settingsFilePath, 'utf-8')
      : null

    if (!encryptedSettings) {
      throw new Error('AWS 자격 증명을 찾을 수 없습니다')
    }

    const settings = JSON.parse(decrypt(encryptedSettings))

    // S3 클라이언트 생성
    const s3Client = new S3Client({
      region: 'ap-northeast-2', // 리전 설정
      credentials: {
        accessKeyId: settings.accessKey,
        secretAccessKey: settings.secretKey
      }
    })

    // 파일 삭제 명령 생성
    const deleteParams = {
      Bucket: bucket,
      Key: key
    }

    // S3에서 파일 삭제
    const command = new DeleteObjectCommand(deleteParams)
    const response = await s3Client.send(command)

    // 메타데이터 파일도 삭제 시도
    try {
      const metadataKey = `${key}.metadata.json`
      const metadataCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: metadataKey
      })
      await s3Client.send(metadataCommand)
      console.log(`메타데이터 파일도 삭제됨: ${metadataKey}`)
    } catch (err) {
      // 메타데이터 파일 삭제 실패는 무시
      console.warn('메타데이터 파일 삭제 실패:', err)
    }

    return {
      success: true,
      response
    }
  } catch (error: any) {
    console.error('Error deleting file from S3:', error);
    return { success: false, error: error.message };
  }
})

// 파일 이름 변경 핸들러
ipcMain.handle('rename-file-in-s3', async (_, params: any) => {
  try {
    const { bucket, oldKey, newKey } = params;

    if (!bucket || !oldKey || !newKey) {
      throw new Error('Missing required parameters');
    }

    console.log(`Renaming file from ${oldKey} to ${newKey} in bucket ${bucket}`);

    // S3에서는 파일 이름 변경을 위해 복사 후 삭제 방식을 사용
    const s3Client = new S3Client({
      region: params.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: params.accessKeyId || '',
        secretAccessKey: params.secretAccessKey || ''
      }
    });

    // S3에서 기존 객체 가져오기
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: oldKey
    });

    const originalObject = await s3Client.send(getObjectCommand);

    // 새 위치에 객체 복사
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: newKey,
      Body: originalObject.Body
    });

    await s3Client.send(putCommand);

    // 원본 파일 삭제
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: oldKey
    });

    await s3Client.send(deleteCommand);

    return { success: true };
  } catch (error: any) {
    console.error('Error renaming file in S3:', error);
    return { success: false, error: error.message };
  }
});

// 저장 위치 선택 핸들러
ipcMain.handle('select-save-location', async (_, params: any) => {
  try {
    const downloadsPath = app.getPath('downloads');
    const defaultPath = join(downloadsPath, params.defaultPath || 'download');

    console.log(`Opening save dialog with default path: ${defaultPath}`);

    const result = await dialog.showSaveDialog({
      title: '파일 저장 위치 선택',
      defaultPath: defaultPath,
      buttonLabel: '저장',
      properties: ['createDirectory']
    });

    if (result.canceled) {
      return { canceled: true, filePath: null };
    }

    return {
      canceled: false,
      filePath: result.filePath
    };
  } catch (error: any) {
    console.error('Error showing save dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// S3에서 파일 다운로드 핸들러
ipcMain.handle('download-file-from-s3', async (_, params: any) => {
  try {
    const { bucket, key, destination } = params;

    if (!bucket || !key || !destination) {
      throw new Error('Missing required parameters');
    }

    console.log(`Downloading file ${key} from bucket ${bucket} to ${destination}`);

    // S3 클라이언트 생성
    const s3Client = new S3Client({
      region: params.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: params.accessKeyId || '',
        secretAccessKey: params.secretAccessKey || ''
      }
    });

    // S3에서 객체 가져오기
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3Client.send(getObjectCommand);

    // 스트림을 파일로 저장
    if (response.Body) {
      const fileStream = fs.createWriteStream(destination);

      // @ts-ignore: Body 타입이 맞지 않을 수 있음
      await new Promise((resolve, reject) => {
        // @ts-ignore: Body 타입이 맞지 않을 수 있음
        response.Body.pipe(fileStream)
          .on('error', (err) => {
            reject(err);
          })
          .on('finish', () => {
            resolve(true);
          });
      });

      return { success: true, filePath: destination };
    } else {
      throw new Error('No file content received from S3');
    }
  } catch (error: any) {
    console.error('Error downloading file from S3:', error);
    return { success: false, error: error.message };
  }
});

// 복호화 함수 (AES-256-CBC) - 성능 최적화
function decrypt(text: string): string {
  try {
    if (!text || typeof text !== 'string') {
      throw new TypeError('복호화할 데이터는 유효한 문자열이어야 합니다');
    }

    // IV와 암호화된 데이터 분리
    const textParts = text.split(':');
    if (textParts.length < 2) {
      throw new Error('유효하지 않은 암호화 형식입니다');
    }

    const iv = Buffer.from(textParts.shift() || '', 'hex');
    const encryptedText = textParts.join(':');

    // 미리 생성된 키 사용
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error: any) {
    throw new Error(`복호화 처리 실패: ${error.message}`);
  }
}

// 암호화 함수 (AES-256-CBC) - 성능 최적화
function encrypt(text: string): string {
  try {
    if (!text || typeof text !== 'string') {
      throw new TypeError('암호화할 데이터는 유효한 문자열이어야 합니다');
    }

    const iv = crypto.randomBytes(16); // 초기화 벡터
    // 미리 생성된 키 사용
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted; // IV와 암호화된 데이터 함께 저장
  } catch (error: any) {
    throw new Error(`암호화 처리 실패: ${error.message}`);
  }
}

// 앱 시작 시 임시 디렉토리 생성
function setupTempDirectory() {
  try {
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
      console.log(`임시 디렉토리 생성됨: ${appTempDir}`);
    }
  } catch (error) {
    console.error('임시 디렉토리 생성 실패:', error);
  }
}

// 임시 파일 생성 핸들러
ipcMain.handle('save-temp-file', async (_, { buffer, fileName }) => {
  try {
    // 임시 디렉토리가 없으면 생성
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
    }

    // 고유한 파일명 생성
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const tempFileName = `${timestamp}-${randomSuffix}-${fileName}`;
    const tempFilePath = join(appTempDir, tempFileName);

    // Uint8Array 버퍼를 파일에 쓰기
    const uint8Array = new Uint8Array(buffer);
    fs.writeFileSync(tempFilePath, uint8Array);

    console.log(`임시 파일 생성됨: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error('임시 파일 생성 중 오류:', error);
    return null;
  }
});

// 임시 파일 삭제 핸들러
ipcMain.handle('delete-temp-file', async (_, { filePath }) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`임시 파일 삭제됨: ${filePath}`);
      return { success: true };
    } else {
      return { success: false, error: '파일이 존재하지 않음' };
    }
  } catch (error: any) {
    console.error('임시 파일 삭제 중 오류:', error);
    return { success: false, error: error.message };
  }
});

// 앱 종료 시 임시 디렉토리 정리
function cleanupTempDirectory() {
  try {
    if (fs.existsSync(appTempDir)) {
      fs.rmSync(appTempDir, { recursive: true, force: true });
      console.log(`임시 디렉토리 삭제됨: ${appTempDir}`);
    }
  } catch (error: any) {
    console.error('임시 디렉토리 삭제 실패:', error);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 전역 CSP 설정 (모든 창에 적용)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';"
        ]
      }
    });
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 개발자 도구 열기 핸들러
  ipcMain.on('open-devtools', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.webContents.openDevTools()
    }
  })

  // 임시 디렉토리 설정
  setupTempDirectory();

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 앱 종료 시 임시 디렉토리 정리
    cleanupTempDirectory();
    app.quit()
  }
})

// 앱이 완전히 종료될 때 호출
app.on('will-quit', () => {
  // 앱 종료 시 임시 디렉토리 정리
  cleanupTempDirectory();
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
