import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupUpdaterHandlers } from './updaterHandler'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { URL } from 'url'
import admZip from 'adm-zip'

// ===========================================
// 전역 상태 관리
// ===========================================

// 다운로드 관련 전역 상태 관리
interface DownloadState {
  isInProgress: boolean
  isCancelled: boolean
  response: http.IncomingMessage | null
  writeStream: fs.WriteStream | null
  lastProgressUpdate: number
  downloadedChunks: number[]
  tempDir: string | null
  headers: http.OutgoingHttpHeaders
  abortController: AbortController | null
  startTime: number
  resumePosition: number
}

let downloadState: DownloadState = {
  isInProgress: false,
  isCancelled: false,
  response: null,
  writeStream: null,
  lastProgressUpdate: 0,
  downloadedChunks: [],
  tempDir: null,
  headers: {},
  abortController: null,
  startTime: 0,
  resumePosition: 0
}

// 이어받기 확인 결과 인터페이스
interface ResumeCheckResult {
  canResume: boolean
  filePath: string
  downloadedBytes: number
  totalBytes: number
  reason: string
}

// 다운로드 상태 초기화 함수
function resetDownloadState(): void {
  downloadState = {
    isInProgress: false,
    isCancelled: false,
    response: null,
    writeStream: null,
    lastProgressUpdate: 0,
    downloadedChunks: [],
    tempDir: null,
    headers: {},
    abortController: null,
    startTime: 0,
    resumePosition: 0
  }
}

// 다운로드 파일 경로 생성
function getDownloadFilePath(fileUrl: string): string {
  const fileName = new URL(fileUrl).pathname.split('/').pop() || 'download'
  return path.join(app.getPath('downloads'), fileName)
}

// URL 범위 지원 여부 확인
async function checkRangeSupport(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const signal = controller.signal

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Range': 'bytes=0-0'
      },
      signal
    })

    setTimeout(() => controller.abort(), 5000) // 5초 타임아웃

    return response.status === 206 ||
           response.headers.has('Accept-Ranges') &&
           response.headers.get('Accept-Ranges') !== 'none'
  } catch (error) {
    console.error('범위 지원 확인 오류:', error)
    return false
  }
}

// 다운로드 관련 IPC 핸들러 추가
function setupDownloadHandlers(mainWindow: BrowserWindow): void {
  let activeDownload: {
    url: string;
    targetPath: string;
    startTime: number;
    resumeStartBytes: number;
    cancel: () => void;
  } | null = null;

  // 다운로드 초기화 및 진행 상태 확인
  ipcMain.handle('initialize-download', async (event, fileUrl: string, shouldCleanup: boolean) => {
    // 이미 다운로드 중인지 확인
    if (activeDownload) {
      return {
        success: false,
        isAlreadyRunning: true
      };
    }

    try {
      // 임시 파일 경로 설정
      const tempDir = path.join(app.getPath('temp'), 'app-downloads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const filename = path.basename(fileUrl);
      const filePath = path.join(tempDir, filename);

      // 이어받기 확인
      let canResume = false;
      let resumeInfo = null;

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          try {
            // HEAD 요청으로 총 크기 확인
            const response = await fetch(fileUrl, { method: 'HEAD' });
            if (response.ok && response.headers.has('content-length')) {
              const totalBytes = parseInt(response.headers.get('content-length')!, 10);

              // 이어받기 정보 설정
              canResume = true;
              resumeInfo = {
                filePath,
                downloadedBytes: stats.size,
                totalBytes
              };
            }
          } catch (error) {
            console.error('Error checking file size:', error);
          }
        }
      }

      return {
        success: true,
        canResume,
        resumeInfo
      };
    } catch (error) {
      console.error('Error initializing download:', error);
      return {
        success: false,
        error: String(error)
      };
    }
  });

  // 다운로드 및 압축 해제
  ipcMain.handle('download-and-extract', async (event, fileUrl: string, targetFolder: string) => {
    // 이미 다운로드 중인지 확인
    if (activeDownload) {
      throw new Error('Download is already in progress');
    }

    try {
      // 다운로드 경로 설정
      const tempDir = path.join(app.getPath('temp'), 'app-downloads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const filename = path.basename(fileUrl);
      const filePath = path.join(tempDir, filename);

      // 타겟 폴더 확인
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      // 이전 다운로드 파일 정리 (항상 새로 다운로드하도록)
      console.log(`다운로드 시작 전 이전 임시 파일 확인: ${filePath}`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`이전 다운로드 파일 삭제됨: ${filePath}`);
        } catch (error) {
          console.error(`이전 다운로드 파일 삭제 실패: ${filePath}`, error);
          throw new Error(`이전 다운로드 파일을 삭제할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 항상 처음부터 다운로드 (이어받기 제거)
      let startBytes = 0;
      let totalBytes = 0;

      // 기존 파일이 있으면 삭제
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // 다운로드 시작
      const controller = new AbortController();
      const signal = controller.signal;

      // 다운로드 요청 함수
      const startDownload = async (): Promise<Response> => {
        // 다운로드 시작시 진행률 0% 표시
        mainWindow.webContents.send('download-progress', {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          bytesPerSecond: 0,
          remaining: 0
        });

        return fetch(fileUrl, {
          method: 'GET',
          signal
        });
      };

      // 다운로드 시작
      let response = await startDownload();

      if (!response.ok) {
        // 오류 발생 시 다운로드 상태 초기화
        activeDownload = null;
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 총 크기 확인
      if (response.headers.has('content-length')) {
        const contentLength = parseInt(response.headers.get('content-length')!, 10);
        totalBytes = contentLength;
      }

      // 다운로드 상태 저장
      const startTime = Date.now();
      activeDownload = {
        url: fileUrl,
        targetPath: targetFolder,
        startTime,
        resumeStartBytes: 0,
        cancel: () => controller.abort()
      };

      // 스트림 생성
      const fileStream = fs.createWriteStream(filePath);
      const reader = response.body!.getReader();

      // 다운로드된 바이트 수
      let receivedBytes = 0;
      let lastProgressTime = Date.now();
      let lastProgressBytes = 0;

      // 다운로드 진행 상황 처리
      const processDownload = async (): Promise<string> => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // 파일에 데이터 쓰기
            try {
              fileStream.write(Buffer.from(value));
            } catch (writeError) {
              // 파일 쓰기 오류 발생 시 다운로드 상태 초기화
              activeDownload = null;
              throw writeError;
            }
            receivedBytes += value.length;

            // 다운로드 속도 계산
            const now = Date.now();
            const elapsedSinceLastProgress = (now - lastProgressTime) / 1000;

            if (elapsedSinceLastProgress >= 0.5) { // 최소 0.5초 간격으로 업데이트
              const bytesPerSecond = (receivedBytes - lastProgressBytes) / elapsedSinceLastProgress;
              const remaining = bytesPerSecond > 0 ? (totalBytes - receivedBytes) / bytesPerSecond : 0;

              // 진행률 계산 - 총 크기가 0이면 0%로 표시
              let percent = 0;
              if (totalBytes > 0) {
                percent = Math.floor((receivedBytes / totalBytes) * 100);
                // 진행률이 100을 넘지 않도록 제한
                percent = Math.min(percent, 99);
              }

              // 진행 상황 전송
              mainWindow.webContents.send('download-progress', {
                percent,
                transferredBytes: receivedBytes,
                totalBytes,
                bytesPerSecond,
                remaining
              });

              // 마지막 진행 상태 업데이트
              lastProgressTime = now;
              lastProgressBytes = receivedBytes;
            }
          }

          // 파일 닫기
          fileStream.end();

          // 다운로드 완료 시 마지막 진행 상황 전송
          mainWindow.webContents.send('download-progress', {
            percent: 100,
            transferredBytes: totalBytes,
            totalBytes,
            bytesPerSecond: 0,
            remaining: 0
          });

          // 다운로드 파일 확인 - 실패 시 오류 발생
          if (!fs.existsSync(filePath)) {
            // 다운로드 상태 초기화
            resetDownloadState();
            activeDownload = null;
            throw new Error('다운로드 실패: 파일을 찾을 수 없습니다');
          }

          // 파일 크기 확인 - 0바이트 파일은 실패로 처리
          const fileStats = fs.statSync(filePath);
          if (fileStats.size === 0) {
            // 다운로드 상태 초기화
            resetDownloadState();
            activeDownload = null;
            throw new Error('다운로드 실패: 파일 크기가 0입니다');
          }

          // 다운로드 성공, 압축 해제 시작
          console.log(`다운로드 성공: ${filePath} (${fileStats.size} 바이트), 압축 해제 시작`);

          // 압축 파일 유효성 검사
          try {
            // ZIP 파일 헤더 확인 (ZIP 파일은 'PK'로 시작)
            const buffer = Buffer.alloc(4);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            const isPKZip = buffer[0] === 0x50 && buffer[1] === 0x4B;
            if (!isPKZip) {
              resetDownloadState();
              activeDownload = null;
              throw new Error('다운로드한 파일이 유효한 ZIP 파일이 아닙니다');
            }
          } catch (error) {
            resetDownloadState();
            activeDownload = null;
            throw new Error(`압축 파일 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
          }

          // 압축 해제 시작
          mainWindow.webContents.send('extract-progress', {
            percent: 0,
            extracted: 0,
            total: 100
          });

          // 압축 해제 (실제 압축 해제 내용에 맞게 수정 필요)
          // admZip 라이브러리로 압축 해제 방식 변경
          try {
            const zip = new admZip(filePath);
            const zipEntries = zip.getEntries();
            const totalEntries = zipEntries.length;

            // 진행 상황 업데이트를 위한 카운터
            let extractedCount = 0;

            // 각 항목 하나씩 처리
            for (const entry of zipEntries) {
              try {
                // 디렉토리 항목은 건너뛰기
                if (entry.isDirectory) {
                  continue;
                }

                // 대상 파일 경로
                const entryPath = path.join(targetFolder, entry.entryName);
                const entryDir = path.dirname(entryPath);

                // 대상 디렉토리 생성
                if (!fs.existsSync(entryDir)) {
                  fs.mkdirSync(entryDir, { recursive: true });
                }

                // 파일이 이미 존재하는 경우 먼저 삭제
                if (fs.existsSync(entryPath)) {
                  try {
                    fs.unlinkSync(entryPath);
                  } catch (error) {
                    console.warn(`기존 파일 삭제 실패: ${entryPath}`, error);
                  }
                }

                // 파일 추출
                try {
                  const entryData = entry.getData();
                  fs.writeFileSync(entryPath, entryData, { flag: 'w' });
                  console.log(`파일 추출됨: ${entryPath}`);
                } catch (writeError) {
                  console.error(`파일 쓰기 실패: ${entryPath}`, writeError);
                  // 실패해도 계속 진행
                }

                // 카운터 증가 및 진행 상황 업데이트
                extractedCount++;

                // 20개 항목마다 또는 마지막 항목에서 진행 상황 보고
                if (extractedCount % 20 === 0 || extractedCount === totalEntries) {
                  const percent = Math.floor((extractedCount / totalEntries) * 100);
                  mainWindow.webContents.send('extract-progress', {
                    percent,
                    extracted: extractedCount,
                    total: totalEntries
                  });
                }
              } catch (error) {
                console.error(`항목 압축 해제 실패: ${entry.entryName}`, error);
              }
            }

            // 압축 해제 완료 메시지
            mainWindow.webContents.send('extract-progress', {
              percent: 100,
              extracted: totalEntries,
              total: totalEntries
            });

            // 다운로드 상태 초기화
            resetDownloadState();

            // 압축 해제 완료 로그
            console.log(`압축 해제 완료 - 총 ${extractedCount}/${totalEntries} 파일 처리됨`);

            return targetFolder;
          } catch (zipError) {
            console.error('압축 파일 처리 중 심각한 오류:', zipError);

            // 오류의 스택 트레이스도 함께 기록
            if (zipError instanceof Error && zipError.stack) {
              console.error('스택 트레이스:', zipError.stack);
            }

            // 파일 내용 확인 (첫 100바이트)
            try {
              const fileHeader = fs.readFileSync(filePath, { encoding: 'hex', flag: 'r' }).slice(0, 200);
              console.error('파일 헤더 (HEX):', fileHeader);
            } catch (readError) {
              console.error('파일 헤더 읽기 실패:', readError);
            }

            // 오류 시 다운로드 상태 초기화
            resetDownloadState();
            activeDownload = null;

            throw new Error(`압축 파일 처리 실패: ${zipError instanceof Error ? zipError.message : String(zipError)}`);
          }
        } catch (error) {
          // 에러 발생 시 스트림 닫기
          fileStream.end();

          // 다운로드 상태 초기화
          resetDownloadState();

          throw error;
        }
      };

      // 다운로드 처리 시작
      const result = await processDownload();
      return result;

    } catch (error) {
      // 다운로드 상태 초기화
      resetDownloadState();
      console.error('Download error:', error);
      throw error;
    }
  });

  // 다운로드 취소
  ipcMain.handle('cancel-download', async () => {
    if (activeDownload) {
      activeDownload.cancel();

      // 취소된 다운로드의 임시 파일 삭제
      try {
        const tempDir = path.join(app.getPath('temp'), 'app-downloads');
        const filename = path.basename(activeDownload.url);
        const filePath = path.join(tempDir, filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`취소된 다운로드 파일 삭제: ${filePath}`);
        }
      } catch (error) {
        console.error('취소된 다운로드 파일 삭제 실패:', error);
      }

      activeDownload = null;
      return true;
    }
    return false;
  });

  // 이어받기 가능 여부 확인
  ipcMain.handle('check-resume-available', async (event, fileUrl: string) => {
    // 이어받기 기능 제거로 항상 false 반환
    return {
      canResume: false,
      reason: 'Resume functionality is disabled'
    };
  });

  // 다운로드 이벤트 전송
  ipcMain.handle('send-download-event', async (event, downloadEvent) => {
    // 여기서 다운로드 이벤트를 외부 서비스에 보내는 로직을 구현할 수 있습니다
    console.log('Download event:', downloadEvent);
    return;
  });
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
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

  // 업데이트 핸들러 설정
  setupUpdaterHandlers(mainWindow)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 다운로드 핸들러 설정
  setupDownloadHandlers(mainWindow)

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // 단일 인스턴스 제한 (중복 실행 방지)
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    // 이미 다른 인스턴스가 실행 중이면 현재 인스턴스 종료
    console.log('이미 다른 인스턴스가 실행 중입니다. 프로그램을 종료합니다.')
    app.quit()
    return
  }

  // 두 번째 인스턴스가 시작될 때 기존 창에 포커스
  app.on('second-instance', () => {
    console.log('두 번째 인스턴스 감지: 기존 창을 활성화합니다.')
    const windows = BrowserWindow.getAllWindows()
    if (windows.length) {
      const mainWindow = windows[0]
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()

      // 실행 중인 창에 알림 메시지 보내기
      mainWindow.webContents.send('second-instance-detected')
    }
  })

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

  // 메인 윈도우 생성
  const mainWindow = createWindow()

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
