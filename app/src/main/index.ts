import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupUpdaterHandlers } from './updaterHandler'
import fs from 'fs'
import path from 'path'
import admZip from 'adm-zip'
import { Logger, LogLevel } from './utils/logger'
import { getProjectInfo, ProjectInfo } from './utils/apiClient'
import { readConfig, getConfigValue } from './utils/configReader'
import { ApiService } from './utils/api'

// ===========================================
// 전역 상태 관리
// ===========================================

// 로그 인스턴스 초기화
const logger = Logger.getInstance({
  enableRemote: false, // 서버로 로그 전송 비활성화 (필요시 활성화)
  minLevel: is.dev ? LogLevel.DEBUG : LogLevel.INFO // 개발 모드에서는 DEBUG 레벨부터, 프로덕션에서는 INFO 레벨부터 기록
})

// 다운로드 관련 전역 상태 관리
interface DownloadState {
  status: string
  progress: number
  error: string | null
  filePath: string
  isCompleted: boolean
  startTime: number | null
  endTime: number | null
  downloadSpeed: number
  size: {
    total: number
    transferred: number
  }
}

// 다운로드 상태 저장 변수
const downloadState: DownloadState = {
  status: 'idle',
  progress: 0,
  error: null,
  filePath: '',
  isCompleted: false,
  startTime: null,
  endTime: null,
  downloadSpeed: 0,
  size: {
    total: 0,
    transferred: 0
  }
}

// 다운로드 상태 초기화 함수
function resetDownloadState(): void {
  // 기존 downloadState 객체의 프로퍼티 변경
  downloadState.status = 'idle';
  downloadState.progress = 0;
  downloadState.error = null;
  downloadState.filePath = '';
  downloadState.isCompleted = false;
  downloadState.startTime = null;
  downloadState.endTime = null;
  downloadState.downloadSpeed = 0;
  downloadState.size.total = 0;
  downloadState.size.transferred = 0;
}

// 프로젝트 정보 전역 상태 관리
let projectInfoCache: ProjectInfo | null = null

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
  ipcMain.handle('initialize-download', async () => {
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

      return {
        success: true,
        canResume: false
      };
    } catch (error) {
      logger.error('Download', '다운로드 초기화 실패', error);
      return {
        success: false,
        error: String(error)
      };
    }
  });

  // 다운로드 및 압축 해제
  ipcMain.handle('download-and-extract', async (_event, fileUrl: string, targetFolder: string): Promise<string> => {
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
      let filePath = path.join(tempDir, filename);

      // 타겟 폴더 확인
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      // 이전 다운로드 파일 정리 (항상 새로 다운로드하도록)
      logger.info('Download', `다운로드 시작 전 이전 임시 파일 확인`, { path: filePath });
      if (fs.existsSync(filePath)) {
        try {
          // 파일이 다른 프로세스에 의해 잠겨있지 않은지 확인
          try {
            const fileHandle = fs.openSync(filePath, 'r');
            fs.closeSync(fileHandle);

            // 파일 삭제
            fs.unlinkSync(filePath);
            logger.info('File', `이전 다운로드 파일 삭제됨`, { path: filePath });
          } catch (fileError) {
            logger.warn('File', `파일 접근 오류, 강제 삭제 시도`, { path: filePath, error: fileError });
            // 강제 삭제 시도
            try {
              fs.rmSync(filePath, { force: true });
              logger.info('File', `이전 다운로드 파일 강제 삭제됨`, { path: filePath });
            } catch (removeError) {
              logger.error('File', `파일 강제 삭제 실패`, { path: filePath, error: removeError });
              // 최후의 수단: 임시 파일 경로 변경
              const newFilePath = `${filePath}.${Date.now()}.new`;
              logger.info('File', `새 다운로드 경로 생성`, { oldPath: filePath, newPath: newFilePath });
              filePath = newFilePath;
            }
          }
        } catch (error) {
          logger.error('File', `이전 다운로드 파일 삭제 실패`, { path: filePath, error });
          throw new Error(`이전 다운로드 파일을 삭제할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
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

        logger.logDownload('시작', fileUrl, { targetPath: filePath });
        return fetch(fileUrl, {
          method: 'GET',
          signal
        });
      };

      // 다운로드 시작
      const response = await startDownload();

      if (!response.ok) {
        // 오류 발생 시 다운로드 상태 초기화
        activeDownload = null;
        logger.error('Network', `HTTP 오류 발생`, { status: response.status, url: fileUrl });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 총 크기 확인
      let totalBytes = 0;
      if (response.headers.has('content-length')) {
        const contentLength = parseInt(response.headers.get('content-length')!, 10);
        totalBytes = contentLength;
        logger.debug('Download', `다운로드 크기 정보`, { totalBytes, url: fileUrl });
      }

      // 다운로드 상태 저장
      const startTime = Date.now();
      activeDownload = {
        url: fileUrl,
        targetPath: targetFolder,
        startTime,
        resumeStartBytes: 0,
        cancel: (): void => controller.abort()
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
          // eslint-disable-next-line no-constant-condition
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
              logger.error('File', `파일 쓰기 오류`, { path: filePath, error: writeError });
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

              // 로그에 현재 다운로드 상태 기록 (1% 마다)
              if (percent % 10 === 0) {
                logger.debug('Download', `다운로드 진행 상황`, {
                  percent,
                  receivedBytes,
                  totalBytes,
                  bytesPerSecond: Math.round(bytesPerSecond)
                });
              }

              // 마지막 진행 상태 업데이트
              lastProgressTime = now;
              lastProgressBytes = receivedBytes;
            }
          }

          // 파일 닫기 - Promise로 감싸서 완전히 닫힐 때까지 기다림
          await new Promise<void>((resolve, reject) => {
            fileStream.end(err => {
              if (err) {
                logger.error('File', `파일 스트림 닫기 실패`, { path: filePath, error: err });
                reject(err);
              } else {
                logger.debug('File', '파일 스트림이 성공적으로 닫혔습니다', { path: filePath });
                resolve();
              }
            });
          });

          // 다운로드 완료 시 마지막 진행 상황 전송
          mainWindow.webContents.send('download-progress', {
            percent: 100,
            transferredBytes: totalBytes,
            totalBytes,
            bytesPerSecond: 0,
            remaining: 0
          });

          logger.logDownload('완료', fileUrl, {
            filePath,
            fileSize: totalBytes,
            downloadTime: (Date.now() - startTime) / 1000
          });

          // 다운로드 파일 확인 - 실패 시 오류 발생
          if (!fs.existsSync(filePath)) {
            // 다운로드 상태 초기화
            resetDownloadState();
            activeDownload = null;
            logger.error('Download', '다운로드 실패: 파일을 찾을 수 없음', { filePath });
            throw new Error('다운로드 실패: 파일을 찾을 수 없습니다');
          }

          // 파일 크기 확인 - 0바이트 파일은 실패로 처리
          const fileStats = fs.statSync(filePath);
          if (fileStats.size === 0) {
            // 다운로드 상태 초기화
            resetDownloadState();
            activeDownload = null;
            logger.error('Download', '다운로드 실패: 파일 크기가 0', { filePath });
            throw new Error('다운로드 실패: 파일 크기가 0입니다');
          }

          // 파일 크기 검증 - 예상 크기와 실제 크기 비교
          if (totalBytes > 0 && fileStats.size !== totalBytes) {
            logger.warn('Download', `파일 크기 불일치`, {
              expected: totalBytes,
              actual: fileStats.size,
              difference: fileStats.size - totalBytes,
              filePath
            });

            // 일정 오차 범위 내에서는 허용 (1% 미만 차이)
            const sizeDifference = Math.abs(fileStats.size - totalBytes);
            const percentDifference = (sizeDifference / totalBytes) * 100;

            if (percentDifference >= 1) {
              // 다운로드 상태 초기화
              resetDownloadState();
              activeDownload = null;
              logger.error('Download', `다운로드 파일 크기 불일치 (허용 범위 초과)`, {
                expected: totalBytes,
                actual: fileStats.size,
                percentDifference
              });
              throw new Error(`다운로드한 파일 크기가 예상과 다릅니다: 예상=${totalBytes} 바이트, 실제=${fileStats.size} 바이트 (${percentDifference.toFixed(2)}% 차이)`);
            } else {
              // 오차가 적으면 경고만 표시하고 계속 진행
              logger.warn('Download', `파일 크기 불일치가 허용 오차 범위 내에 있습니다`, {
                expected: totalBytes,
                actual: fileStats.size,
                percentDifference
              });
            }
          }

          // 다운로드 성공, 압축 해제 시작
          logger.logExtract('시작', filePath, {
            fileSize: fileStats.size,
            targetFolder: targetFolder
          });

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
              logger.error('Extract', '유효하지 않은 ZIP 파일', {
                filePath,
                header: buffer.toString('hex')
              });
              throw new Error('다운로드한 파일이 유효한 ZIP 파일이 아닙니다');
            }

            logger.debug('Extract', 'ZIP 파일 헤더 검증 성공', {
              filePath,
              header: buffer.toString('hex').substring(0, 8)
            });
          } catch (error) {
            resetDownloadState();
            activeDownload = null;
            logger.error('Extract', '압축 파일 검증 실패', { filePath, error });
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

            logger.debug('Extract', `ZIP 파일 분석 완료`, { totalEntries, filePath });

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
                    logger.warn('Extract', `기존 파일 삭제 실패`, { path: entryPath, error });
                  }
                }

                // 파일 추출
                try {
                  const entryData = entry.getData();
                  fs.writeFileSync(entryPath, entryData, { flag: 'w' });
                } catch (writeError) {
                  logger.error('Extract', `파일 쓰기 실패`, { path: entryPath, error: writeError });
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

                  if (extractedCount % 100 === 0) {
                    logger.debug('Extract', `압축 해제 진행 상황`, {
                      percent,
                      extractedCount,
                      totalEntries
                    });
                  }
                }
              } catch (error) {
                logger.error('Extract', `항목 압축 해제 실패`, { entryName: entry.entryName, error });
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
            logger.logExtract('완료', targetFolder, {
              extractedFiles: extractedCount,
              totalEntries,
              sourceZip: filePath
            });

            return targetFolder;
          } catch (zipError) {
            logger.error('Extract', '압축 파일 처리 중 심각한 오류', { filePath, error: zipError });

            // 오류의 스택 트레이스도 함께 기록
            if (zipError instanceof Error && zipError.stack) {
              logger.debug('Extract', '스택 트레이스', { stack: zipError.stack });
            }

            // 파일 내용 확인 (첫 100바이트)
            try {
              const fileHeader = fs.readFileSync(filePath, { encoding: 'hex', flag: 'r' }).slice(0, 200);
              logger.debug('Extract', '파일 헤더 (HEX)', { header: fileHeader });
            } catch (readError) {
              logger.error('Extract', '파일 헤더 읽기 실패', { error: readError });
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

          logger.error('Download', '다운로드 프로세스 중 오류 발생', { error });
          throw error;
        }
      };

      // 다운로드 처리 시작
      const result = await processDownload();
      return result;

    } catch (error) {
      // 다운로드 상태 초기화
      resetDownloadState();
      logger.error('Download', '다운로드 오류', { error });
      throw error;
    }
  });

  // 다운로드 취소
  ipcMain.handle('cancel-download', async (): Promise<boolean> => {
    // 현재 다운로드가 없으면 무시
    if (!activeDownload) {
      return false;
    }

    logger.logDownload('취소', activeDownload.url);

    try {
      // 다운로드 취소 설정
      if (activeDownload.cancel) {
        activeDownload.cancel();
      }

      // 취소된 다운로드의 임시 파일 삭제
      // 파일 스트림이 아직 열려있다면 안전하게 종료하기 위해 약간 지연
      await new Promise(resolve => setTimeout(resolve, 100));

      const tempDir = path.join(app.getPath('temp'), 'app-downloads');
      const filename = path.basename(activeDownload.url);
      const filePath = path.join(tempDir, filename);

      if (fs.existsSync(filePath)) {
        // 파일이 다른 프로세스에 의해 잠겨있지 않은지 확인
        try {
          const fileHandle = fs.openSync(filePath, 'r');
          fs.closeSync(fileHandle);

          // 파일 삭제
          fs.unlinkSync(filePath);
          logger.logFile('삭제', filePath, { reason: '다운로드 취소' });
        } catch (fileError) {
          logger.warn('File', `파일 접근 오류, 강제 삭제 시도`, { path: filePath, error: fileError });
          // 강제 삭제 시도
          try {
            fs.rmSync(filePath, { force: true });
            logger.logFile('강제 삭제', filePath, { reason: '다운로드 취소' });
          } catch (removeError) {
            logger.error('File', `파일 강제 삭제 실패`, { path: filePath, error: removeError });
          }
        }
      }
    } catch (error) {
      logger.error('Download', '취소된 다운로드 파일 삭제 실패', { error });
    }

    activeDownload = null;
    return true;
  });

  // 이어받기 가능 여부 확인
  ipcMain.handle('check-resume-available', async (): Promise<{canResume: boolean, reason: string}> => {
    // 이어받기 기능 제거로 항상 false 반환
    return {
      canResume: false,
      reason: 'Resume functionality is disabled'
    };
  });

  // 다운로드 이벤트 전송
  ipcMain.handle('send-download-event', async (_event, downloadEvent) => {
    // 여기서 다운로드 이벤트를 외부 서비스에 보내는 로직을 구현할 수 있습니다
    logger.logDownload('이벤트', downloadEvent.url || 'unknown', downloadEvent);
  });
}

// IPC 핸들러 설정 함수 추가
function setupProjectInfoHandlers(): void {
  // 프로젝트 정보 요청 처리
  ipcMain.handle('get-project-info', async () => {
    try {
      // 캐시된 정보가 있으면 사용, 없으면 API 호출
      if (!projectInfoCache) {
        logger.info('API', '프로젝트 정보 요청 시작')

        // studio.ini에서 PROJECT_ID와 BETA 값 읽기
        try {
          const projectId = getConfigValue('PROJECT_ID')
          const isBeta = getConfigValue('BETA') === 1

          logger.info('Config', 'studio.ini 파일에서 프로젝트 정보 로드', {
            projectId,
            isBeta
          })

          // API 호출 시 .ini 설정값 사용
          projectInfoCache = await getProjectInfo(projectId, isBeta)
        } catch (configError) {
          logger.error('Config', 'studio.ini 파일 로드 실패, 기본값으로 계속', { error: configError })
          // 설정 파일 로드 실패 시 기본 API 호출 사용
          projectInfoCache = await getProjectInfo()
        }

        logger.info('API', '프로젝트 정보 요청 완료', { projectId: projectInfoCache.projectId })
      }
      return projectInfoCache
    } catch (error) {
      logger.error('API', '프로젝트 정보 요청 실패', error)
      throw error
    }
  })

  // studio.ini 설정값 요청 처리
  ipcMain.handle('get-config', async (_event, key) => {
    try {
      if (!key) {
        return readConfig()
      }
      return getConfigValue(key)
    } catch (error) {
      logger.error('Config', `설정값 요청 실패: ${key}`, error)
      throw error
    }
  })
}

// 이벤트 처리 핸들러 모음
function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // 다운로드 핸들러 설정
  setupDownloadHandlers(mainWindow)

  // 프로젝트 정보 핸들러 설정
  setupProjectInfoHandlers()

  // studio.ini에서 PROJECT_ID와 BETA 값을 직접 가져오는 핸들러
  ipcMain.handle('get-studio-ini-values', async () => {
    try {
      logger.info('Config', 'studio.ini 파일에서 값을 가져오는 요청')

      // 설정 읽기
      const config = readConfig()

      return {
        PROJECT_ID: config.PROJECT_ID,
        BETA: config.BETA,
        isBeta: config.BETA === 1
      }
    } catch (error) {
      logger.error('Config', 'studio.ini 파일에서 값을 가져오는 중 오류 발생', { error })
      throw error
    }
  })

  // 환경설정 가져오기 핸들러
  ipcMain.handle('get-environments', async () => {
    try {
      logger.info('API', '환경설정 가져오기 요청')

      // API 서비스 인스턴스 생성 (studio.ini의 PROJECT_ID가 자동으로 설정됨)
      const apiService = new ApiService()

      // 환경설정 가져오기
      const environments = await apiService.getEnvironments();

      return environments;
    } catch (error) {
      logger.error('API', '환경설정 가져오기 실패', { error })
      throw error
    }
  })

  // 메인 프로세스 로그를 렌더러에 전달
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;

  // 콘솔 로그 오버라이드 - 렌더러에 전달
  console.log = function(...args: any[]) {
    originalConsoleLog.apply(console, args);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-process-log', {
        type: 'log',
        message: args.map(arg => String(arg)).join(' ')
      });
    }
  };

  console.error = function(...args: any[]) {
    originalConsoleError.apply(console, args);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-process-log', {
        type: 'error',
        message: args.map(arg => String(arg)).join(' ')
      });
    }
  };

  console.warn = function(...args: any[]) {
    originalConsoleWarn.apply(console, args);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-process-log', {
        type: 'warn',
        message: args.map(arg => String(arg)).join(' ')
      });
    }
  };

  console.info = function(...args: any[]) {
    originalConsoleInfo.apply(console, args);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-process-log', {
        type: 'info',
        message: args.map(arg => String(arg)).join(' ')
      });
    }
  };
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 530,
    resizable: false,
    backgroundColor: '#121212',
    show: false,
    title: 'GamePot Studio',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      webviewTag: true
    }
  })

  // 메인 창 로드
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 메인 창이 준비되면 바로 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.webContents.openDevTools() // 개발자 도구 자동 실행
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    logger.logAppEvent('외부 링크 열기', { url: details.url })
    return { action: 'deny' }
  })

  // 업데이트 핸들러 설정
  setupUpdaterHandlers(mainWindow)

  // 모든 IPC 핸들러 설정
  setupIpcHandlers(mainWindow)

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
    logger.warn('System', '이미 다른 인스턴스가 실행 중. 프로그램 종료')
    app.quit()
    return
  }

  // 두 번째 인스턴스가 시작될 때 기존 창에 포커스
  app.on('second-instance', () => {
    logger.info('System', '두 번째 인스턴스 감지: 기존 창 활성화')
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
  logger.info('System', '앱 초기화 완료', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => logger.debug('IPC', 'ping-pong 테스트', { response: 'pong' }))

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
  logger.info('System', '모든 창이 닫힘, 앱 종료')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 앱 종료 이벤트
app.on('will-quit', () => {
  logger.info('System', '앱 종료 중')
})
