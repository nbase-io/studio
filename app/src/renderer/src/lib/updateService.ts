import { app } from 'electron';

export interface UpdateFile {
  id: string;
  name: string;
  downloadUrl: string;
  size: number;
  checksum: string;
  required: boolean;
  description: string;
  order: number; // 다운로드 및 설치 순서
  type: 'core' | 'resource' | 'content'; // 파일 유형
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  mandatory: boolean;
  files: UpdateFile[];
  releaseNotes: string[];
  bannerImage: string;
  totalSize: number; // 모든 파일의 총 크기
}

export interface UpdateProgress {
  fileId?: string;
  fileName?: string;
  fileIndex?: number;
  totalFiles?: number;
  downloaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  remaining: number;
  overall?: number; // 전체 업데이트 진행률 (0-100)
}

export interface DownloadedFile {
  fileId: string;
  filePath: string;
  isVerified: boolean;
}

class UpdateService {
  private updateUrl: string;
  private currentVersion: string;
  private updateInfo: UpdateInfo | null = null;
  private isDownloading: boolean = false;
  private downloadCancelled: boolean = false;
  private downloadedFiles: DownloadedFile[] = [];

  constructor(updateUrl: string) {
    this.updateUrl = updateUrl;
    // 현재 버전은 package.json에서 가져오거나 환경 변수에서 가져올 수 있습니다
    this.currentVersion = process.env.APP_VERSION || '1.0.0';
  }

  /**
   * 외부 URL에서 업데이트 정보를 가져옵니다.
   */
  public async checkForUpdates(): Promise<{hasUpdate: boolean, updateInfo: UpdateInfo | null}> {
    try {
      const response = await fetch(this.updateUrl);
      if (!response.ok) {
        throw new Error(`업데이트 정보를 가져오는 데 실패했습니다: ${response.status}`);
      }

      this.updateInfo = await response.json();

      // 버전 비교
      const hasUpdate = this.compareVersions(this.updateInfo.version, this.currentVersion) > 0;

      return {
        hasUpdate,
        updateInfo: this.updateInfo
      };
    } catch (error) {
      console.error('업데이트 확인 중 오류 발생:', error);
      return {
        hasUpdate: false,
        updateInfo: null
      };
    }
  }

  /**
   * 모든 업데이트 파일을 다운로드합니다.
   * @param progressCallback 다운로드 진행 상황을 전달하는 콜백
   */
  public async downloadAllUpdates(
    progressCallback: (progress: UpdateProgress) => void
  ): Promise<DownloadedFile[] | null> {
    if (!this.updateInfo) {
      throw new Error('업데이트 정보가 없습니다. 먼저 checkForUpdates를 호출하세요.');
    }

    this.isDownloading = true;
    this.downloadCancelled = false;
    this.downloadedFiles = [];

    // 파일 순서대로 정렬
    const sortedFiles = [...this.updateInfo.files].sort((a, b) => a.order - b.order);
    let overallDownloaded = 0;
    const totalSize = this.updateInfo.totalSize;

    try {
      for (let i = 0; i < sortedFiles.length; i++) {
        if (this.downloadCancelled) {
          throw new Error('다운로드가 취소되었습니다.');
        }

        const file = sortedFiles[i];

        // 파일 다운로드 시작
        const filePath = await this.downloadFile(file, (fileProgress) => {
          // 개별 파일 진행상황에 전체 진행상황 추가
          const overallProgress = {
            ...fileProgress,
            fileId: file.id,
            fileName: file.name,
            fileIndex: i + 1,
            totalFiles: sortedFiles.length,
            overall: Math.round(((overallDownloaded + fileProgress.downloaded) / totalSize) * 100)
          };
          progressCallback(overallProgress);
        });

        if (!filePath) {
          throw new Error(`파일 다운로드 실패: ${file.name}`);
        }

        // 다운로드 성공한 파일 추가
        this.downloadedFiles.push({
          fileId: file.id,
          filePath,
          isVerified: true
        });

        // 전체 다운로드 진행상황 업데이트
        overallDownloaded += file.size;
      }

      this.isDownloading = false;
      return this.downloadedFiles;
    } catch (error) {
      this.isDownloading = false;
      console.error('업데이트 다운로드 중 오류 발생:', error);
      return null;
    }
  }

  /**
   * 단일 파일을 다운로드합니다.
   * @private
   */
  private async downloadFile(
    file: UpdateFile,
    progressCallback: (progress: UpdateProgress) => void
  ): Promise<string | null> {
    try {
      const response = await fetch(file.downloadUrl);
      if (!response.ok) {
        throw new Error(`파일 다운로드 실패: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('스트림 리더를 가져올 수 없습니다.');
      }

      const contentLength = Number(response.headers.get('Content-Length') || file.size);
      let receivedLength = 0;
      const startTime = Date.now();
      const chunks: Uint8Array[] = [];

      while (true) {
        if (this.downloadCancelled) {
          reader.cancel();
          throw new Error('다운로드가 취소되었습니다.');
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        chunks.push(value);
        receivedLength += value.length;

        const currentTime = Date.now();
        const elapsedTime = (currentTime - startTime) / 1000; // 초 단위
        const bytesPerSecond = elapsedTime > 0 ? receivedLength / elapsedTime : 0;
        const remaining = bytesPerSecond > 0 ? (contentLength - receivedLength) / bytesPerSecond : 0;

        progressCallback({
          downloaded: receivedLength,
          total: contentLength,
          percent: Math.round((receivedLength / contentLength) * 100),
          bytesPerSecond,
          remaining
        });
      }

      // 여기에서는 실제 파일 저장 로직이 추가되어야 함
      // 실제 구현 시에는 Electron IPC를 통해 메인 프로세스에 요청
      // 여기서는 임시 경로만 반환
      const downloadPath = `/tmp/downloads/${file.id}-${Date.now()}.zip`;

      // 체크섬 검증 로직
      const isValid = await this.verifyChecksum(chunks, file.checksum);
      if (!isValid) {
        throw new Error('체크섬 검증에 실패했습니다. 손상된 파일일 수 있습니다.');
      }

      return downloadPath;
    } catch (error) {
      console.error(`파일 다운로드 중 오류 발생 (${file.name}):`, error);
      return null;
    }
  }

  /**
   * 다운로드를 취소합니다.
   */
  public cancelDownload(): void {
    if (this.isDownloading) {
      this.downloadCancelled = true;
    }
  }

  /**
   * 다운로드된 모든 파일을 설치합니다.
   */
  public async installAllUpdates(): Promise<boolean> {
    if (this.downloadedFiles.length === 0) {
      throw new Error('설치할 업데이트 파일이 없습니다.');
    }

    try {
      // 여기서는 IPC를 통해 메인 프로세스에 설치 요청
      console.log(`${this.downloadedFiles.length}개 파일 설치 중`);

      // 실제 구현에서는 각 파일 유형에 따라 다른 설치 방법 사용
      // 예: 코어 파일은 앱 재시작 필요, 리소스 파일은 앱 내에서 처리 등

      return true;
    } catch (error) {
      console.error('업데이트 설치 중 오류 발생:', error);
      return false;
    }
  }

  /**
   * 선택적 업데이트 파일만 다운로드하고 설치합니다.
   * @param fileIds 다운로드할 파일 ID 목록
   */
  public async downloadSelectedUpdates(
    fileIds: string[],
    progressCallback: (progress: UpdateProgress) => void
  ): Promise<DownloadedFile[] | null> {
    if (!this.updateInfo) {
      throw new Error('업데이트 정보가 없습니다.');
    }

    // 필수 파일과 선택된 파일만 포함
    const filesToDownload = this.updateInfo.files.filter(
      file => file.required || fileIds.includes(file.id)
    ).sort((a, b) => a.order - b.order);

    if (filesToDownload.length === 0) {
      return [];
    }

    this.isDownloading = true;
    this.downloadCancelled = false;
    this.downloadedFiles = [];

    let overallDownloaded = 0;
    const totalSize = filesToDownload.reduce((sum, file) => sum + file.size, 0);

    try {
      for (let i = 0; i < filesToDownload.length; i++) {
        if (this.downloadCancelled) {
          throw new Error('다운로드가 취소되었습니다.');
        }

        const file = filesToDownload[i];

        const filePath = await this.downloadFile(file, (fileProgress) => {
          const overallProgress = {
            ...fileProgress,
            fileId: file.id,
            fileName: file.name,
            fileIndex: i + 1,
            totalFiles: filesToDownload.length,
            overall: Math.round(((overallDownloaded + fileProgress.downloaded) / totalSize) * 100)
          };
          progressCallback(overallProgress);
        });

        if (!filePath) {
          throw new Error(`파일 다운로드 실패: ${file.name}`);
        }

        this.downloadedFiles.push({
          fileId: file.id,
          filePath,
          isVerified: true
        });

        overallDownloaded += file.size;
      }

      this.isDownloading = false;
      return this.downloadedFiles;
    } catch (error) {
      this.isDownloading = false;
      console.error('선택적 업데이트 다운로드 중 오류 발생:', error);
      return null;
    }
  }

  /**
   * 다운로드된 파일의 체크섬을 검증합니다.
   */
  private async verifyChecksum(chunks: Uint8Array[], expectedChecksum: string): Promise<boolean> {
    try {
      // 모든 청크를 하나의 Uint8Array로 결합
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combinedArray = new Uint8Array(totalLength);

      let position = 0;
      for (const chunk of chunks) {
        combinedArray.set(chunk, position);
        position += chunk.length;
      }

      // Web Crypto API를 사용하여 SHA-256 해시 계산
      const hashBuffer = await crypto.subtle.digest('SHA-256', combinedArray);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return `sha256-${hashHex}` === expectedChecksum;
    } catch (error) {
      console.error('체크섬 검증 중 오류 발생:', error);
      return false;
    }
  }

  /**
   * 시맨틱 버전을 비교합니다.
   * 결과가 양수이면 a > b, 음수이면 a < b, 0이면, a === b
   */
  private compareVersions(a: string, b: string): number {
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

  /**
   * 업데이트 정보를 가져옵니다.
   */
  public getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }

  /**
   * 다운로드된 파일 목록을 가져옵니다.
   */
  public getDownloadedFiles(): DownloadedFile[] {
    return this.downloadedFiles;
  }
}

export default UpdateService;
