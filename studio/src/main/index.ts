import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import crypto from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream } from 'fs'

// 환경설정 파일 경로
const settingsFilePath = join(app.getPath('userData'), 'settings.dat')

// 암호화 키 (실제 앱에서는 더 안전한 방법으로 관리해야 합니다)
const ENCRYPTION_KEY = 'gamelauncher-secure-encryption-key-2024'

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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    minWidth: 800,
    minHeight: 800,
    maxWidth: 1024,
    maxHeight: 1024,
    title: 'GamePot Studio',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 설정 저장 핸들러
ipcMain.handle('save-settings', async (_, encryptedData) => {
  try {
    // 추가 암호화 적용
    const encryptedSettings = encrypt(encryptedData)
    fs.writeFileSync(settingsFilePath, encryptedSettings)
    return { success: true }
  } catch (error) {
    console.error('설정 저장 중 오류:', error)
    return { success: false, error: error.message }
  }
})

// 설정 로드 핸들러
ipcMain.handle('load-settings', async () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8')
      // 복호화 적용
      return decrypt(encryptedSettings)
    }
    return null
  } catch (error) {
    console.error('설정 로드 중 오류:', error)
    return null
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
ipcMain.handle('upload-to-s3', async (_, { filePath, bucket, key }) => {
  try {
    // 설정에서 AWS 자격 증명 불러오기
    const encryptedSettings = fs.existsSync(settingsFilePath)
      ? fs.readFileSync(settingsFilePath, 'utf-8')
      : null

    if (!encryptedSettings) {
      throw new Error('AWS 자격 증명을 찾을 수 없습니다. 먼저 환경 설정을 완료해주세요.')
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

    // 파일 객체 생성
    const fileStream = createReadStream(filePath)

    // 파일 업로드 명령 생성
    const uploadParams = {
      Bucket: bucket,
      Key: key,
      Body: fileStream
    }

    // S3에 파일 업로드
    const command = new PutObjectCommand(uploadParams)
    const response = await s3Client.send(command)

    return {
      success: true,
      location: `https://${bucket}.s3.amazonaws.com/${key}`,
      response
    }
  } catch (error) {
    console.error('S3 업로드 중 오류:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 암호화 함수 (AES-256-CBC)
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16) // 초기화 벡터
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32) // 키 생성
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted // IV와 암호화된 데이터 함께 저장
  } catch (error) {
    console.error('암호화 오류:', error)
    return text // 오류 시 원본 반환
  }
}

// 복호화 함수 (AES-256-CBC)
function decrypt(text) {
  try {
    const textParts = text.split(':')
    const iv = Buffer.from(textParts.shift(), 'hex')
    const encryptedText = textParts.join(':')
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('복호화 오류:', error)
    return text // 오류 시 원본 반환
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
