import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { promisify } from 'util';
import { app } from 'electron';

// yauzl을 Promise 기반으로 변환
const openZip = promisify<string, yauzl.Options, yauzl.ZipFile>(
  (path, options, callback) => yauzl.open(path, options, callback)
);

/**
 * 압축 파일 처리 결과 인터페이스
 */
export interface ExtractionResult {
  success: boolean;
  extractedFiles: string[];
  errorMessage?: string;
}

/**
 * 추출 옵션 인터페이스
 */
export interface ExtractionOptions {
  // 압축 해제 대상 경로
  targetDir: string;
  // 압축 해제 전 대상 경로 초기화 여부
  cleanTargetDir?: boolean;
  // 특정 파일/디렉토리만 추출 (배열이 비어있으면 모든 파일 추출)
  includeFiles?: string[];
  // 제외할 파일/디렉토리 패턴
  excludePatterns?: RegExp[];
  // 진행 상황 콜백
  onProgress?: (extracted: number, total: number) => void;
  // 파일 충돌 시 처리 방법
  overwrite?: boolean;
  // 파일 이름 변환 함수
  transformFilename?: (filename: string) => string;
  // 추출 중 항목 콜백 (파일 이름, 추출 경로)
  onEntry?: (filename: string, extractPath: string) => void;
}

/**
 * ZIP 파일 압축 해제
 * @param zipPath 압축 파일 경로
 * @param options 압축 해제 옵션
 */
export async function extractZip(
  zipPath: string,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const {
    targetDir,
    cleanTargetDir = false,
    includeFiles = [],
    excludePatterns = [],
    onProgress,
    overwrite = true,
    transformFilename,
    onEntry
  } = options;

  // 대상 디렉토리가 없으면 생성
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  // 대상 디렉토리 초기화
  else if (cleanTargetDir) {
    // 디렉토리 내용만 삭제하고 디렉토리는 유지
    const files = fs.readdirSync(targetDir);
    for (const file of files) {
      const filePath = path.join(targetDir, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  }

  try {
    const zipFile = await openZip(zipPath, { lazyEntries: true });
    const extractedFiles: string[] = [];
    let totalEntries = 0;
    let processedEntries = 0;

    // 전체 항목 수 조회
    await new Promise<void>((resolve, reject) => {
      zipFile.on('entry', () => {
        totalEntries++;
        zipFile.readEntry();
      });

      zipFile.on('end', () => {
        resolve();
      });

      zipFile.on('error', (err) => {
        reject(err);
      });

      zipFile.readEntry();
    });

    // ZIP 파일 닫고 다시 열기 (항목 재탐색)
    zipFile.close();
    const extractZipFile = await openZip(zipPath, { lazyEntries: true });

    // 압축 해제 처리
    return await new Promise<ExtractionResult>((resolve, reject) => {
      const extractedFiles: string[] = [];

      extractZipFile.on('entry', (entry) => {
        processedEntries++;

        // 디렉토리인 경우
        if (entry.fileName.endsWith('/')) {
          const dirPath = path.join(targetDir, entry.fileName);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
          extractZipFile.readEntry();
          return;
        }

        // 필터링
        const shouldInclude = includeFiles.length === 0 ||
          includeFiles.some(pattern => entry.fileName.includes(pattern));
        const shouldExclude = excludePatterns.some(pattern =>
          pattern.test(entry.fileName)
        );

        if (!shouldInclude || shouldExclude) {
          extractZipFile.readEntry();
          return;
        }

        // 파일명 변환
        const finalFileName = transformFilename ?
          transformFilename(entry.fileName) : entry.fileName;

        // 추출 경로
        const extractPath = path.join(targetDir, finalFileName);
        const extractDir = path.dirname(extractPath);

        // 디렉토리 생성
        if (!fs.existsSync(extractDir)) {
          fs.mkdirSync(extractDir, { recursive: true });
        }

        // 파일이 이미 존재하고 덮어쓰기가 비활성화된 경우
        if (fs.existsSync(extractPath) && !overwrite) {
          extractZipFile.readEntry();
          return;
        }

        // 항목 콜백
        if (onEntry) {
          onEntry(entry.fileName, extractPath);
        }

        // 파일 추출
        extractZipFile.openReadStream(entry, (err, readStream) => {
          if (err) {
            extractZipFile.close();
            reject(new Error(`파일 추출 중 오류 발생: ${err.message}`));
            return;
          }

          const writeStream = fs.createWriteStream(extractPath);

          writeStream.on('close', () => {
            extractedFiles.push(finalFileName);

            // 진행 상황 업데이트
            if (onProgress) {
              onProgress(processedEntries, totalEntries);
            }

            extractZipFile.readEntry();
          });

          writeStream.on('error', (err) => {
            extractZipFile.close();
            reject(new Error(`파일 쓰기 중 오류 발생: ${err.message}`));
          });

          readStream.pipe(writeStream);
        });
      });

      extractZipFile.on('end', () => {
        resolve({
          success: true,
          extractedFiles
        });
      });

      extractZipFile.on('error', (err) => {
        reject(new Error(`압축 해제 중 오류 발생: ${err.message}`));
      });

      extractZipFile.readEntry();
    });
  } catch (error) {
    return {
      success: false,
      extractedFiles: [],
      errorMessage: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * 앱 리소스 경로에 압축 파일 추출
 * @param zipPath 압축 파일 경로
 * @param resourceType 리소스 유형 (images, sounds, data 등)
 * @param options 추가 옵션
 */
export async function extractToAppResources(
  zipPath: string,
  resourceType: string,
  options: Partial<ExtractionOptions> = {}
): Promise<ExtractionResult> {
  const resourceDir = path.join(app.getPath('userData'), 'resources', resourceType);

  return await extractZip(zipPath, {
    targetDir: resourceDir,
    cleanTargetDir: false,
    overwrite: true,
    ...options
  });
}

/**
 * 임시 디렉토리에 압축 파일 추출
 * @param zipPath 압축 파일 경로
 * @param subDir 임시 디렉토리 내 서브 디렉토리 이름
 * @param options 추가 옵션
 */
export async function extractToTemp(
  zipPath: string,
  subDir: string,
  options: Partial<ExtractionOptions> = {}
): Promise<ExtractionResult> {
  const tempDir = path.join(app.getPath('temp'), 'app-extracts', subDir);

  return await extractZip(zipPath, {
    targetDir: tempDir,
    cleanTargetDir: true,
    ...options
  });
}

/**
 * 업데이트 파일 처리
 * @param zipPath 압축 파일 경로
 * @param fileType 파일 유형
 * @param onProgress 진행 상황 콜백
 * @param targetFolder 사용자 지정 대상 폴더 (지정하지 않으면 기본 앱 폴더 사용)
 */
export async function handleUpdateFile(
  zipPath: string,
  fileType: 'core' | 'resource' | 'content',
  onProgress?: (extracted: number, total: number) => void,
  targetFolder?: string
): Promise<ExtractionResult> {
  switch (fileType) {
    case 'core':
      // 코어 파일은 앱 업데이트 처리기에서 별도 처리 필요
      return {
        success: true,
        extractedFiles: [zipPath]
      };

    case 'resource':
      // 리소스 파일은 앱의 리소스 디렉토리에 추출
      if (targetFolder) {
        return await extractZip(zipPath, {
          targetDir: targetFolder,
          onProgress,
          overwrite: true
        });
      } else {
        return await extractToAppResources(zipPath, 'resources', {
          onProgress,
          overwrite: true
        });
      }

    case 'content':
      // 컨텐츠 파일은 앱의 컨텐츠 디렉토리에 추출 또는 사용자 지정 폴더에 추출
      if (targetFolder) {
        return await extractZip(zipPath, {
          targetDir: targetFolder,
          onProgress,
          overwrite: true
        });
      } else {
        return await extractToAppResources(zipPath, 'content', {
          onProgress,
          overwrite: true
        });
      }

    default:
      return {
        success: false,
        extractedFiles: [],
        errorMessage: '알 수 없는 파일 유형'
      };
  }
}
