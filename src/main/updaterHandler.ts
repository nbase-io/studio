import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile, ExecFileOptions } from 'child_process';
// electron-dl은 동적 import로만 사용합니다 (94번 라인 참조)
import {
  handleUpdateFile
} from './utils/zipHandler';
// electron-dl의 Progress 타입은 동적 로드 시 사용합니다

// 타입 정의
interface UpdateFile {
  id: string;
  name: string;
  downloadUrl: string;
  size: number;
  checksum: string;
  required: boolean;
  description: string;
  order: number;
  type: 'core' | 'resource' | 'content';
}

interface UpdateInfo {
  version: string;
  releaseDate: string;
  mandatory: boolean;
  files: UpdateFile[];
  releaseNotes: string[];
  bannerImage: string;
  totalSize: number;
}

interface DownloadedFile {
  fileId: string;
  filePath: string;
  isVerified: boolean;
}

// 업데이트 관련 IPC 핸들러를 설정합니다.
export function setupUpdaterHandlers(mainWindow: BrowserWindow): void {
  // 원격 서버에서 업데이트 정보를 가져옵니다.
  ipcMain.handle('check-for-updates', async (event, updateJsonUrl: string) => {
    try {
      const response = await fetch(updateJsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch update info: ${response.status}`);
      }

      const updateInfo: UpdateInfo = await response.json();
      const currentVersion = app.getVersion();

      // 버전 비교
      const hasUpdate = compareVersions(updateInfo.version, currentVersion) > 0;

      return {
        hasUpdate,
        updateInfo,
        currentVersion
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      throw error;
    }
  });

  // 단일 업데이트 파일 다운로드
  ipcMain.handle('download-update-file', async (event, updateFile: UpdateFile) => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'app-updates');

      // 임시 디렉토리가 없으면 생성
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 파일명 생성
      const filename = `${updateFile.id}.zip`;
      const updateFilePath = path.join(tempDir, filename);

      // 이미 다운로드된 파일이 있다면 체크섬 검증
      if (fs.existsSync(updateFilePath)) {
        const fileBuffer = fs.readFileSync(updateFilePath);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        if (`sha256-${fileHash}` === updateFile.checksum) {
          return {
            fileId: updateFile.id,
            filePath: updateFilePath,
            isVerified: true
          };
        } else {
          // 체크섬이 일치하지 않으면 파일 삭제
          fs.unlinkSync(updateFilePath);
        }
      }

      let lastProgress = 0;
      const startTime = Date.now();

      // electron-dl 모듈 동적 로드
      const electronDl = await import('electron-dl');

      // 다운로드 시작
      const dl = await electronDl.download(mainWindow, updateFile.downloadUrl, {
        directory: tempDir,
        filename,
        onProgress: (progress) => {
          const percent = Math.round(progress.percent * 100);
          if (percent !== lastProgress) {
            // 다운로드 속도 계산 (transferredBytes / 경과시간)
            const elapsedTime = (Date.now() - startTime) / 1000; // 초 단위
            const bytesPerSecond = elapsedTime > 0 ? progress.transferredBytes / elapsedTime : 0;
            const remaining = bytesPerSecond > 0 ? (updateFile.size - progress.transferredBytes) / bytesPerSecond : 0;

            mainWindow.webContents.send('update-file-progress', {
              fileId: updateFile.id,
              downloaded: progress.transferredBytes,
              total: updateFile.size,
              percent,
              bytesPerSecond,
              remaining
            });
            lastProgress = percent;
          }
        }
      });

      // 다운로드 완료 후 체크섬 검증
      const fileBuffer = fs.readFileSync(dl.getSavePath());
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const isVerified = `sha256-${fileHash}` === updateFile.checksum;

      if (!isVerified) {
        console.error('Downloaded file checksum does not match');
      }

      return {
        fileId: updateFile.id,
        filePath: dl.getSavePath(),
        isVerified
      };
    } catch (error) {
      console.error('Error downloading update file:', error);
      throw error;
    }
  });

  // 업데이트 파일 처리
  ipcMain.handle('process-update-file', async (event, fileInfo: DownloadedFile, fileType: string) => {
    try {
      if (!fileInfo.isVerified) {
        throw new Error('파일 검증 실패. 손상된 파일일 수 있습니다.');
      }

      const result = await handleUpdateFile(
        fileInfo.filePath,
        fileType as 'core' | 'resource' | 'content',
        (extracted, total) => {
          mainWindow.webContents.send('update-extract-progress', {
            fileId: fileInfo.fileId,
            extracted,
            total,
            percent: Math.round((extracted / total) * 100)
          });
        }
      );

      return result;
    } catch (error) {
      console.error('Error processing update file:', error);
      throw error;
    }
  });

  // 코어 업데이트 파일 설치
  ipcMain.handle('install-core-update', async (event, filePath: string) => {
    try {
      // 다양한 설치 방법이 있을 수 있습니다.
      // Windows의 경우 NSIS 인스톨러를 실행하거나
      // macOS의 경우 dmg를 마운트하거나
      // 직접 파일을 추출하여 업데이트할 수 있습니다.

      // 사용자에게 확인 대화상자 표시
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '업데이트 설치',
        message: '업데이트를 설치하고 애플리케이션을 다시 시작하시겠습니까?',
        buttons: ['취소', '다시 시작'],
        defaultId: 1
      });

      if (response === 1) {
        if (process.platform === 'win32') {
          // Windows에서 업데이트 설치 프로그램 실행
          execFile(filePath, [], { detached: true } as ExecFileOptions, (error) => {
            if (error) {
              console.error('Failed to execute installer:', error);
              return false;
            }
            app.quit();
          });
        } else if (process.platform === 'darwin') {
          // macOS에서 DMG 파일 자동 마운트 및 앱 설치
          // 여기에는 DMG 마운트, 앱 복사 등의 로직이 추가되어야 함
          app.relaunch();
          app.exit(0);
        } else {
          // Linux 등 기타 플랫폼
          app.relaunch();
          app.exit(0);
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error installing update:', error);
      throw error;
    }
  });

  // 모든 업데이트 설치 완료 후 앱 재시작
  ipcMain.handle('restart-app', async () => {
    try {
      app.relaunch();
      app.exit(0);
      return true;
    } catch (error) {
      console.error('Error restarting app:', error);
      return false;
    }
  });

  // 임시 파일 정리
  ipcMain.handle('cleanup-temp-files', async () => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'app-updates');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      return true;
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
      return false;
    }
  });
}

// 버전 비교 유틸리티 함수
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}
