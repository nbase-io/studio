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
import util from 'util'

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

// 파일 삭제 함수
function cleanupDownloadFile(fileUrl: string): void {
  const filePath = getDownloadFilePath(fileUrl)
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      console.error('파일 삭제 오류:', error)
    }
  }
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

// 파일 이어받기 가능 여부 확인
async function checkFileResumable(fileUrl: string): Promise<ResumeCheckResult> {
  const filePath = getDownloadFilePath(fileUrl)

  // 파일이 존재하지 않으면 이어받기 불가능
  if (!fs.existsSync(filePath)) {
    return {
      canResume: false,
      filePath,
      downloadedBytes: 0,
      totalBytes: 0,
      reason: '기존 파일이 존재하지 않습니다'
    }
  }

  try {
    // 파일 크기 확인
    const stats = fs.statSync(filePath)
    const downloadedBytes = stats.size

    if (downloadedBytes === 0) {
      return {
        canResume: false,
        filePath,
        downloadedBytes: 0,
        totalBytes: 0,
        reason: '이전 다운로드 파일이 비어 있습니다'
      }
    }

    // 서버 범위 요청 지원 여부 확인
    const supportsRange = await checkRangeSupport(fileUrl)
    if (!supportsRange) {
      return {
        canResume: false,
        filePath,
        downloadedBytes,
        totalBytes: 0,
        reason: '서버가 범위 요청을 지원하지 않습니다'
      }
    }

    // HEAD 요청으로 파일 총 크기 확인
    const controller = new AbortController()
    const signal = controller.signal

    const response = await fetch(fileUrl, {
      method: 'HEAD',
      signal
    })

    setTimeout(() => controller.abort(), 5000) // 5초 타임아웃

    if (!response.ok) {
      return {
        canResume: false,
        filePath,
        downloadedBytes,
        totalBytes: 0,
        reason: `서버 응답 오류: ${response.status} ${response.statusText}`
      }
    }

    const contentLength = response.headers.get('Content-Length')
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0

    // 이미 완전히 다운로드된 파일인지 확인
    if (totalBytes > 0 && downloadedBytes >= totalBytes) {
      return {
        canResume: false,
        filePath,
        downloadedBytes,
        totalBytes,
        reason: '파일이 이미 완전히 다운로드되었습니다'
      }
    }

    return {
      canResume: true,
      filePath,
      downloadedBytes,
      totalBytes,
      reason: '이어받기 가능'
    }
  } catch (error) {
    console.error('이어받기 확인 오류:', error)
    return {
      canResume: false,
      filePath,
      downloadedBytes: 0,
      totalBytes: 0,
      reason: `오류 발생: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// 파일 다운로드 함수
function downloadFile(
  fileUrl: string,
  filePath: string,
  mainWindow: BrowserWindow
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // 다운로드 상태 초기화
      resetDownloadState()
      downloadState.isInProgress = true
      downloadState.startTime = Date.now()
      downloadState.abortController = new AbortController()

      console.log(`다운로드 시작: ${fileUrl}`)

      // 폴더 경로 확인 및 생성
      const directory = path.dirname(filePath)
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true })
      }

      // 리다이렉션을 따라가는 함수
      const followRedirects = (url: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          return reject(new Error(`너무 많은 리다이렉션 발생 (주소: ${url})`))
        }

        const parsedUrl = new URL(url)
        const options: http.RequestOptions = {
          method: 'GET',
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            'User-Agent': 'Mozilla/5.0 Electron Downloader'
          },
          timeout: 30000 // 30초 타임아웃
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http
        const request = protocol.request(options, (response) => {
          downloadState.response = response

          // 리다이렉션 확인 (300번대 응답)
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            const location = response.headers.location

            if (!location) {
              return reject(new Error(`리다이렉션 응답(${response.statusCode})에 Location 헤더가 없습니다 (주소: ${url})`))
            }

            // 리다이렉션 URL이 상대 경로인 경우 절대 경로로 변환
            const redirectUrl = /^https?:\/\//i.test(location)
              ? location
              : new URL(location, parsedUrl.origin).href

            console.log(`리다이렉션 발생: ${url} -> ${redirectUrl}`)

            // 연결 정리
            response.destroy()

            // 새 URL로 재귀적으로 리다이렉션 처리
            return followRedirects(redirectUrl, redirectCount + 1)
          }

          // 성공 응답 코드 확인
          if (response.statusCode !== 200) {
            downloadState.isInProgress = false
            return reject(new Error(`다운로드 실패: 서버 응답 ${response.statusCode}\n주소: ${url}`))
          }

          // Content-Length 확인
          const contentLength = response.headers['content-length']
          const totalBytes = contentLength ? parseInt(contentLength, 10) : 0

          // 파일 스트림 설정
          const writeStream = fs.createWriteStream(filePath)
          downloadState.writeStream = writeStream

          // 스트림 오류 처리
          writeStream.on('error', (error) => {
            downloadState.isInProgress = false
            reject(new Error(`파일 쓰기 오류: ${error.message}`))
          })

          // 데이터 처리
          response.on('data', (chunk) => {
            if (downloadState.isCancelled) {
              response.destroy()
              writeStream.close()
              return resolve(false)
            }

            downloadState.downloadedChunks.push(chunk.length)
            if (downloadState.downloadedChunks.length > 100) {
              downloadState.downloadedChunks.shift()
            }

            // 진행 상황 업데이트 (1초에 한 번)
            const now = Date.now()
            const elapsedMs = now - downloadState.lastProgressUpdate

            if (elapsedMs >= 1000) {
              // 이동 평균을 사용하여 다운로드 속도 계산
              const recentChunks = downloadState.downloadedChunks.slice(-10)
              const bytesInLastSecond = recentChunks.reduce((sum, size) => sum + size, 0)
              const bytesPerSecond = elapsedMs > 0 ? (bytesInLastSecond * 1000) / Math.min(elapsedMs, 10000) : 0

              const transferredBytes = writeStream.bytesWritten
              const percent = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0

              const remaining = bytesPerSecond > 0
                ? Math.round((totalBytes - transferredBytes) / bytesPerSecond)
                : 0

              mainWindow.webContents.send('download-progress', {
                percent,
                transferredBytes,
                totalBytes,
                bytesPerSecond,
                remaining
              })

              downloadState.lastProgressUpdate = now
            }
          })

          // 오류 처리
          response.on('error', (error) => {
            writeStream.close()
            downloadState.isInProgress = false
            reject(new Error(`다운로드 중 오류 발생: ${error.message}`))
          })

          // 완료 처리
          response.on('end', () => {
            writeStream.end(() => {
              if (!downloadState.isCancelled) {
                downloadState.isInProgress = false
                resolve(true)
              } else {
                resolve(false)
              }
            })
          })

          // 응답 파이프
          response.pipe(writeStream)
        })

        // 요청 오류
        request.on('error', (error) => {
          downloadState.isInProgress = false
          reject(new Error(`다운로드 요청 실패 (주소: ${url}): ${error.message}`))
        })

        // 요청 종료
        request.end()
      }

      // 리다이렉션 처리 시작
      followRedirects(fileUrl)
    } catch (error) {
      downloadState.isInProgress = false
      reject(new Error(`다운로드 처리 오류 (주소: ${fileUrl}): ${error instanceof Error ? error.message : String(error)}`))
    }
  })
}

// 이어받기 함수
function resumeDownload(
  fileUrl: string,
  filePath: string,
  startPosition: number,
  mainWindow: BrowserWindow
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // 다운로드 상태 초기화
      resetDownloadState()
      downloadState.isInProgress = true
      downloadState.startTime = Date.now()
      downloadState.resumePosition = startPosition
      downloadState.abortController = new AbortController()

      console.log(`이어받기 시작: ${fileUrl}, 위치: ${startPosition}`)

      // 리다이렉션을 따라가는 함수
      const followRedirects = (url: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          return reject(new Error(`너무 많은 리다이렉션 발생 (주소: ${fileUrl})`))
        }

        const parsedUrl = new URL(url)
        const options: http.RequestOptions = {
          method: 'GET',
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            'Range': `bytes=${startPosition}-`,
            'User-Agent': 'Mozilla/5.0 Electron Downloader'
          },
          timeout: 30000 // 30초 타임아웃
        }

        const protocol = parsedUrl.protocol === 'https:' ? https : http
        const request = protocol.request(options, (response) => {
          downloadState.response = response

          // 리다이렉션 확인 (300번대 응답)
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            const location = response.headers.location

            if (!location) {
              return reject(new Error(`리다이렉션 응답(${response.statusCode})에 Location 헤더가 없습니다 (주소: ${url})`))
            }

            // 리다이렉션 URL이 상대 경로인 경우 절대 경로로 변환
            const redirectUrl = /^https?:\/\//i.test(location)
              ? location
              : new URL(location, parsedUrl.origin).href

            console.log(`리다이렉션 발생: ${url} -> ${redirectUrl}`)

            // 연결 정리
            response.destroy()

            // 새 URL로 재귀적으로 리다이렉션 처리
            return followRedirects(redirectUrl, redirectCount + 1)
          }

          // 응답 코드 확인 (206 = Partial Content)
          if (response.statusCode !== 206) {
            downloadState.isInProgress = false
            return reject(new Error(`이어받기 실패: 서버 응답 ${response.statusCode}\n주소: ${url}`))
          }

          // Content-Length 확인
          const contentLength = response.headers['content-length']
          const totalBytes = contentLength
            ? parseInt(contentLength, 10) + startPosition
            : 0

          // 파일 스트림 설정 (이어쓰기 모드)
          const writeStream = fs.createWriteStream(filePath, { flags: 'a' })
          downloadState.writeStream = writeStream

          // 스트림 오류 처리
          writeStream.on('error', (error) => {
            downloadState.isInProgress = false
            reject(new Error(`파일 쓰기 오류: ${error.message}`))
          })

          // 데이터 처리
          response.on('data', (chunk) => {
            if (downloadState.isCancelled) {
              response.destroy()
              writeStream.close()
              return resolve(false)
            }

            downloadState.downloadedChunks.push(chunk.length)
            if (downloadState.downloadedChunks.length > 100) {
              downloadState.downloadedChunks.shift()
            }

            // 진행 상황 업데이트 (1초에 한 번)
            const now = Date.now()
            const elapsedMs = now - downloadState.lastProgressUpdate

            if (elapsedMs >= 1000) {
              // 속도 계산
              const lastChunks = downloadState.downloadedChunks.slice(-20)
              const bytesInLastSecond = lastChunks.reduce((sum, size) => sum + size, 0)
              const bytesPerSecond = elapsedMs > 0
                ? (bytesInLastSecond * 1000) / Math.min(elapsedMs, 20000)
                : 0

              const transferredBytes = startPosition + writeStream.bytesWritten
              const percent = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0

              const remaining = bytesPerSecond > 0
                ? Math.round((totalBytes - transferredBytes) / bytesPerSecond)
                : 0

              mainWindow.webContents.send('download-progress', {
                percent,
                transferredBytes,
                totalBytes,
                bytesPerSecond,
                remaining,
                isResumed: true
              })

              downloadState.lastProgressUpdate = now
            }
          })

          // 오류 처리
          response.on('error', (error) => {
            writeStream.close()
            downloadState.isInProgress = false
            reject(new Error(`다운로드 중 오류 발생: ${error.message}`))
          })

          // 완료 처리
          response.on('end', () => {
            writeStream.end(() => {
              if (!downloadState.isCancelled) {
                downloadState.isInProgress = false
                resolve(true)
              } else {
                resolve(false)
              }
            })
          })

          // 응답 파이프
          response.pipe(writeStream)
        })

        // 요청 오류
        request.on('error', (error) => {
          downloadState.isInProgress = false
          reject(new Error(`이어받기 요청 실패 (주소: ${url}): ${error.message}`))
        })

        // 요청 종료
        request.end()
      }

      // 리다이렉션 처리 시작
      followRedirects(fileUrl)
    } catch (error) {
      downloadState.isInProgress = false
      reject(new Error(`이어받기 처리 오류 (주소: ${fileUrl}): ${error instanceof Error ? error.message : String(error)}`))
    }
  })
}

// 압축 해제 함수
async function extractFile(
  filePath: string,
  targetFolder: string,
  mainWindow: BrowserWindow
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // 압축 해제 대상 폴더 생성
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true })
      }

      // 파일 확장자 확인
      const fileExt = path.extname(filePath).toLowerCase();

      // ZIP 파일이 아닌 경우 단순 복사
      if (fileExt !== '.zip') {
        try {
          const fileName = path.basename(filePath);
          const targetPath = path.join(targetFolder, fileName);
          fs.copyFileSync(filePath, targetPath);
          console.log(`압축 파일이 아님: ${filePath}를 ${targetPath}로 복사했습니다.`);
          resolve(targetFolder);
          return;
        } catch (error) {
          console.error('파일 복사 오류:', error);
          reject(new Error(`파일 복사 실패: ${error instanceof Error ? error.message : String(error)}`));
          return;
        }
      }

      // 최상위 디렉토리만 만들고 하위 파일들을 일괄 복사하는 방식
      const tempFolder = path.join(app.getPath('temp'), `extract-temp-${Date.now()}`);
      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder, { recursive: true });
      }

      try {
        // 파일 스트림으로 읽어서 임시 zip 파일 생성
        const tempZipPath = path.join(tempFolder, 'temp.zip');
        fs.copyFileSync(filePath, tempZipPath);

        // 임시 폴더에 zip 파일 내용을 먼저 추출
        console.log(`안전 모드로 압축 해제 시작: ${tempZipPath}`);

        let zip;
        try {
          zip = new admZip(tempZipPath);
        } catch (error) {
          console.error('ZIP 파일 열기 오류:', error);
          const fileName = path.basename(filePath);
          const targetPath = path.join(targetFolder, fileName);
          fs.copyFileSync(filePath, targetPath);
          console.log(`ZIP으로 열 수 없음: ${filePath}를 ${targetPath}로 복사했습니다.`);

          // 임시 폴더 정리
          cleanupTempFolder(tempFolder);

          resolve(targetFolder);
          return;
        }

        // 특수 파일 경로를 포함하지 않는 안전한 파일만 필터링
        const safeEntries = zip.getEntries().filter(entry => {

          // 위험한 경로 스킵
          if (entry.entryName.includes('..') ||
              entry.entryName.startsWith('/') ||
              entry.entryName.includes(':')) {
            console.log(`위험한 경로 건너뜀: ${entry.entryName}`);
            return false;
          }

          return true;
        });

        // 진행 상황 전송 함수
        const updateProgress = (current: number, total: number) => {
          const percent = Math.round((current / total) * 100);
          mainWindow.webContents.send('extract-progress', {
            percent,
            extracted: current,
            total
          });
        };

        // 안전한 파일만 하나씩 추출
        const totalFiles = safeEntries.length;
        let extractedFiles = 0;

        // 파일 수가 적으면 모든 작업을 한 번에 수행
        if (totalFiles < 5) {
          for (const entry of safeEntries) {
            if (!entry.isDirectory) {
              try {
                const entryPath = path.join(targetFolder, entry.entryName);
                const dirPath = path.dirname(entryPath);

                if (!fs.existsSync(dirPath)) {
                  fs.mkdirSync(dirPath, { recursive: true });
                }

                fs.writeFileSync(entryPath, entry.getData());
                extractedFiles++;
                updateProgress(extractedFiles, totalFiles);
              } catch (entryError) {
                console.warn(`항목 처리 건너뜀: ${entry.entryName}`, entryError);
              }
            }
          }
        } else {
          // 많은 파일은 배치로 처리
          const batchSize = 10;
          for (let i = 0; i < totalFiles; i += batchSize) {
            const batch = safeEntries.slice(i, i + batchSize);

            for (const entry of batch) {
              if (!entry.isDirectory && !downloadState.isCancelled) {
                try {
                  const entryPath = path.join(targetFolder, entry.entryName);
                  const dirPath = path.dirname(entryPath);

                  if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                  }

                  fs.writeFileSync(entryPath, entry.getData());
                  extractedFiles++;
                } catch (entryError) {
                  console.warn(`항목 처리 건너뜀: ${entry.entryName}`, entryError);
                }
              }
            }

            // 배치마다 진행 상황 업데이트
            updateProgress(extractedFiles, totalFiles);

            // 취소 확인
            if (downloadState.isCancelled) {
              console.log('압축 해제 취소됨');
              break;
            }
          }
        }

        console.log(`압축 해제 완료: ${extractedFiles}/${totalFiles} 파일`);

        // 임시 폴더 정리
        cleanupTempFolder(tempFolder);

        resolve(targetFolder);
      } catch (error) {
        console.error('압축 해제 중 오류 발생:', error);

        // 임시 폴더 정리
        cleanupTempFolder(tempFolder);

        reject(new Error(`압축 해제 실패: ${error instanceof Error ? error.message : String(error)}`));
      }
    } catch (error) {
      console.error('압축 해제 처리 중 예상치 못한 오류:', error);
      reject(new Error(`압축 해제 실패: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
}

// 임시 폴더 정리 함수
function cleanupTempFolder(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
    } catch (error) {
      console.error('임시 폴더 정리 실패:', error);
    }
  }
}

// 다운로드 이벤트 타입 정의
interface DownloadEvent {
  eventType: 'start' | 'progress' | 'complete' | 'cancel' | 'error'
  timestamp: number
  fileUrl?: string
  fileSize?: number
  progress?: number
  bytesPerSecond?: number
  averageSpeed?: number
  elapsedTime?: number
  targetFolder?: string
  error?: string
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
  ipcMain.handle('download-and-extract', async (event, fileUrl: string, targetFolder: string, shouldResume = false) => {
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

      // 이어받기 시작 위치
      let startBytes = 0;
      let totalBytes = 0;

      // 기존 파일이 있고 이어받기 옵션이 활성화된 경우
      if (shouldResume && fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          startBytes = stats.size;
        }
      } else if (fs.existsSync(filePath)) {
        // 이어받기가 아니면 기존 파일 삭제
        fs.unlinkSync(filePath);
      }

      // 다운로드 시작
      const controller = new AbortController();
      const signal = controller.signal;

      let headers: HeadersInit = {};
      if (startBytes > 0) {
        headers['Range'] = `bytes=${startBytes}-`;
      }

      // 다운로드 요청 함수 - 범위 요청 실패 시 재시도 로직 포함
      const startDownload = async (fromStart = false): Promise<Response> => {
        // 처음부터 다시 시작해야 하는 경우
        if (fromStart && startBytes > 0) {
          console.log(`범위 요청 실패, 처음부터 다시 다운로드합니다: ${fileUrl}`);
          startBytes = 0;

          // 기존 파일이 있으면 삭제
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          // Range 헤더 제거
          headers = {};
        }

        return fetch(fileUrl, {
          method: 'GET',
          headers,
          signal
        });
      };

      // 다운로드 시작 (처음부터 시작 = false)
      let response = await startDownload(false);

      // 416 오류(Range Not Satisfiable) 발생 시 처음부터 다시 시도
      if (response.status === 416) {
        console.log(`416 오류 발생: 서버가 요청한 범위를 처리할 수 없습니다. 처음부터 다시 시도합니다.`);
        response = await startDownload(true);
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 총 크기 확인
      if (response.headers.has('content-length')) {
        const contentLength = parseInt(response.headers.get('content-length')!, 10);
        totalBytes = startBytes + contentLength;
      } else if (response.headers.has('content-range')) {
        const range = response.headers.get('content-range');
        if (range) {
          const match = range.match(/bytes \d+-\d+\/(\d+)/);
          if (match && match[1]) {
            totalBytes = parseInt(match[1], 10);
          }
        }
      }

      // 다운로드 상태 저장
      const startTime = Date.now();
      activeDownload = {
        url: fileUrl,
        targetPath: targetFolder,
        startTime,
        resumeStartBytes: startBytes,
        cancel: () => controller.abort()
      };

      // 스트림 생성
      const fileStream = fs.createWriteStream(filePath, { flags: startBytes > 0 ? 'a' : 'w' });
      const reader = response.body!.getReader();

      // 총 다운로드 완료 바이트 수
      let receivedBytes = startBytes;
      let lastProgressTime = Date.now();
      let lastProgressBytes = receivedBytes;

      // 다운로드 진행 상황 처리
      const processDownload = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // 파일에 데이터 쓰기
            fileStream.write(Buffer.from(value));
            receivedBytes += value.length;

            // 다운로드 속도 계산
            const now = Date.now();
            const elapsedSinceLastProgress = (now - lastProgressTime) / 1000;

            if (elapsedSinceLastProgress >= 0.5) { // 최소 0.5초 간격으로 업데이트
              const bytesPerSecond = (receivedBytes - lastProgressBytes) / elapsedSinceLastProgress;
              const remaining = bytesPerSecond > 0 ? (totalBytes - receivedBytes) / bytesPerSecond : 0;
              const percent = Math.floor((receivedBytes / totalBytes) * 100);

              // 진행 상황 전송
              mainWindow.webContents.send('download-progress', {
                percent,
                transferredBytes: receivedBytes,
                totalBytes,
                bytesPerSecond,
                remaining,
                isResumed: startBytes > 0
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
            remaining: 0,
            isResumed: startBytes > 0
          });

          // 압축 파일 확인
          if (!fs.existsSync(filePath)) {
            throw new Error('Download failed: File not found');
          }

          // 압축 해제 시작
          mainWindow.webContents.send('extract-progress', {
            percent: 0,
            extracted: 0,
            total: 100
          });

          // 압축 해제 (실제 압축 해제 내용에 맞게 수정 필요)
          // 예시: zip 파일 압축 해제
          const extract = util.promisify(require('extract-zip'));
          await extract(filePath, {
            dir: targetFolder,
            // 심링크 처리 중 오류 발생 시 무시하는 옵션 추가
            onEntry: (entry: any, zipFile: any) => {
              const entriesTotal = zipFile.entriesCount;
              const entriesExtracted = Math.floor((zipFile.entriesRead / entriesTotal) * 100);

              // 압축 해제 진행 상황 전송
              mainWindow.webContents.send('extract-progress', {
                percent: entriesExtracted,
                extracted: zipFile.entriesRead,
                total: entriesTotal
              });
            },
            // 심링크 생성 중 오류를 무시하기 위한 핸들러 추가
            async onBeforeExtract(entry) {
              // 심링크 파일인 경우 대상 경로가 이미 존재하는지 확인
              if (entry.type === 'SymbolicLink') {
                try {
                  // 대상 파일 경로
                  const entryPath = path.join(targetFolder, entry.fileName);

                  // 파일이 이미 존재하면 먼저 삭제
                  if (fs.existsSync(entryPath)) {
                    try {
                      if (fs.lstatSync(entryPath).isDirectory()) {
                        fs.rmdirSync(entryPath, { recursive: true });
                      } else {
                        fs.unlinkSync(entryPath);
                      }
                      console.log(`기존 심링크 파일 삭제됨: ${entryPath}`);
                    } catch (removeError) {
                      console.warn(`기존 파일 삭제 실패, 이 항목은 건너뜁니다: ${entryPath}`, removeError);
                      // 오류가 발생해도 압축 해제 프로세스를 중단하지 않고 true를 반환하여 해당 항목을 건너뜁니다
                      return true;
                    }
                  }
                } catch (error) {
                  console.warn(`심링크 확인 중 오류, 이 항목은 건너뜁니다: ${entry.fileName}`, error);
                  return true; // 오류 발생 시 해당 항목 건너뛰기
                }
              }
              return false; // 정상적으로 처리할 수 있는 경우 false 반환
            }
          });

          // 압축 해제 완료 메시지
          mainWindow.webContents.send('extract-progress', {
            percent: 100,
            extracted: 100,
            total: 100
          });

          // 다운로드 상태 초기화
          activeDownload = null;

          return targetFolder;
        } catch (error) {
          // 에러 발생 시 스트림 닫기
          fileStream.end();

          // 다운로드 상태 초기화
          activeDownload = null;

          throw error;
        }
      };

      // 다운로드 처리 시작
      const result = await processDownload();
      return result;

    } catch (error) {
      // 다운로드 상태 초기화
      activeDownload = null;
      console.error('Download error:', error);
      throw error;
    }
  });

  // 다운로드 취소
  ipcMain.handle('cancel-download', async () => {
    if (activeDownload) {
      activeDownload.cancel();
      activeDownload = null;
      return true;
    }
    return false;
  });

  // 이어받기 가능 여부 확인
  ipcMain.handle('check-resume-available', async (event, fileUrl: string) => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'app-downloads');
      const filename = path.basename(fileUrl);
      const filePath = path.join(tempDir, filename);

      if (!fs.existsSync(filePath)) {
        return {
          canResume: false,
          reason: 'File not found'
        };
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        return {
          canResume: false,
          reason: 'Empty file'
        };
      }

      try {
        // HEAD 요청으로 총 크기 확인
        const response = await fetch(fileUrl, { method: 'HEAD' });
        if (response.ok && response.headers.has('content-length')) {
          const totalBytes = parseInt(response.headers.get('content-length')!, 10);

          // 이미 완료된 경우
          if (stats.size >= totalBytes) {
            return {
              canResume: false,
              reason: 'Already completed'
            };
          }

          // 이어받기 가능
          return {
            canResume: true,
            resumeInfo: {
              fileUrl,
              filePath,
              downloadedBytes: stats.size,
              totalBytes
            }
          };
        }
      } catch (error) {
        console.error('Error checking file size:', error);
      }

      return {
        canResume: false,
        reason: 'Cannot determine file size'
      };
    } catch (error) {
      console.error('Error checking resume:', error);
      return {
        canResume: false,
        reason: String(error)
      };
    }
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
