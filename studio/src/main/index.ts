import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import crypto from 'crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { tmpdir } from 'os'
import { autoUpdater } from 'electron-updater'

// 환경설정 파일 경로
const settingsFilePath = join(app.getPath('userData'), 'settings.dat')

// 윈도우 설정 파일 경로
const windowSettingsFilePath = join(app.getPath('userData'), 'window-settings.json')

// 암호화 키 (실제 앱에서는 더 안전한 방법으로 관리해야 합니다)
const ENCRYPTION_KEY = 'gamelauncher-secure-encryption-key-2024'

// 임시 파일 디렉토리 - 애플리케이션별 임시 디렉토리 생성
const appTempDir = join(tmpdir(), `gamepot-studio-${Date.now()}`);

// Auto updater configuration
if (!is.dev) {
  autoUpdater.logger = console;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = false;
}

// 단일 인스턴스 적용
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_) => {
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

// 윈도우 설정을 저장하는 함수
function saveWindowSettings(window: BrowserWindow): void {
  try {
    // 현재 창 상태 가져오기
    const { width, height, x, y } = window.getBounds() as { width: number; height: number; x: number; y: number };

    // 최대화 상태 확인
    const maximized = window.isMaximized();

    // 윈도우 설정 객체 생성
    const windowSettings = {
      width,
      height,
      x,
      y,
      maximized
    };

    // JSON으로 변환하여 파일에 저장
    fs.writeFileSync(windowSettingsFilePath, JSON.stringify(windowSettings));
    console.log('윈도우 설정 저장됨:', windowSettings);
  } catch (error) {
    console.error('윈도우 설정 저장 중 오류:', error);
  }
}

// 윈도우 설정을 로드하는 함수
function loadWindowSettings(): { width: number; height: number; x?: number; y?: number; maximized?: boolean } {
  try {
    // 설정 파일이 존재하는지 확인
    if (fs.existsSync(windowSettingsFilePath)) {
      // 파일에서 설정 로드
      const settings = JSON.parse(fs.readFileSync(windowSettingsFilePath, 'utf-8'));
      console.log('윈도우 설정 로드됨:', settings);
      return settings;
    }
  } catch (error) {
    console.error('윈도우 설정 로드 중 오류:', error);
  }

  // 기본 설정 반환
  return {
    width: 1600,
    height: 900
  };
}

// Auto updater events
function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Check for updates
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  });

  // Update available
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `New version ${info.version} is available. Do you want to download it now?`,
      buttons: ['Yes', 'No'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        mainWindow.webContents.send('update-status', { status: 'downloading' });
        autoUpdater.downloadUpdate();
      }
    });
  });

  // No update available
  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-status', { status: 'no-update' });
  });

  // Download progress
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      progress: progressObj.percent
    });
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `New version ${info.version} has been downloaded. The application will restart to install the update.`,
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  // Error in auto-updater
  autoUpdater.on('error', (error: Error) => {
    console.error('Auto updater error:', error);
    mainWindow.webContents.send('update-status', {
      status: 'error',
      error: error.message
    });
  });

  // Check for updates (with 3 second delay after app starts)
  if (!is.dev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
  }
}

function createWindow(): void {
  // 이전 윈도우 설정 로드
  const windowSettings = loadWindowSettings();

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: windowSettings.width,
    height: windowSettings.height,
    x: windowSettings.x,
    y: windowSettings.y,
    show: false,
    autoHideMenuBar: true,
    minWidth: 800,
    minHeight: 600,
    // maxWidth: 1600,
    // maxHeight: 1000,
    title: 'GamePot Studio',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // 자동 업데이트 설정
  setupAutoUpdater(mainWindow);

  // 윈도우가 최대화된 상태로 저장되었으면 최대화
  if (windowSettings.maximized) {
    mainWindow.maximize();
  }

  // 윈도우 크기 변경 이벤트 처리
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowSettings(mainWindow);
    }
  });

  // 윈도우 위치 변경 이벤트 처리
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowSettings(mainWindow);
    }
  });

  // 윈도우 최대화 이벤트 처리
  mainWindow.on('maximize', () => {
    saveWindowSettings(mainWindow);
  });

  // 윈도우 최대화 해제 이벤트 처리
  mainWindow.on('unmaximize', () => {
    saveWindowSettings(mainWindow);
  });

  // 윈도우 닫기 이벤트 처리
  mainWindow.on('close', () => {
    saveWindowSettings(mainWindow);
  });

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
  } catch (error: unknown) {
    console.error('S3 파일 목록 가져오기 중 오류:', error);
    // 오류 발생 시 빈 목록 반환
    return {
      files: [],
      folders: [],
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
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

// 진행 중인 업로드 작업 관리 (취소를 위해)
const activeUploads = new Map();

// 업로드 취소 핸들러
ipcMain.handle('cancel-upload', async (event) => {
  try {
    const senderID = event.sender.id;
    console.log(`업로드 취소 요청: sender ID ${senderID}`);

    if (activeUploads.has(senderID)) {
      const uploads = activeUploads.get(senderID);
      console.log(`취소할 업로드 수: ${uploads.length}`);

      // 모든 활성 업로드 중단
      for (const upload of uploads) {
        if (upload.abort && typeof upload.abort === 'function') {
          console.log(`업로드 중단 중: ${upload.key}`);
          await upload.abort();
        }
      }

      // 업로드 목록 초기화
      activeUploads.delete(senderID);

      // 취소 완료 알림
      event.sender.send('upload-cancelled', { success: true });

      return { success: true };
    } else {
      console.log('취소할 활성 업로드가 없음');
      return { success: true, message: '취소할 업로드가 없습니다' };
    }
  } catch (error) {
    console.error('업로드 취소 중 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
  }
});

// S3 파일 업로드 핸들러
ipcMain.handle('upload-file-to-s3', async (event, params: any) => {
  // 진행 중인 업로드 객체 (취소를 위해 사용)
  let uploadOperation: { key: string; abort: () => Promise<boolean> } | null = null;

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

    // 파일 정보 가져오기
    const fileStats = fs.statSync(filePath);
    console.log(`파일 크기: ${fileStats.size} 바이트`);

    // 파일 확장자 및 컨텐츠 타입 결정
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    let contentType = 'application/octet-stream'; // 기본값

    // 일반적인 파일 확장자에 따른 MIME 타입 설정
    const mimeTypes: Record<string, string> = {
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

    // S3 클라이언트 생성
    const s3Client = new S3Client({
      region: region || 'ap-northeast-2',
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || ''
      },
      // 경로 스타일 URL 사용 (일부 호환성 문제 해결)
      forcePathStyle: true
    });

    // 대용량 파일을 처리하기 위한 체크 (5MB 이상)
    const NORMAL_UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

    let response;

    // 발신자 ID 저장 (취소 관리를 위해)
    const senderID = event.sender.id;

    // 해당 발신자의 업로드 목록이 없으면 초기화
    if (!activeUploads.has(senderID)) {
      activeUploads.set(senderID, []);
    }

    if (fileStats.size > NORMAL_UPLOAD_LIMIT) {
      console.log(`대용량 파일 처리 시작 - 멀티파트 업로드 사용 (${fileStats.size} 바이트)`);

      // @aws-sdk/client-s3에서는 멀티파트 업로드를 직접 지원하지 않으므로
      // @aws-sdk/lib-storage를 사용하여 구현
      const { Upload } = require('@aws-sdk/lib-storage');

      const multipartUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: fs.createReadStream(filePath),
          ContentType: contentType
        },
        queueSize: 4, // 동시 업로드 쓰레드 수
        partSize: 10 * 1024 * 1024, // 파트 크기(10MB)
        leavePartsOnError: false
      });

      // 업로드 작업을 활성 목록에 추가
      uploadOperation = {
        key,
        abort: async () => {
          try {
            console.log(`멀티파트 업로드 중단: ${key}`);
            await multipartUpload.abort();

            // 중단 알림 전송
            if (event && event.sender) {
              event.sender.send('upload-progress', {
                key,
                cancelled: true,
                percentage: 0
              });
            }

            return true;
          } catch (abortError) {
            console.error('업로드 중단 중 오류:', abortError);
            return false;
          }
        }
      };

      activeUploads.get(senderID)?.push(uploadOperation);

      // 진행률 보고
      multipartUpload.on('httpUploadProgress', (progress) => {
        const loaded = progress.loaded || 0;
        const percentage = Math.round((loaded / fileStats.size) * 100);
        console.log(`업로드 진행률: ${percentage}% (${loaded}/${fileStats.size})`);

        // 렌더러에 진행 상황 전송
        if (event && event.sender) {
          event.sender.send('upload-progress', {
            key,
            loaded,
            total: fileStats.size,
            percentage
          });
        }
      });

      response = await multipartUpload.done();
      console.log('멀티파트 업로드 완료');

      // 완료 알림
      if (event && event.sender) {
        event.sender.send('upload-progress', {
          key,
          loaded: fileStats.size,
          total: fileStats.size,
          percentage: 100,
          completed: true
        });
      }
    } else {
      // 작은 파일은 일반 업로드 사용
      console.log('일반 업로드 시작');
      const fileContent = fs.readFileSync(filePath);

      const uploadParams = {
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType
      };

      // 일반 업로드 취소 방법 추가
      uploadOperation = {
        key,
        abort: async () => {
          console.log(`일반 업로드 중단: ${key}`);
          // 일반 업로드는 즉시 취소가 어려움 - 취소 상태만 전송
          if (event && event.sender) {
            event.sender.send('upload-progress', {
              key,
              cancelled: true,
              percentage: 0
            });
          }
          return true;
        }
      };

      activeUploads.get(senderID)?.push(uploadOperation);

      const command = new PutObjectCommand(uploadParams);
      response = await s3Client.send(command);
      console.log('일반 업로드 완료');

      // 완료 알림
      if (event && event.sender) {
        event.sender.send('upload-progress', {
          key,
          loaded: fileStats.size,
          total: fileStats.size,
          percentage: 100,
          completed: true
        });
      }
    }

    console.log(`파일 업로드 완료: ${bucket}/${key}`);

    // 완료된 업로드를 활성 목록에서 제거
    if (uploadOperation && senderID) {
      const uploads = activeUploads.get(senderID) || [];
      const index = uploads.findIndex(u => u.key === uploadOperation?.key);
      if (index !== -1) {
        uploads.splice(index, 1);
      }
    }

    // 업로드 성공 응답 반환
    return {
      success: true,
      location: `https://${bucket}.s3.${region || 'ap-northeast-2'}.amazonaws.com/${key}`,
      response
    };
  } catch (error: unknown) {
    console.error('Error uploading file to S3:', error);

    // 오류 발생한 업로드 제거
    if (uploadOperation && event?.sender?.id) {
      const senderID = event.sender.id;
      const uploads = activeUploads.get(senderID) || [];
      const index = uploads.findIndex(u => u.key === uploadOperation?.key);
      if (index !== -1) {
        uploads.splice(index, 1);
      }
    }

    // 오류 알림
    if (event && event.sender) {
      event.sender.send('upload-progress', {
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다',
        failed: true
      });
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
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

// 임시 파일 생성 핸들러 (대용량 파일용)
ipcMain.handle('create-temp-file', async (_, { fileName, totalSize }) => {
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

    // 파일 생성 및 크기 예약
    fs.writeFileSync(tempFilePath, Buffer.alloc(0));

    // 파일 크기를 지정된 크기로 설정 (희소 파일)
    const fd = fs.openSync(tempFilePath, 'r+');
    fs.ftruncateSync(fd, totalSize);
    fs.closeSync(fd);

    console.log(`임시 파일 생성됨: ${tempFilePath} (${totalSize} bytes)`);
    return tempFilePath;
  } catch (error: unknown) {
    console.error('임시 파일 생성 중 오류:', error);
    return null;
  }
});

// 임시 파일에 데이터 추가 핸들러
ipcMain.handle('append-to-temp-file', async (_, { filePath, buffer, offset }) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('파일이 존재하지 않습니다');
    }

    // 파일 열기 (쓰기 모드)
    const fileHandle = fs.openSync(filePath, 'r+');

    try {
      // 지정된 오프셋에 데이터 쓰기
      fs.writeSync(fileHandle, new Uint8Array(buffer), 0, buffer.length, offset);
      return { success: true };
    } finally {
      // 파일 핸들 닫기
      fs.closeSync(fileHandle);
    }
  } catch (error: unknown) {
    console.error('임시 파일에 데이터 추가 중 오류:', error);
    return { success: false, error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다' };
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

// 임시 파일 저장 핸들러
ipcMain.handle('save-temp-file', async (_, params) => {
  try {
    console.log('save-temp-file 호출됨:', params);

    // 유효성 검사
    if (!params || typeof params !== 'object') {
      throw new Error('유효한 파라미터가 아닙니다');
    }

    const { buffer, fileName } = params;

    if (!buffer) {
      throw new Error('파일 데이터가 누락되었습니다');
    }

    if (!fileName) {
      throw new Error('파일 이름이 누락되었습니다');
    }

    // 임시 디렉토리가 없으면 생성
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
    }

    // 고유한 파일명 생성 (타임스탬프 + 난수 + 원본 파일명)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const tempFileName = `${timestamp}-${randomSuffix}-${fileName}`;
    const tempFilePath = join(appTempDir, tempFileName);

    console.log(`임시 파일 생성 중: ${tempFilePath} (${buffer.byteLength} bytes)`);

    // 파일 저장
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    console.log(`임시 파일 생성 완료: ${tempFilePath}`);
    return tempFilePath;
  } catch (error: unknown) {
    console.error('임시 파일 저장 중 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
  }
});

// 앱 종료 시 임시 디렉토리 정리
function cleanupTempDirectory() {
  try {
    if (fs.existsSync(appTempDir)) {
      fs.rmSync(appTempDir, { recursive: true, force: true });
      console.log(`임시 디렉토리 삭제됨: ${appTempDir}`);
    }
  } catch (error: unknown) {
    console.error('임시 디렉토리 삭제 실패:', error);
  }
}

// 업데이트 확인 요청 처리
ipcMain.handle('check-for-updates', async () => {
  if (!is.dev) {
    autoUpdater.checkForUpdates();
  }
});

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
