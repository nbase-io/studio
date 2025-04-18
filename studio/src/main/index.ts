import { app, shell, BrowserWindow, ipcMain, dialog, session, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.icns?asset'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { tmpdir } from 'os'
import { autoUpdater } from 'electron-updater'

// 메인 윈도우 참조 저장을 위한 전역 변수
let win: BrowserWindow | null = null

// Settings file path
const settingsFilePath = join(app.getPath('userData'), 'settings.dat')

// Window settings file path
const windowSettingsFilePath = join(app.getPath('userData'), 'window-settings.json')

// Encryption key (should be managed more securely in production)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-76f3MHFDIul7xdwIfbWYKuLuVHovNY8G'

// Temporary file directory - Create application-specific temp directory
const appTempDir = join(tmpdir(), `gamepot-studio-${Date.now()}`);

// Auto updater configuration
if (!is.dev) {
  autoUpdater.logger = console;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = false;
}

// Splash window reference
let splashWindow: BrowserWindow | null = null;

// Apply single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_) => {
    // When a second instance is launched, activate the first instance window
    const windows = BrowserWindow.getAllWindows()
    if (windows.length) {
      const mainWindow = windows[0]
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Pre-generated key (created once globally for performance)
const ENCRYPTION_KEY_BUFFER = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

// Create splash window function
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splash.loadFile(join(__dirname, '../../resources/images/splash.html'));

  // Handle cancel event to exit app
  ipcMain.once('cancel-splash', () => {
    console.log('Splash screen canceled, exiting application.');
    app.exit(0);
  });

  return splash;
}

// Function to save window settings
function saveWindowSettings(window: BrowserWindow): void {
  try {
    // Get current window state
    const { width, height, x, y } = window.getBounds() as { width: number; height: number; x: number; y: number };

    // Check maximized state
    const maximized = window.isMaximized();

    // Create window settings object
    const windowSettings = {
      width,
      height,
      x,
      y,
      maximized
    };

    // Convert to JSON and save to file
    fs.writeFileSync(windowSettingsFilePath, JSON.stringify(windowSettings));
    console.log('Window settings saved:', windowSettings);
  } catch (error) {
    console.error('Error saving window settings:', error);
  }
}

// Function to load window settings
function loadWindowSettings(): { width: number; height: number; x?: number; y?: number; maximized?: boolean } {
  try {
    // Check if settings file exists
    if (fs.existsSync(windowSettingsFilePath)) {
      // Load settings from file
      const settings = JSON.parse(fs.readFileSync(windowSettingsFilePath, 'utf-8'));
      console.log('Window settings loaded:', settings);
      return settings;
    }
  } catch (error) {
    console.error('Error loading window settings:', error);
  }

  // Return default settings
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
  // Splash window creation disabled
  // splashWindow = createSplashWindow();

  // Load previous window settings
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
    icon, // Apply icon to all platforms
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: true
    }
  })

  // 전역 win 변수에 메인 윈도우 할당
  win = mainWindow;

  // Setup auto-updater
  setupAutoUpdater(mainWindow);

  // Maximize if window was saved in maximized state
  if (windowSettings.maximized) {
    mainWindow.maximize();
  }

  // Window resize event handler
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowSettings(mainWindow);
    }
  });

  // Window move event handler
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      saveWindowSettings(mainWindow);
    }
  });

  // Window maximize event handler
  mainWindow.on('maximize', () => {
    saveWindowSettings(mainWindow);
  });

  // Window unmaximize event handler
  mainWindow.on('unmaximize', () => {
    saveWindowSettings(mainWindow);
  });

  // Window close event handler
  mainWindow.on('close', () => {
    saveWindowSettings(mainWindow);
  });

  // Global CSP settings (applied to all windows)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-src 'self' https://dash.gamepot.beta.ntruss.com/;"
        ]
      }
    });
  });

  // CSP settings 2: Insert CSP meta tag on execution
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:* https://*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';";
      document.head.appendChild(meta);
    `);
  });

  mainWindow.on('ready-to-show', () => {
    // Show main window directly without splash screen
    mainWindow.show();

    // Auto open developer tools
    mainWindow.webContents.openDevTools();
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // CSP settings 3: Allow CORS
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

// Settings save handler
ipcMain.handle('save-settings', async (_, settings: any) => {
  try {
    // Parameter validation
    if (!settings) {
      throw new Error('Invalid settings data: settings is null or undefined');
    }

    // Convert object to JSON string if needed
    let settingsJson: string;
    if (typeof settings === 'string') {
      settingsJson = settings;
    } else if (typeof settings === 'object') {
      settingsJson = JSON.stringify(settings);
    } else {
      throw new Error(`Invalid settings data type: ${typeof settings}`);
    }

    // Add detailed debug log
    console.log('Settings data type:', typeof settings);
    console.log('Settings data to save (partial):', settingsJson.substring(0, 100) + '...');

    // Apply additional encryption
    const encryptedSettings = encrypt(settingsJson);

    // Check and create directory for file
    const settingsDir = join(app.getPath('userData'));
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    // Save settings file
    fs.writeFileSync(settingsFilePath, encryptedSettings);

    console.log('Settings saved successfully:', settingsFilePath);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

// Settings load handler
ipcMain.handle('load-settings', async () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      try {
        const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8');

        // Check if settings file is empty
        if (!encryptedSettings || encryptedSettings.trim() === '') {
          return null;
        }

        // Apply decryption
        const decryptedData = decrypt(encryptedSettings);

        // Check if decrypted data is valid JSON
        try {
          return JSON.parse(decryptedData);
        } catch (jsonError) {
          console.error('Error parsing settings data:', jsonError);
          // 손상된 설정 파일 백업 및 삭제
          const backupPath = `${settingsFilePath}.corrupted.${Date.now()}`;
          fs.copyFileSync(settingsFilePath, backupPath);
          fs.unlinkSync(settingsFilePath);
          console.log(`Corrupted settings file backed up to ${backupPath} and removed`);
          return null;
        }
      } catch (decryptError) {
        console.error('Failed to decrypt settings:', decryptError);
        // 복호화 실패한 설정 파일 백업 및 삭제
        const backupPath = `${settingsFilePath}.backup.${Date.now()}`;
        fs.copyFileSync(settingsFilePath, backupPath);
        fs.unlinkSync(settingsFilePath);
        console.log(`Backup created at ${backupPath} and original settings file removed`);
        return null;
      }
    }
    return null;
  } catch (error: any) {
    console.error('Error loading settings:', error);
    return { success: false, error: error.message };
  }
});

// S3 configuration info handler
ipcMain.handle('get-s3-config', async () => {
  try {
    // Check if settings file exists
    if (fs.existsSync(settingsFilePath)) {
      const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8')
      const settingsData = JSON.parse(decrypt(encryptedSettings))

      // Return S3 related settings
      return {
        bucket: settingsData.s3Bucket || 'my-default-bucket',
        region: settingsData.region || 'ap-northeast-2',
        accessKeyId: settingsData.accessKey || '',
        secretAccessKey: settingsData.secretKey || ''
      }
    }

    // Check if settings file doesn't exist, return default values
    return {
      bucket: 'my-default-bucket',
      region: 'ap-northeast-2',
      accessKeyId: '',
      secretAccessKey: ''
    }
  } catch (error: any) {
    console.error('Error while getting S3 configuration:', error)
    // Return default values when error occurs
    return {
      bucket: 'my-default-bucket',
      region: 'ap-northeast-2',
      accessKeyId: '',
      secretAccessKey: ''
    }
  }
})

// S3 file list handler
ipcMain.handle('list-s3-files', async (_, { bucket, prefix }) => {
  try {
    console.log(`S3 file list request: ${bucket}/${prefix || ''}`);

    // Load AWS credentials from settings
    const encryptedSettings = fs.existsSync(settingsFilePath)
      ? fs.readFileSync(settingsFilePath, 'utf-8')
      : null

    if (!encryptedSettings) {
      throw new Error('AWS credentials not found. Please complete environment setup first.')
    }

    const settings = JSON.parse(decrypt(encryptedSettings))

    // Import AWS SDK and create S3 client
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

    const s3Client = new S3Client({
      region: settings.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: settings.accessKey,
        secretAccessKey: settings.secretKey
      }
    });

    // Create ListObjectsV2 command
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || '',
      Delimiter: '/'
    });

    // Query S3 object list
    const response = await s3Client.send(command);

    // Separate files and folders
    const files = (response.Contents || [])
      .filter(item => !item.Key.endsWith('/') && item.Key !== prefix)
      .map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      }));

    // Folder list (prefix/folder name format)
    const folders = (response.CommonPrefixes || [])
      .map(prefix => prefix.Prefix);

    return { files, folders };
  } catch (error: unknown) {
    console.error('Error while getting S3 file list:', error);
    // Return empty list when error occurs
    return {
      files: [],
      folders: [],
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
})

// File selection dialog handler
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

// Managing active upload tasks (for cancellation)
const activeUploads = new Map();

// Upload cancellation handler
ipcMain.handle('cancel-upload', async (event) => {
  try {
    const senderID = event.sender.id;
    console.log(`Upload cancellation request: sender ID ${senderID}`);

    if (activeUploads.has(senderID)) {
      const uploads = activeUploads.get(senderID);
      console.log(`Number of uploads to cancel: ${uploads.length}`);

      // Abort all active uploads
      for (const upload of uploads) {
        if (upload.abort && typeof upload.abort === 'function') {
          console.log(`Aborting upload: ${upload.key}`);
          await upload.abort();
        }
      }

      // Reset upload list
      activeUploads.delete(senderID);

      // Notify cancellation complete
      event.sender.send('upload-cancelled', { success: true });

      return { success: true };
    } else {
      console.log('No active uploads to cancel');
      return { success: true, message: 'No uploads to cancel' };
    }
  } catch (error) {
    console.error('Error while cancelling upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
});

// S3 file upload handler
ipcMain.handle('upload-file-to-s3', async (event, params: any) => {
  // Upload operation object (used for cancellation)
  let uploadOperation: { key: string; abort: () => Promise<boolean> } | null = null;

  try {
    // Parameter format validation
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be passed as an object');
    }

    const { filePath, bucket, key, accessKeyId, secretAccessKey, region } = params;

    // Parameter validation
    if (!filePath || !bucket || !key) {
      throw new Error('Required parameters are missing (filePath, bucket, key)');
    }

    console.log(`S3 upload request: ${filePath} -> ${bucket}/${key}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    // Get file information
    const fileStats = fs.statSync(filePath);
    console.log(`File size: ${fileStats.size} bytes`);

    // Determine file extension and content type
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    let contentType = 'application/octet-stream'; // Default value

    // Set MIME type based on common file extensions
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

    // Create S3 client
    const s3Client = new S3Client({
      region: region || 'ap-northeast-2',
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || ''
      },
      // Use path style URL (resolves some compatibility issues)
      forcePathStyle: true
    });

    // Large file handling check (5MB or more)
    const NORMAL_UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

    let response;

    // Save sender ID (for cancellation management)
    const senderID = event.sender.id;

    // Initialize upload list for sender if not exists
    if (!activeUploads.has(senderID)) {
      activeUploads.set(senderID, []);
    }

    if (fileStats.size > NORMAL_UPLOAD_LIMIT) {
      console.log(`Starting large file processing - Multi-part upload using (${fileStats.size} bytes)`);

      // @aws-sdk/client-s3 does not directly support multi-part uploads,
      // so we use @aws-sdk/lib-storage to implement
      const { Upload } = require('@aws-sdk/lib-storage');

      const multipartUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: fs.createReadStream(filePath),
          ContentType: contentType
        },
        queueSize: 4, // Number of concurrent upload threads
        partSize: 10 * 1024 * 1024, // Part size (10MB)
        leavePartsOnError: false
      });

      // Add upload operation to active list
      uploadOperation = {
        key,
        abort: async () => {
          try {
            console.log(`Aborting multi-part upload: ${key}`);
            await multipartUpload.abort();

            // Notify abort
            if (event && event.sender) {
              event.sender.send('upload-progress', {
                key,
                cancelled: true,
                percentage: 0
              });
            }

            return true;
          } catch (abortError) {
            console.error('Error aborting upload:', abortError);
            return false;
          }
        }
      };

      activeUploads.get(senderID)?.push(uploadOperation);

      // Report progress
      multipartUpload.on('httpUploadProgress', (progress) => {
        const loaded = progress.loaded || 0;
        const percentage = Math.round((loaded / fileStats.size) * 100);
        console.log(`Upload progress: ${percentage}% (${loaded}/${fileStats.size})`);

        // Send progress to renderer
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
      console.log('Multi-part upload completed');

      // Notify completion
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
      // Use regular upload for small files
      console.log('Starting regular upload');
      const fileContent = fs.readFileSync(filePath);

      // Create upload file ready command
      const uploadParams = {
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType
      };

      // Add regular upload cancellation method
      uploadOperation = {
        key,
        abort: async () => {
          console.log(`Aborting regular upload: ${key}`);
          // Regular upload cannot be aborted immediately - only send cancellation status
          if (event && event.sender) {
            event.sender.send('upload-progress', {
              key,
              cancelled: true
            });
          }
          return true;
        }
      };

      activeUploads.get(senderID)?.push(uploadOperation);

      const command = new PutObjectCommand(uploadParams);
      response = await s3Client.send(command);
      console.log('Regular upload completed');

      // Notify completion
      if (event && event.sender) {
        event.sender.send('upload-progress', {
          key,
          loaded: fileStats.size,
          total: fileStats.size,
          percentage: 100,
          complete: true
        });
      }
    }

    console.log(`File upload completed: ${bucket}/${key}`);

    // Remove completed upload from active list
    if (uploadOperation && senderID) {
      const uploads = activeUploads.get(senderID) || [];
      const index = uploads.findIndex(u => u.key === uploadOperation?.key);
      if (index !== -1) {
        uploads.splice(index, 1);
      }
    }

    // Return successful upload response
    return {
      success: true,
      location: `https://${bucket}.s3.amazonaws.com/${key}`,
      etag: response.ETag
    };
  } catch (error: unknown) {
    console.error('Error uploading file to S3:', error);

    // Remove failed upload from active list
    if (uploadOperation && event?.sender?.id) {
      const senderID = event.sender.id;
      const uploads = activeUploads.get(senderID) || [];
      const index = uploads.findIndex(u => u.key === uploadOperation?.key);
      if (index !== -1) {
        uploads.splice(index, 1);
      }
    }

    // Notify error
    if (event && event.sender) {
      event.sender.send('upload-progress', {
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        failed: true
      });
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
});

// S3 file deletion handler
ipcMain.handle('delete-file-from-s3', async (_, params: any) => {
  try {
    // Parameter validation
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be passed as an object');
    }

    const { bucket, key } = params;

    // Load AWS credentials from settings
    const encryptedSettings = fs.existsSync(settingsFilePath)
      ? fs.readFileSync(settingsFilePath, 'utf-8')
      : null

    if (!encryptedSettings) {
      throw new Error('AWS credentials not found')
    }

    const settings = JSON.parse(decrypt(encryptedSettings))

    // Create S3 client
    const s3Client = new S3Client({
      region: 'ap-northeast-2', // Region setting
      credentials: {
        accessKeyId: settings.accessKey,
        secretAccessKey: settings.secretKey
      }
    })

    // Create file deletion command
    const deleteParams = {
      Bucket: bucket,
      Key: key
    }

    // Delete file from S3
    const command = new DeleteObjectCommand(deleteParams)
    const response = await s3Client.send(command)

    // Try to delete metadata file
    try {
      const metadataKey = `${key}.metadata.json`
      const metadataCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: metadataKey
      })
      await s3Client.send(metadataCommand)
      console.log(`Metadata file also deleted: ${metadataKey}`)
    } catch (err) {
      // Ignore failure to delete metadata file
      console.warn('Failed to delete metadata file:', err)
    }

    return {
      success: true
    }
  } catch (error: any) {
    console.error('Error deleting file from S3:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// File renaming handler
ipcMain.handle('rename-file-in-s3', async (_, params: any) => {
  try {
    const { bucket, oldKey, newKey } = params;

    if (!bucket || !oldKey || !newKey) {
      throw new Error('Missing required parameters (bucket, oldKey, newKey)');
    }

    console.log(`Renaming file from ${oldKey} to ${newKey} in bucket ${bucket}`);

    // S3 uses copy and delete method for renaming files
    const s3Client = new S3Client({
      region: params.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: params.accessKey || '',
        secretAccessKey: params.secretKey || ''
      }
    });

    // Get original object from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: oldKey
    });

    const originalObject = await s3Client.send(getObjectCommand);

    // Copy object to new location
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: newKey,
      Body: originalObject.Body,
      ContentType: originalObject.ContentType
    });

    await s3Client.send(putCommand);

    // Delete original file
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: oldKey
    });

    await s3Client.send(deleteCommand);

    return { success: true };
  } catch (error) {
    console.error('Error renaming file in S3:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Save location selection handler
ipcMain.handle('select-save-location', async (_, params: any) => {
  try {
    // Default file name from params or fallback to generic name
    const defaultPath = params?.defaultPath || join(app.getPath('downloads'), 'downloaded-file');

    const result = await dialog.showSaveDialog({
      title: 'Select File Save Location',
      defaultPath: defaultPath,
      buttonLabel: 'Save',
      properties: ['createDirectory']
    });

    if (result.canceled) {
      return { canceled: true };
    }

    return {
      canceled: false,
      filePath: result.filePath
    };
  } catch (error) {
    console.error('Error selecting save location:', error);
    return {
      canceled: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// S3 file download handler
ipcMain.handle('download-file-from-s3', async (_, params: any) => {
  try {
    const { bucket, key, destination, region, accessKeyId, secretAccessKey } = params;

    if (!bucket || !key || !destination) {
      throw new Error('Missing required parameters (bucket, key, destination)');
    }

    console.log(`Downloading file ${key} from bucket ${bucket} to ${destination}`);

    // Create S3 client
    const s3Client = new S3Client({
      region: params.region || 'ap-northeast-2',
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || ''
      }
    });

    // Get object from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3Client.send(getObjectCommand);

    // Stream to file
    if (response.Body) {
      const fileStream = fs.createWriteStream(destination);

      // @ts-ignore: Body type may not match
      await new Promise((resolve, reject) => {
        // @ts-ignore: Body type may not match
        response.Body.pipe(fileStream)
          .on('error', (err) => {
            reject(err);
          })
          .on('finish', () => {
            resolve(true);
          });
      });

      return { success: true };
    } else {
      throw new Error('Response body is empty');
    }
  } catch (error) {
    console.error('Error downloading file from S3:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Decryption function (AES-256-CBC) - Performance optimization
function decrypt(text: string): string {
  try {
    if (!text || typeof text !== 'string') {
      throw new TypeError('Decryptable data must be a valid string');
    }

    // Separate IV and encrypted data
    const textParts = text.split(':');
    if (textParts.length < 2) {
      throw new Error('Invalid encrypted format - missing IV separator');
    }

    const iv = Buffer.from(textParts.shift() || '', 'hex');
    if (iv.length !== 16) {
      throw new Error('Invalid IV length - must be 16 bytes');
    }

    const encryptedText = textParts.join(':');
    if (!encryptedText || encryptedText.length === 0) {
      throw new Error('Empty encrypted data');
    }

    // Validate input format
    try {
      Buffer.from(encryptedText, 'hex');
    } catch (e) {
      throw new Error('Encrypted data is not valid hex');
    }

    // Use pre-generated key
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error: any) {
    console.error('Decrypt processing details:', {
      error: error.message,
      errorName: error.name,
      stack: error.stack
    });
    throw new Error(`Decrypt processing failed: ${error.message}`);
  }
}

// Encryption function (AES-256-CBC) - Performance optimization
function encrypt(text: string): string {
  try {
    if (!text || typeof text !== 'string') {
      throw new TypeError('Encryptable data must be a valid string');
    }

    const iv = crypto.randomBytes(16); // Initialization vector
    // Use pre-generated key
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted; // Save IV and encrypted data together
  } catch (error: any) {
    throw new Error(`Encrypt processing failed: ${error.message}`);
  }
}

// App start - Create temporary directory
function setupTempDirectory() {
  try {
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
      console.log(`Temporary directory created: ${appTempDir}`);
    }
  } catch (error) {
    console.error('Temporary directory creation failed:', error);
  }
}

// Temporary file creation handler (for large files)
ipcMain.handle('create-temp-file', async (_, { fileName, totalSize }) => {
  try {
    // Create temporary directory if it doesn't exist
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
    }

    // Generate unique file name
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const tempFileName = `${timestamp}-${randomSuffix}-${fileName}`;
    const tempFilePath = join(appTempDir, tempFileName);

    // Create file and reserve size
    fs.writeFileSync(tempFilePath, Buffer.alloc(0));

    // Set file size to specified size (sparse file)
    const fd = fs.openSync(tempFilePath, 'r+');
    fs.ftruncateSync(fd, totalSize);
    fs.closeSync(fd);

    console.log(`Temporary file created: ${tempFilePath} (${totalSize} bytes)`);
    return tempFilePath;
  } catch (error: unknown) {
    console.error('Error creating temporary file:', error);
    return null;
  }
});

// Temporary file data addition handler
ipcMain.handle('append-to-temp-file', async (_, { filePath, buffer, offset }) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File does not exist');
    }

    // Open file (write mode)
    const fileHandle = fs.openSync(filePath, 'r+');

    try {
      // Write data at specified offset
      fs.writeSync(fileHandle, new Uint8Array(buffer), 0, buffer.length, offset);
      return { success: true };
    } finally {
      // Close file handle
      fs.closeSync(fileHandle);
    }
  } catch (error: unknown) {
    console.error('Error appending data to temporary file:', error);
    return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
  }
});

// Temporary file deletion handler
ipcMain.handle('delete-temp-file', async (_, { filePath }) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Temporary file deleted: ${filePath}`);
      return { success: true };
    } else {
      return { success: false, error: 'File does not exist' };
    }
  } catch (error: any) {
    console.error('Error deleting temporary file:', error);
    return { success: false, error: error.message };
  }
});

// Temporary file saving handler
ipcMain.handle('save-temp-file', async (_, params) => {
  try {
    console.log('save-temp-file called:', params);

    // Validation
    if (!params || typeof params !== 'object') {
      throw new Error('Invalid parameters');
    }

    const { buffer, fileName } = params;

    if (!buffer) {
      throw new Error('File data is missing');
    }

    if (!fileName) {
      throw new Error('File name is missing');
    }

    // Create temporary directory if it doesn't exist
    if (!fs.existsSync(appTempDir)) {
      fs.mkdirSync(appTempDir, { recursive: true });
    }

    // Generate unique file name (timestamp + random + original file name)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const tempFileName = `${timestamp}-${randomSuffix}-${fileName}`;
    const tempFilePath = join(appTempDir, tempFileName);

    console.log(`Temporary file creation in progress: ${tempFilePath} (${buffer.byteLength} bytes)`);

    // Save file
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    console.log(`Temporary file creation completed: ${tempFilePath}`);
    return tempFilePath;
  } catch (error: unknown) {
    console.error('Error saving temporary file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
});

// App exit - Clean up temporary directory
function cleanupTempDirectory() {
  try {
    if (fs.existsSync(appTempDir)) {
      fs.rmSync(appTempDir, { recursive: true, force: true });
      console.log(`Temporary directory deleted: ${appTempDir}`);
    }
  } catch (error: unknown) {
    console.error('Temporary directory deletion failed:', error);
  }
}

// Update check request handler
ipcMain.handle('check-for-updates', async () => {
  if (!is.dev) {
    autoUpdater.checkForUpdates();
  }
});

// Update check function
const checkForUpdates = async () => {
  try {
    const updateUrl = process.env.UPDATE_URL || 'https://nbase-io.github.io/studio/patches/electron-update.yml'
    const response = await fetch(updateUrl)
    const data = await response.json()

    const currentVersion = app.getVersion()
    if (data.version !== currentVersion) {
      const dialogOpts: Electron.MessageBoxOptions = {
        type: 'info',
        buttons: ['Download', 'Later'],
        title: 'Update Available',
        message: 'A new version is available. Would you like to download it now?',
        detail: `Current version: ${currentVersion}\nNew version: ${data.version}`
      }

      const { response } = await dialog.showMessageBox(dialogOpts)
      if (response === 0) {
        shell.openExternal(`https://nbase-io.github.io/studio/patches/${data.path}`)
      }
    }
  } catch (error) {
    console.error('Update check failed:', error)
  }
}

// App version info request handler
ipcMain.handle('get-app-version', () => {
  return {
    version: app.getVersion()
  };
});

// App startup - Clear temporary files
app.whenReady().then(() => {
  setupTempDirectory();
  clearTempFiles();

  // 손상된 설정 파일이 있는지 확인하고 처리
  try {
    if (fs.existsSync(settingsFilePath)) {
      try {
        const encryptedSettings = fs.readFileSync(settingsFilePath, 'utf-8');
        if (encryptedSettings && encryptedSettings.trim() !== '') {
          try {
            const decryptedData = decrypt(encryptedSettings);
            // 복호화 성공 시 파싱 테스트
            JSON.parse(decryptedData);
            console.log('Settings file integrity check passed');
          } catch (error) {
            console.error('Settings file corrupted, backing up and removing:', error);
            const backupPath = `${settingsFilePath}.corrupted.${Date.now()}`;
            fs.copyFileSync(settingsFilePath, backupPath);
            fs.unlinkSync(settingsFilePath);
            console.log(`Corrupted settings backed up to ${backupPath} and removed`);
          }
        }
      } catch (error) {
        console.error('Failed to read settings file:', error);
      }
    }
  } catch (error) {
    console.error('Error during settings verification:', error);
  }

  // Intercept file:// protocol for security
  protocol.interceptFileProtocol('file', (request, callback) => {
    const url = request.url.substring(7); // Remove 'file://' prefix
    callback({ path: url });
  });

  // Create main window after app is ready
  createWindow();

  // Event handler for application activation
  app.on('activate', () => {
    // On macOS, recreate window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Close handler - Clean up before exit
app.on('before-quit', () => {
  // Make sure to clean up active uploads
  activeUploads.forEach((uploads, senderID) => {
    uploads.forEach(upload => {
      console.log(`Aborting upload for ${upload.key} during app quit`);
      upload.abort();
    });
  });

  // Clear temp directory
  clearTempFiles();
});

// Cleanup all temporary files
function clearTempFiles() {
  try {
    if (fs.existsSync(appTempDir)) {
      const files = fs.readdirSync(appTempDir);
      for (const file of files) {
        const filePath = join(appTempDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete ${filePath}:`, err);
        }
      }
      console.log(`Cleared ${files.length} temporary files`);
    }
  } catch (error) {
    console.error('Error clearing temporary files:', error);
  }
}

// All window close event handler (macOS specific)
app.on('window-all-closed', () => {
  // Quit application on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle IPC errors globally
ipcMain.on('error', (_, error) => {
  console.error('IPC Error:', error);

  // Show error dialog for critical errors
  if (win) {
    dialog.showErrorBox('Application Error',
      error.message || 'An unknown error occurred');
  }
});

// 앱 종료 이벤트 핸들러
ipcMain.on('quit-app', () => {
  console.log('Quit app command received, forcing application exit');
  try {
    // 열려있는 모든 창 닫기
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      window.destroy();
    }

    // 앱 종료 (강제)
    app.exit(0);
  } catch (error) {
    console.error('Failed to quit app:', error);
    // 실패 시 process.exit로 강제 종료
    process.exit(0);
  }
});

// 앱 강제 종료 이벤트 핸들러
ipcMain.on('force-quit', () => {
  console.log('Force quit command received, exiting immediately');
  process.exit(0);
});

// Prevent crash from unhandled rejections
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at Promise:', p, 'reason:', reason);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  // Show error dialog
  if (win) {
    dialog.showErrorBox('Critical Error',
      `An uncaught exception occurred: ${error.message}`);
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
