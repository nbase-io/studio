import React, { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertCircle,File as FileIcon } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '../lib/utils'

// 컴포넌트 임포트
import FolderTreeView, { S3Object } from './FolderTreeView'
import FileListView from './FileListView'
import FileToolbar from './FileToolbar'

// 파일 업로드 상태 인터페이스
interface FileUploadStatus {
  id: string;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  size: number;
  errorMessage?: string;
  speed?: number; // 전송 속도(바이트/초)
  timeRemaining?: number; // 남은 시간(초)
  lastUpdate?: number; // 마지막 업데이트 시간
  uploadedBytes?: number; // 업로드된 바이트 수
}


// 간단한 Progress 컴포넌트
const CustomProgress = ({ value = 0, className = "" }: { value?: number, className?: string }) => (
  <div className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-100 ${className}`}>
    <div
      className="h-full w-full flex-1 bg-blue-500 transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </div>
);

const FileManager: React.FC = () => {
  // 상태 관리
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [s3Objects, setS3Objects] = useState<S3Object[]>([]);
  const [fileList, setFileList] = useState<S3Object[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>('/');
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['/']);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<S3Object[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<S3Object[]>([]);
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const { toast } = useToast();

  // 업로드 다이얼로그 상태
  const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);
  const [fileUploads, setFileUploads] = useState<FileUploadStatus[]>([]);
  const [overallProgress, setOverallProgress] = useState<number>(0);

  // 에러 다이얼로그 상태
  const [errorDialogOpen, setErrorDialogOpen] = useState<boolean>(false);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [errorTitle, setErrorTitle] = useState<string>("");

  // 새 폴더 생성 상태
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState<boolean>(false);

  // 삭제 확인 다이얼로그 상태
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [filesToDelete, setFilesToDelete] = useState<S3Object[]>([]);

  // 에러 로그 다이얼로그 표시 함수
  const showErrorDialog = (title: string, message: string) => {
    setErrorTitle(title);
    setErrorLogs(prev => [...prev, `${new Date().toLocaleString()}: ${message}`]);
    setErrorDialogOpen(true);
  };

  // 기본 S3 설정 (API가 없을 경우 사용)
  const defaultS3Config = {
    bucket: 'my-sample-bucket',
    region: 'us-east-1',
    accessKeyId: 'sample-key',
    secretAccessKey: 'sample-secret'
  };

  // S3 설정 가져오기 함수
  const getS3Config = async () => {
    console.log('[S3Config] S3 설정 가져오기 시작');
    try {
      // window.api를 통해 설정 가져오기
      if (window.api && typeof window.api.getS3Config === 'function') {
        console.log('[S3Config] window.api.getS3Config 함수 호출');
        const config = await window.api.getS3Config();

        // 반환된 설정 확인
        if (config) {
          console.log('[S3Config] S3 설정 로드 성공:', {
            bucket: config.bucket,
            region: config.region,
            accessKeyId: config.accessKeyId ? '***' : '설정되지 않음', // 보안을 위해 실제 키는 로그에 출력하지 않음
            secretKeySet: config.secretAccessKey ? true : false,
            cdnUrl: config.cdnUrl || '설정되지 않음',
            endpointUrl: (config as any).endpointUrl || '설정되지 않음'
          });
          return config;
        } else {
          console.warn('[S3Config] S3 설정이 null 또는 undefined 반환됨');
        }
      } else {
        console.error('[S3Config] window.api.getS3Config 함수를 찾을 수 없음');
      }

      // 로컬 스토리지에서 설정 가져오기 시도
      console.log('[S3Config] 로컬 스토리지에서 설정 가져오기');
      const settings = localStorage.getItem('settings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        console.log('[S3Config] 로컬 스토리지에서 설정 로드됨:', {
          bucket: parsedSettings.s3Bucket || '설정되지 않음',
          region: parsedSettings.region || 'ap-northeast-2',
          accessKeySet: parsedSettings.accessKey ? true : false,
          secretKeySet: parsedSettings.secretKey ? true : false,
          cdnUrl: parsedSettings.cdnUrl || '설정되지 않음',
          endpointUrl: parsedSettings.endpointUrl || '설정되지 않음'
        });

        // 로컬 스토리지에서 가져온 설정으로 S3Config 객체 생성
        return {
          bucket: parsedSettings.s3Bucket || '',
          region: parsedSettings.region || 'ap-northeast-2',
          accessKeyId: parsedSettings.accessKey || '',
          secretAccessKey: parsedSettings.secretKey || '',
          cdnUrl: parsedSettings.cdnUrl || '',
          endpointUrl: (parsedSettings as any).endpointUrl || ''
        };
      } else {
        console.warn('[S3Config] 로컬 스토리지에 설정이 없음');
      }

      // 기본 설정 반환
      console.warn('[S3Config] 기본 설정 반환');
      return {
        bucket: '',
        region: 'ap-northeast-2',
        accessKeyId: '',
        secretAccessKey: '',
        cdnUrl: '',
        endpointUrl: ''
      };
    } catch (error) {
      console.error('[S3Config] S3 설정 가져오기 오류:', error);
      // 오류 발생 시 기본 설정 반환
      return {
        bucket: '',
        region: 'ap-northeast-2',
        accessKeyId: '',
        secretAccessKey: '',
        cdnUrl: '',
        endpointUrl: ''
      };
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    const loadS3Objects = async () => {
      console.log('[S3] 루트 폴더 객체 로드 시작');
      try {
        setLoading(true);

        // S3 설정 로드
        const s3Config = await getS3Config();
        console.log('[S3] 설정 로드 완료, 버킷:', s3Config.bucket);

        // 버킷 이름이 설정되지 않은 경우 처리
        if (!s3Config.bucket) {
          console.error('[S3] 버킷 이름이 설정되지 않음');
          showErrorDialog(
            'S3 설정 오류',
            'S3 버킷이 설정되지 않았습니다. 설정 메뉴에서 S3 설정을 구성하세요.'
          );
          setLoading(false);
          return;
        }

        // 액세스 키가 설정되지 않은 경우 처리
        if (!s3Config.accessKeyId || !s3Config.secretAccessKey) {
          console.error('[S3] AWS 액세스 키가 설정되지 않음');
          showErrorDialog(
            'S3 설정 오류',
            'AWS 액세스 키가 설정되지 않았습니다. 설정 메뉴에서 S3 설정을 구성하세요.'
          );
          setLoading(false);
          return;
        }

        console.log('[S3] 실제 S3 서버에서 데이터 가져오기 시작');
        // 실제 S3 서버에서 데이터 가져오기
        if (window.api && typeof (window.api as any).listS3Files === 'function') {
          try {
            console.log('[S3] API 호출: listS3Files, 버킷:', s3Config.bucket, '프리픽스: ""(루트)');
            const result = await (window.api as any).listS3Files({
              bucket: s3Config.bucket,
              prefix: '' // 루트 디렉토리
            });

            // API 응답 확인
            if (result.error) {
              console.error('[S3] API 오류 발생:', result.error);
              showErrorDialog('S3 연결 오류', `S3 서버에 연결하는 중 오류가 발생했습니다: ${result.error}`);
              setLoading(false);
              return;
            }

            console.log('[S3] 파일 목록 로드 성공:', {
              파일수: result.files?.length || 0,
              폴더수: result.folders?.length || 0
            });


            // 폴더 경로 정규화 (중복 슬래시 제거)
            const normalizedFolders = (result.folders || []).map(folder =>
              folder.replace(/\/+/g, '/')
            );

            console.log('[S3] 정규화된 폴더 목록:', normalizedFolders);

            // 루트 폴더 생성
            const rootFolder: S3Object = {
              key: '/',
              displayName: '/',
              type: 'folder',
              children: []
            };

            // 최상위 폴더 객체 생성 (1단계 깊이)
            const topLevelFolders = normalizedFolders
              .filter(f => f.split('/').filter(Boolean).length === 1)
              .map(folderPath => {
                const folderName = folderPath.split('/').filter(Boolean)[0];
                return {
                  key: folderPath,
                  displayName: folderName,
                  type: 'folder' as const,
                  children: []
                };
              });

            // 루트 폴더에 최상위 폴더 설정
            rootFolder.children = topLevelFolders;

            // 폴더와 파일 목록 설정
            setS3Objects([rootFolder]); // 루트 폴더만 최상위로 설정
            setFolders(normalizedFolders);
            setCurrentPath('/');

            // 기본적으로 루트 폴더 확장
            setExpandedFolders(['/']);
            setSelectedFolder('/');

            console.log('[S3] 초기 데이터 로드 완료, 현재 경로: /', rootFolder);
          } catch (error) {
            console.error('[S3] 데이터 가져오기 중 예외 발생:', error);
            showErrorDialog('S3 연결 오류', `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
          }
        } else {
          console.error('[S3] window.api.listS3Files 함수를 찾을 수 없음');
          showErrorDialog('API 오류', 'S3 파일 목록을 가져오는 API를 사용할 수 없습니다.');
        }
      } catch (error) {
        console.error('[S3] 전체 로드 과정에서 오류 발생:', error);
        showErrorDialog('오류', `S3 객체를 로드하는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      } finally {
        setLoading(false);
      }
    };

    // 초기 로드 실행
    loadS3Objects();
  }, []);

  // 특정 폴더의 내용을 로드하는 함수
  const loadFolderContents = async (folderKey: string) => {
    console.log('[S3] 폴더 내용 로드 시작:', folderKey);
    try {
      setLoading(true);

      // S3 설정 가져오기
      const s3Config = await getS3Config();
      console.log('[S3] 설정 로드 완료, 버킷:', s3Config.bucket);

      if (window.api && typeof (window.api as any).listS3Files === 'function') {
        // S3 서버에서 폴더 내용 가져오기
        // 'root' 키는 실제 S3 경로가 아니므로 빈 문자열로 대체
        const prefix = folderKey === '/' ? '' : folderKey;

        // 중복 슬래시 제거하고 디버깅을 위해 로그 출력
        const normalizedPrefix = prefix.replace(/\/+/g, '/');
        console.log('[S3] API 요청 프리픽스(정규화 전):', prefix);
        console.log('[S3] API 요청 프리픽스(정규화 후):', normalizedPrefix);

        try {
          console.log('[S3] API 호출: listS3Files, 버킷:', s3Config.bucket, '프리픽스:', normalizedPrefix);
          const result = await (window.api as any).listS3Files({
            bucket: s3Config.bucket,
            prefix: normalizedPrefix
          });

          // API 응답 확인
          if (result.error) {
            console.error('[S3] API 오류 발생:', result.error);
            showErrorDialog('S3 연결 오류', `S3 서버에 연결하는 중 오류가 발생했습니다: ${result.error}`);
            setLoading(false);
            return;
          }

          console.log('[S3] 폴더 내용 로드 성공:', {
            폴더: folderKey,
            파일수: result.files?.length || 0,
            폴더수: result.folders?.length || 0
          });

          // 파일 목록 처리
          const newFiles: S3Object[] = (result.files || [])
            .filter(file => {
              // 폴더 자체는 제외 (일부 S3 구현에서는 폴더도 객체로 반환)
              // 키가 prefix와 같은 경우 제외 (자기 자신)
              return file.key !== normalizedPrefix && !file.key.endsWith('/');
            })
            .map(file => ({
              key: file.key,
              size: file.size,
              lastModified: file.lastModified,
              type: 'file' as const
            }));

          console.log('[S3] 파싱된 파일 목록:', newFiles.map(f => ({ key: f.key, size: f.size })));

          // 폴더 목록 처리
          // 폴더 경로 정규화 (중복 슬래시 제거)
          const newFolders = (result.folders || []).map(folder =>
            folder.replace(/\/+/g, '/')
          );

          console.log('[S3] 파싱된 폴더 목록:', newFolders);

          // 현재 폴더 경로의 직계 하위 폴더만 필터링
          const directChildFolders = newFolders.filter(folder => {
            if (folderKey === '/') {
              // 루트 폴더의 경우, 첫 번째 수준의 폴더만 선택
              const segments = folder.split('/').filter(Boolean);
              return segments.length === 1;
            } else {
              // 일반 폴더의 경우, folderKey 제외하고 한 단계 더 깊은 폴더만 선택
              const folderKeySegments = folderKey.split('/').filter(Boolean);
              const segments = folder.split('/').filter(Boolean);

              // folderKey의 직계 하위 폴더만 포함
              return segments.length === folderKeySegments.length + 1 &&
                folder.startsWith(folderKey === '/' ? '' : folderKey);
            }
          });

          console.log('[S3] 직계 하위 폴더:', directChildFolders);

          // 직계 하위 폴더 객체 생성
          const childFolderObjects: S3Object[] = directChildFolders.map(folder => {
            const folderSegments = folder.split('/').filter(Boolean);
            const folderName = folderSegments[folderSegments.length - 1];
            return {
              key: folder,
              displayName: folderName,
              type: 'folder' as const,
              children: [] // 초기에는 빈 하위 폴더
            };
          });

          // 상태 업데이트
          setFiles(newFiles);
          setFolders(directChildFolders);
          setCurrentPath(folderKey);

          // 트리 상태 업데이트
          setS3Objects(prev => {
            // 폴더 찾고 업데이트하는 재귀 함수
            const updateFolderChildren = (folders: S3Object[]): S3Object[] => {
              return folders.map(folder => {
                if (folder.key === folderKey) {
                  // 현재 폴더 찾음, 하위 폴더 업데이트
                  return {
                    ...folder,
                    children: childFolderObjects
                  };
                } else if (folder.children && folder.children.length > 0) {
                  // 재귀적으로 하위 폴더 검색
                  return {
                    ...folder,
                    children: updateFolderChildren(folder.children)
                  };
                }
                return folder;
              });
            };

            // 트리 업데이트 적용
            return updateFolderChildren(prev);
          });

          console.log('[S3] 폴더 내용 로드 완료, 현재 경로:', folderKey);
        } catch (error) {
          console.error('[S3] 폴더 내용 가져오기 중 예외 발생:', error);
          showErrorDialog('S3 연결 오류', `오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        }
      } else {
        console.error('[S3] window.api.listS3Files 함수를 찾을 수 없음');
        showErrorDialog('API 오류', 'S3 파일 목록을 가져오는 API를 사용할 수 없습니다.');
      }
    } catch (error) {
      console.error('[S3] 전체 폴더 로드 과정에서 오류 발생:', error);
      showErrorDialog('오류', `폴더 내용을 로드하는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  // 폴더 선택 핸들러
  const handleSelectFolder = (key: string) => {
    setSelectedFolder(key);
    setCurrentPath(key);
    setSelectedFile(null);

    // 폴더 내용 로드
    loadFolderContents(key);
  };

  // 폴더 확장/축소 핸들러
  const handleToggleFolder = (key: string) => {
    if (expandedFolders.includes(key)) {
      setExpandedFolders(expandedFolders.filter(k => k !== key));
    } else {
      setExpandedFolders([...expandedFolders, key]);
    }
  };

  // 파일 업로드 핸들러
  const handleUpload = async () => {
    // File selection dialog implementation
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true; // Allow multiple file selection
    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        // Create initial file upload statuses
        const initialFileUploads: FileUploadStatus[] = Array.from(target.files).map((file) => ({
          id: Math.random().toString(36).substring(2, 11),
          name: file.name,
          progress: 0,
          status: 'pending',
          size: file.size
        }));

        setFileUploads(initialFileUploads);
        setUploadDialogOpen(true);
        setIsUploading(true);

        // Process each file
        for (let i = 0; i < target.files.length; i++) {
          const file = target.files[i];
          await uploadFileToS3(file, i, initialFileUploads);
        }
      }
    };
    fileInput.click();
  };

  // 파일 객체를 임시 파일로 변환하는 함수
  const saveFileToTemp = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        console.log(`대용량 파일 처리 시작: ${file.name}, 크기: ${file.size} 바이트`);

        // 대용량 파일의 경우 createTempFile과 appendToTempFile API를 사용
        const processLargeFile = async () => {
          try {
            // 1. 임시 파일 생성
            if (!window.api || typeof window.api.createTempFile !== 'function') {
              throw new Error('createTempFile API가 정의되지 않았습니다');
            }

            console.log('임시 파일 생성 중...');
            const tempFilePath = await window.api.createTempFile({
              fileName: file.name,
              totalSize: file.size
            });

            if (!tempFilePath) {
              throw new Error('임시 파일 생성 실패');
            }

            console.log(`임시 파일 생성됨: ${tempFilePath}`);

            // 2. 청크 단위로 파일 업로드
            const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB 청크
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const chunk = file.slice(start, end);

              // 청크 데이터 읽기
              const chunkBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                  if (!e.target || !e.target.result) {
                    reject(new Error('청크 읽기 실패'));
                    return;
                  }
                  resolve(e.target.result as ArrayBuffer);
                };
                reader.onerror = () => reject(new Error('청크 읽기 중 오류 발생'));
                reader.readAsArrayBuffer(chunk);
              });

              // 청크 데이터를 임시 파일에 추가
              if (!window.api || typeof window.api.appendToTempFile !== 'function') {
                throw new Error('appendToTempFile API가 정의되지 않았습니다');
              }

              console.log(`청크 ${i+1}/${totalChunks} 추가 중... (${start}-${end})`);
              const result = await window.api.appendToTempFile({
                filePath: tempFilePath,
                buffer: chunkBuffer,
                offset: start
              });

              if (!result.success) {
                throw new Error(result.error || '청크 추가 실패');
              }
            }

            console.log('모든 청크 업로드 완료');
            resolve(tempFilePath);
          } catch (error) {
            console.error('대용량 파일 처리 중 오류:', error);
            reject(error);
          }
        };

        // 대용량 파일 처리 시작
        processLargeFile();
      } catch (error) {
        console.error('saveFileToTemp 오류:', error);
        reject(error);
      }
    });
  };

  // Upload file to S3
  const uploadFileToS3 = async (file: File, index: number, uploadStatuses: FileUploadStatus[]) => {
    console.log('[Upload] 파일 업로드 시작:', { 파일명: file.name, 크기: file.size, 인덱스: index });

    try {
      // 이미 완료된 파일은 건너뛰기
      if (uploadStatuses[index].status === 'completed') {
        console.log('[Upload] 이미 완료된 파일 건너뛰기:', file.name);
        return;
      }

      // S3 설정 가져오기
      const s3Config = await getS3Config();
      console.log('[Upload] S3 설정 로드 완료:', {
        버킷: s3Config.bucket,
        리전: s3Config.region
      });

      // 매개변수 유효성 검사
      if (!s3Config.bucket || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
        console.error('[Upload] 필수 S3 설정 누락');
        throw new Error('S3 버킷 또는 액세스 키가 설정되지 않았습니다.');
      }

      // 진행 상태 업데이트 함수
      const updateProgress = (progress: number) => {
        console.log(`[Upload] 진행률 업데이트: ${file.name} - ${progress}%`);
        setFileUploads(prev => {
          const newUploads = [...prev];
          if (newUploads[index]) {
            newUploads[index] = {
              ...newUploads[index],
              progress: progress,
              status: progress >= 100 ? 'completed' : 'uploading'
            };
          }
          return newUploads;
        });

        // 전체 진행률 계산 및 업데이트
        setFileUploads(prev => {
          const overallProgress = prev.reduce((sum, file) => sum + file.progress, 0) / prev.length;
          setOverallProgress(overallProgress);
          return prev;
        });
      };

      // 임시 파일로 저장
      console.log('[Upload] 임시 파일로 저장 시작:', file.name);
      const tempFilePath = await saveFileToTemp(file);
      console.log('[Upload] 임시 파일 생성 완료:', tempFilePath);

      if (!tempFilePath) {
        console.error('[Upload] 임시 파일 생성 실패:', file.name);
        throw new Error('임시 파일 생성에 실패했습니다.');
      }

      // 업로드 경로 설정
      const s3Key = currentPath === '/'
        ? file.name
        : `${currentPath.replace(/^\//, '').replace(/\/$/, '')}/${file.name}`;

      console.log('[Upload] S3 업로드 키:', s3Key);

      // 진행 상태 업데이트
      updateProgress(25); // 임시 파일 생성 완료 = 25%

      // S3에 업로드
      console.log('[Upload] S3 업로드 시작');
      const uploadResult = await (window.api as any).uploadFileToS3({
        filePath: tempFilePath,
        bucket: s3Config.bucket,
        key: s3Key,
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        region: s3Config.region || 'ap-northeast-2'
      });

      // 3. 업로드 결과 처리
      if (uploadResult && uploadResult.success) {
        console.log(`[Upload] 파일 업로드 성공:`, {
          파일명: file.name,
          S3위치: (uploadResult as any).location,
          키: s3Key
        });

        // 성공 상태로 업데이트
        setFileUploads(prev => {
          const newUploads = [...prev];
          newUploads[index] = {
            ...newUploads[index],
            progress: 100,
            status: 'completed'
          };
          return newUploads;
        });

        // 현재 폴더 새로고침
        console.log('[Upload] 현재 폴더 새로고침:', currentPath);
        await loadFolderContents(currentPath);

        // 토스트 알림
        toast({
          title: '업로드 완료',
          description: `${file.name} 파일이 업로드되었습니다.`
        });

        return (uploadResult as any).location;
      } else {
        console.error('[Upload] 파일 업로드 실패:', uploadResult?.error || '알 수 없는 오류');
        throw new Error(uploadResult?.error || '파일 업로드에 실패했습니다.');
      }
    } catch (error) {
      console.error('[Upload] 업로드 중 오류 발생:', error);

      // 오류 상태로 업데이트
      setFileUploads(prev => {
        const newUploads = [...prev];
        newUploads[index] = {
          ...newUploads[index],
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
        };
        return newUploads;
      });

      // 토스트 알림
      toast({
        title: '업로드 실패',
        description: `${file.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        variant: 'destructive'
      });

      throw error;
    }
  };

  // Close upload dialog
  const handleCloseUploadDialog = () => {
    // Only close if not uploading or if all files are completed/error
    const canClose = !isUploading || fileUploads.every(file =>
      file.status === 'completed' || file.status === 'error'
    );

    if (canClose) {
      setUploadDialogOpen(false);
      setFileUploads([]);
      setOverallProgress(0);
    } else {
      toast({
        title: "Upload in progress",
        description: "Please wait until all uploads complete",
      });
    }
  };

  // Cancel upload
  const handleCancelUpload = async () => {
    try {
      // 활성 업로드 작업 취소 요청
      setIsCancelling(true);

      if (window.api && typeof (window.api as any).cancelUpload === 'function') {
        const result = await (window.api as any).cancelUpload();

        if (result.success) {
          console.log('업로드 취소 성공');

          // 업로드 상태 업데이트
          setFileUploads(prev => {
            return prev.map(file => {
              if (file.status === 'uploading') {
                return {
                  ...file,
                  status: 'error',
                  progress: 0,
                  errorMessage: '사용자에 의해 취소됨'
                };
              }
              return file;
            });
          });

          // 업로드 상태 초기화
          setIsUploading(false);
          setOverallProgress(0);

          toast({
            title: "업로드 취소됨",
            description: "파일 업로드가 취소되었습니다.",
          });
        } else {
          throw new Error(result.error || '취소 실패');
        }
      } else {
        // API를 사용할 수 없는 경우 - 폴백: 단순히 UI 상태만 변경
        setIsUploading(false);
        setUploadDialogOpen(false);
        setFileUploads([]);
        setOverallProgress(0);

        toast({
          title: "업로드 취소됨",
          description: "파일 업로드가 취소되었습니다.",
        });
      }
    } catch (error: any) {
      console.error('업로드 취소 중 오류:', error);
      toast({
        title: "취소 실패",
        description: error.message || '알 수 없는 오류가 발생했습니다.',
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // 파일 클릭 핸들러
  const handleFileClick = (file: S3Object, event?: React.MouseEvent) => {
    // 체크박스 영역을 클릭한 경우 동작하지 않도록 (체크박스 자체 이벤트가 처리)
    if (event && (event.target as HTMLElement).closest('.checkbox-container')) {
      console.log('[DEBUG] 체크박스 영역 클릭, 파일 클릭 이벤트 중단');
      return;
    }

    console.log('[DEBUG] 파일 클릭:', file.key);

    // Ctrl/Cmd 키를 누른 경우 다중 선택 처리
    if (event && (event.ctrlKey || event.metaKey)) {
      const isAlreadySelected = selectedFiles.some(f => f.key === file.key);

      if (isAlreadySelected) {
        // 이미 선택된 파일을 다시 클릭하면 선택 해제
        setSelectedFiles(selectedFiles.filter(f => f.key !== file.key));
        if (selectedFile?.key === file.key) {
          setSelectedFile(null);
        }
      } else {
        // 선택 목록에 추가
        setSelectedFiles([...selectedFiles, file]);
        setSelectedFile(file);
      }
    } else {
      // 일반 클릭 - 단일 선택
      if (selectedFile && selectedFile.key === file.key) {
        // 이미 선택된 파일을 다시 클릭하면 선택 해제
        setSelectedFile(null);
        setSelectedFiles([]);
      } else {
        // 새 파일 선택
        setSelectedFile(file);
        setSelectedFiles([file]);
      }
    }
  };

  // 파일 더블클릭 핸들러
  const handleFileDoubleClick = (file: S3Object) => {
    // 파일 다운로드 또는 미리보기 등의 작업 수행
    handleDownload(file);
  };

  // 파일 선택 토글 핸들러 (체크박스 사용)
  const handleSelectFile = (file: S3Object, selected: boolean) => {
    console.log('[DEBUG] 체크박스 변경:', file.key, selected);

    if (selected) {
      // 파일 선택 추가
      if (!selectedFiles.some(f => f.key === file.key)) {
        setSelectedFiles(prev => [...prev, file]);
      }
    } else {
      // 파일 선택 해제
      setSelectedFiles(prev => prev.filter(f => f.key !== file.key));

      // 현재 선택된 파일이 체크 해제되었다면 선택 해제
      if (selectedFile?.key === file.key) {
        setSelectedFile(null);
      }
    }
  };

  // Folder click handler
  const handleFolderClick = (folder: string) => {
    setCurrentPath(folder);
    setSelectedFolder(folder);
    loadFolderContents(folder);
    setSelectedFile(null);
    setSelectedFiles([]);
  };

  // Navigate up handler
  const navigateUp = () => {
    if (!currentPath || currentPath === '/') {
      console.log('[DEBUG] Already at root, not navigating up');
      return;
    }

    console.log('[DEBUG] navigateUp - Current path:', currentPath);
    const pathParts = currentPath.split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/') || '/'; // 부모 경로가 없으면 '/'
    console.log('[DEBUG] navigateUp - Parent path:', parentPath);

    setCurrentPath(parentPath);
    setSelectedFolder(parentPath);

    // 루트로 이동 - 'root' 대신 '/' 사용
    loadFolderContents(parentPath);
  };

  // Refresh files handler
  const loadFiles = async () => {
    setLoading(true);
    try {
      // 실제 S3 파일 목록 가져오기
      const s3Config = await getS3Config();

      if (window.api && typeof (window.api as any).listS3Files === 'function') {
        // 'root' 키는 실제 S3 경로가 아니므로 빈 문자열로 대체
        const prefix = currentPath === '/' ? '' : currentPath;
        console.log('[DEBUG] loadFiles - Using prefix:', prefix);

        const result = await (window.api as any).listS3Files({
          bucket: s3Config.bucket,
          prefix
        });

        const filesInPath = result.files.map(file => ({
          key: file.key,
          size: file.size,
          lastModified: file.lastModified,
          type: 'file' as const
        }));

        setFiles(filesInPath);
        setFolders(result.folders);
      }
    } catch (error) {
      const errorMessage = 'Failed to load files: ' + (error instanceof Error ? error.message : String(error));
      console.error('Error loading files:', error);
      setError(errorMessage);
      showErrorDialog('Failed to load files', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Delete file handler - 삭제 확인 다이얼로그 표시
  const handleDelete = async () => {
    // 다중 선택된 파일이 있으면 그것들을 사용, 없으면 단일 선택된 파일 사용
    const filesToDelete = selectedFiles.length > 0 ? selectedFiles : (selectedFile ? [selectedFile] : []);

    if (filesToDelete.length === 0) return;

    // 삭제할 파일 목록 설정하고 다이얼로그 표시
    setFilesToDelete(filesToDelete);
    setDeleteDialogOpen(true);
  };

  // 실제 파일 삭제 처리
  const confirmDelete = async () => {
    try {
      const s3Config = await getS3Config();
      const deleteResults: Array<{file: S3Object, success: boolean, error?: string}> = [];

      if (window.api && typeof (window.api as any).deleteFileFromS3 === 'function') {
        // 모든 파일에 대해 삭제 실행
        for (const file of filesToDelete) {
          const result = await (window.api as any).deleteFileFromS3({
            bucket: s3Config.bucket,
            key: file.key
          });

          deleteResults.push({
            file,
            success: result.success,
            error: result.error
          });
        }

        // 성공한 파일 수 계산
        const successCount = deleteResults.filter(r => r.success).length;

        if (successCount > 0) {
          // 성공 메시지 표시
          toast({
            title: successCount === 1 ? "파일 삭제 완료" : `${successCount}개 파일 삭제 완료`,
            description: successCount === 1
              ? `${filesToDelete[0]?.displayName || filesToDelete[0]?.key.split('/').pop() || filesToDelete[0]?.key} 파일이 삭제되었습니다.`
              : `${successCount}개의 파일이 삭제되었습니다.`,
          });

          // 파일 목록 새로고침
          loadFiles();
          setSelectedFile(null);
          setSelectedFiles([]);
        }

        // 실패한 파일이 있으면 오류 메시지 표시
        const failedFiles = deleteResults.filter(r => !r.success);
        if (failedFiles.length > 0) {
          toast({
            title: "일부 파일 삭제 실패",
            description: `${failedFiles.length}개 파일을 삭제하지 못했습니다.`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "삭제 기능 오류",
          description: "S3 파일 삭제 API를 사용할 수 없습니다.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('파일 삭제 오류:', error);
      toast({
        title: "삭제 실패",
        description: error.message || '파일 삭제 중 오류가 발생했습니다.',
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFilesToDelete([]);
    }
  };

  // Rename file handler
  const handleRename = async (file: S3Object) => {
    if (!file) return;

    // 새 파일명 입력 받기
    const newName = prompt("Enter new file name:", file.key.split('/').pop());
    if (!newName || newName === file.key.split('/').pop()) return;

    try {
      const s3Config = await getS3Config();

      // 파일 경로 생성
      const pathParts = file.key.split('/');
      pathParts.pop(); // 기존 파일명 제거
      const newPath = [...pathParts, newName].join('/');

      if (window.api && typeof (window.api as any).renameFileInS3 === 'function') {
        const result = await (window.api as any).renameFileInS3({
          bucket: s3Config.bucket,
          oldKey: file.key,
          newKey: newPath
        });

        if (result.success) {
          toast({
            title: "File renamed",
            description: `File has been renamed to ${newName} successfully`,
          });

          // 파일 목록 새로고침
          loadFiles();
          setSelectedFile(null);
        } else {
          throw new Error(result.error || 'Failed to rename file');
        }
      } else {
        // API가 없을 경우 메시지 표시
        console.log('API not available: window.api.renameFileInS3');
        toast({
          title: "Rename feature",
          description: `API not available to rename ${file.key}`,
        });
      }
    } catch (error: any) {
      console.error('File rename error:', error);
      toast({
        title: "Rename failed",
        description: error.message || 'Failed to rename file',
        variant: "destructive",
      });
    }
  };

  // Download file handler
  const handleDownload = async (file: S3Object) => {
    if (!file) return;

    try {
      const s3Config = await getS3Config();

      if (window.api && typeof (window.api as any).downloadFileFromS3 === 'function') {
        // 파일 이름을 키에서 추출
        const fileName = file.key.split('/').pop();

        // 사용자에게 저장 위치 선택 요청 - 파일명을 defaultPath로 전달
        const saveResult = await (window.api as any).selectSaveLocation({
          defaultPath: fileName
        });

        if (saveResult.canceled || !saveResult.filePath) {
          console.log('사용자가 다운로드를 취소했습니다.');
          return;
        }

        toast({
          title: "다운로드 시작",
          description: `${fileName} 파일을 다운로드합니다...`,
        });

        const result = await (window.api as any).downloadFileFromS3({
          bucket: s3Config.bucket,
          key: file.key,
          destination: saveResult.filePath,
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey,
          region: s3Config.region
        });

        if (result.success) {
          console.log('Download complete:', result);
          toast({
            title: "다운로드 완료",
            description: `${fileName} 파일이 성공적으로 다운로드되었습니다.`,
          });
        } else {
          throw new Error(result.error || 'Failed to download file');
        }
      } else {
        console.log('API not available: window.api.downloadFileFromS3');
        toast({
          title: "Download feature",
          description: `API not available to download ${file.key}`,
        });
      }
    } catch (error: any) {
      console.error('File download error:', error);
      toast({
        title: "Download failed",
        description: error.message || 'Failed to download file',
        variant: "destructive",
      });
    }
  };

  // 새 폴더 생성 다이얼로그 열기
  const handleCreateFolder = () => {
    setNewFolderName("");
    setNewFolderDialogOpen(true);
  };

  // 새 폴더 생성 함수
  const createFolder = async () => {
    if (!newFolderName || newFolderName.trim() === '') {
      toast({
        title: "유효하지 않은 폴더명",
        description: "폴더 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingFolder(true);

    try {
      const s3Config = await getS3Config();

      // 현재 경로에 새 폴더 경로 추가
      const folderPath = currentPath
        ? `${currentPath.replace(/\/$/, '')}/${newFolderName}/`
        : `${newFolderName}/`;

      // S3에서는 폴더를 생성하기 위해 폴더 경로를 키로 하는 빈 객체를 업로드
      if (window.api && typeof window.api.uploadFileToS3 === 'function') {
        // 빈 텍스트 파일 생성
        const emptyContent = '';
        const emptyBlob = new Blob([emptyContent], { type: 'text/plain' });
        // 전역 File 객체 사용 (lucide-react의 File 아이콘과 충돌 방지)
        const emptyFile = new window.File([emptyBlob], '.keep', { type: 'text/plain' });

        // 텍스트 파일을 임시 파일로 변환
        const tempFilePath = await saveFileToTemp(emptyFile);

        // S3에 업로드
        const uploadResult = await window.api.uploadFileToS3({
          filePath: tempFilePath,
          bucket: s3Config.bucket,
          key: folderPath + '.keep',
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey,
          region: s3Config.region
        });

        // 임시 파일 삭제
        if (window.api.deleteTempFile && tempFilePath) {
          await window.api.deleteTempFile({ filePath: tempFilePath });
        }

        if (uploadResult.success) {
          toast({
            title: "폴더 생성 완료",
            description: `'${newFolderName}' 폴더가 생성되었습니다.`,
          });

          // 폴더 목록 새로고침
          loadFolderContents(currentPath);
        } else {
          throw new Error(uploadResult.error || '폴더 생성 실패');
        }
      } else {
        toast({
          title: "API 오류",
          description: "폴더 생성 API를 사용할 수 없습니다.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('폴더 생성 오류:', error);
      toast({
        title: "폴더 생성 실패",
        description: error.message || '알 수 없는 오류가 발생했습니다.',
        variant: "destructive",
      });
    } finally {
      setIsCreatingFolder(false);
      setNewFolderDialogOpen(false);
    }
  };

  useEffect(() => {
    // 파일 업로드 진행률 리스너 설정
    const handleUploadProgress = (_: any, data: any) => {
      // 업로드 진행 이벤트를 처리하는 함수
      console.log('[UploadProgress] 업로드 진행 상태 업데이트:', {
        key: data.key,
        percentage: data.percentage,
        loaded: data.loaded,
        total: data.total,
        completed: data.completed,
        failed: data.failed
      });

      // 업로드 실패 처리
      if (data.failed) {
        console.error('[UploadProgress] 업로드 실패:', data.error);
        toast({
          title: '업로드 실패',
          description: data.error || '알 수 없는 오류가 발생했습니다',
          variant: "destructive"
        });
        return;
      }

      // 진행 중인 업로드 찾기
      setFileUploads(prev => {
        // 새 배열 생성 (상태 불변성 유지)
        const newUploads = [...prev];

        // 키에서 파일 이름 부분 추출
        const fileName = data.key?.split('/').pop();
        if (!fileName) {
          console.warn('[UploadProgress] 파일 이름을 추출할 수 없음:', data.key);
          return prev;
        }

        // 해당 파일 찾기
        const fileIndex = newUploads.findIndex(file =>
          file.name && data.key && data.key.includes(file.name)
        );

        if (fileIndex === -1) {
          console.warn('[UploadProgress] 일치하는 파일을 찾을 수 없음:', fileName);
          return prev;
        }

        // 현재 파일 정보
        const currentFile = newUploads[fileIndex];
        const now = Date.now();

        // 마지막 업데이트 시간과 업로드된 바이트 수
        const lastUpdate = currentFile.lastUpdate || now;
        const lastBytes = currentFile.uploadedBytes || 0;
        const currentBytes = data.loaded || 0;

        // 시간 간격이 충분히 있을 때만 속도 계산 (UI 업데이트 최적화)
        if (now - lastUpdate > 500) {
          // 속도 계산 (bytes/sec)
          const timeDiff = (now - lastUpdate) / 1000; // 초 단위로 변환
          let speed = currentFile.speed || 0;

          if (timeDiff > 0) {
            // 바이트 차이 계산
            const byteDiff = currentBytes - lastBytes;
            // 현재 순간 속도
            const instantSpeed = byteDiff / timeDiff;
            // 이동 평균으로 속도 계산 (급격한 변화를 완화)
            speed = currentFile.speed ? (currentFile.speed * 0.7 + instantSpeed * 0.3) : instantSpeed;

            console.log('[UploadProgress] 속도 계산:', {
              파일: fileName,
              경과시간: timeDiff.toFixed(2) + '초',
              전송바이트: byteDiff,
              속도: Math.round(speed / 1024) + 'KB/s'
            });
          }

          // 남은 시간 계산 (초)
          let timeRemaining = 0;
          if (speed > 0) {
            const remainingBytes = currentFile.size - currentBytes;
            timeRemaining = remainingBytes / speed;
            console.log('[UploadProgress] 남은 시간 계산:', {
              파일: fileName,
              남은바이트: remainingBytes,
              속도: Math.round(speed / 1024) + 'KB/s',
              남은시간: timeRemaining.toFixed(1) + '초'
            });
          }

          // 파일 진행률 업데이트 (속도 및 남은 시간 포함)
          newUploads[fileIndex] = {
            ...currentFile,
            progress: data.percentage,
            status: data.completed ? 'completed' : 'uploading',
            lastUpdate: now,
            uploadedBytes: currentBytes,
            speed,
            timeRemaining
          };

          // 전체 진행률 업데이트
          const totalProgress = newUploads.reduce((acc, file) => acc + file.progress, 0) / newUploads.length;
          setOverallProgress(totalProgress);
        } else {
          // 업데이트 간격이 너무 짧으면 진행률만 업데이트
          newUploads[fileIndex] = {
            ...newUploads[fileIndex],
            progress: data.percentage,
            status: data.completed ? 'completed' : 'uploading',
            uploadedBytes: currentBytes
          };
        }

        return newUploads;
      });
    };

    // 업로드 취소 완료 리스너
    const handleUploadCancelled = (_: any, data: any) => {
      // 업로드 취소 완료 이벤트 처리
      console.log('[UploadCancel] 업로드 취소 완료:', data);

      if (data.success) {
        // 모든 업로드 작업 취소 완료
        setIsUploading(false);
        console.log('[UploadCancel] 모든 업로드 취소 완료');

        // 진행 중이던 모든 파일을 '취소됨' 상태로 변경
        setFileUploads(prev => {
          console.log('[UploadCancel] 파일 상태 업데이트: 취소됨으로 설정');
          return prev.map(file => {
            if (file.status === 'uploading') {
              return {
                ...file,
                status: 'error',
                progress: 0,
                errorMessage: '사용자에 의해 취소됨'
              };
            }
            return file;
          });
        });

        // 토스트 알림
        toast({
          title: '업로드 취소됨',
          description: '모든 파일 업로드가 취소되었습니다.'
        });
      } else {
        // 취소 실패 처리
        console.error('[UploadCancel] 업로드 취소 실패:', data.error);
        toast({
          title: '업로드 취소 실패',
          description: data.error || '알 수 없는 오류',
          variant: 'destructive'
        });
      }
    };

    // 리스너 등록
    window.api.on('upload-progress', handleUploadProgress);
    window.api.on('upload-cancelled', handleUploadCancelled);

    // 클린업
    return () => {
      window.api.off('upload-progress', handleUploadProgress);
      window.api.off('upload-cancelled', handleUploadCancelled);
    };
  }, [toast]);

  // 파일 크기 포맷팅 함수
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 시간 포맷팅 함수
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '계산 중...';

    // 5초 미만은 "계산 중..."으로 표시 (초기 계산이 불안정할 수 있음)
    if (seconds < 5) return '계산 중...';

    // 반올림해서 표시
    const roundedSeconds = Math.round(seconds);

    if (roundedSeconds < 60) return `${roundedSeconds}초`;

    const minutes = Math.floor(roundedSeconds / 60);
    const remainingSeconds = roundedSeconds % 60;

    if (minutes < 60) return `${minutes}분 ${remainingSeconds}초`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}시간 ${remainingMinutes}분`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className="flex flex-col h-full border-t">
        <FileToolbar
          currentPath={currentPath}
          uploading={isUploading}
          uploadProgress={uploadProgress}
          selectedFile={selectedFile}
          selectedFiles={selectedFiles}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNavigateUp={navigateUp}
          onRefresh={loadFiles}
          onUpload={handleUpload}
          onDelete={handleDelete}
          onRename={handleRename}
          onDownload={handleDownload}
          onCreateFolder={handleCreateFolder}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽 폴더 트리 */}
          <div className="w-64 lg:w-72 xl:w-80">
            <FolderTreeView
              objects={s3Objects}
              selectedFolder={selectedFolder}
              expandedFolders={expandedFolders}
              onSelectFolder={handleSelectFolder}
              onToggleFolder={handleToggleFolder}
            />
          </div>

          {/* 오른쪽 파일 목록 */}
          <div className="flex-1 min-h-0">
            <FileListView
              loading={loading}
              currentPath={currentPath}
              files={files}
              folders={folders}
              selectedFile={selectedFile}
              selectedFiles={selectedFiles}
              viewMode={viewMode}
              onFileClick={handleFileClick}
              onFolderClick={handleFolderClick}
              onClearSelection={() => setSelectedFiles([])}
              onFileDoubleClick={handleFileDoubleClick}
              onSelectFile={handleSelectFile}
            />
          </div>
        </div>
      </div>

      {/* 업로드 진행 대화상자 */}
      <Dialog open={uploadDialogOpen} onOpenChange={handleCloseUploadDialog}>
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>파일 업로드 중</DialogTitle>
            <DialogDescription>
              {isUploading
                ? "서버에 파일을 업로드하는 중입니다. 이 대화상자를 닫지 마세요."
                : "모든 파일이 성공적으로 업로드되었습니다."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium flex justify-between">
                <span>전체 진행률</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <CustomProgress value={overallProgress} className="h-2" />

              {/* 남은 시간 및 속도 정보 추가 */}
              {isUploading && fileUploads.length > 0 && (
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>
                    예상 남은 시간: {
                      formatTime(
                        Math.max(
                          ...fileUploads
                            .filter(f => f.status === 'uploading')
                            .map(f => f.timeRemaining || 0)
                        )
                      )
                    }
                  </span>
                  <span>
                    평균 속도: {
                      formatFileSize(
                        fileUploads
                          .filter(f => f.status === 'uploading')
                          .reduce((acc, f) => acc + (f.speed || 0), 0) /
                          fileUploads.filter(f => f.status === 'uploading').length || 1
                      )
                    }/s
                  </span>
                </div>
              )}
            </div>

            <div className="border rounded-md">
              <ScrollArea className="h-60">
                <div className="p-4 space-y-3">
                  {fileUploads.map((file) => (
                    <div key={file.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center">
                          {file.status === 'uploading' && <Loader2 className="h-4 w-4 mr-2 animate-spin text-blue-500" />}
                          {file.status === 'completed' && <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />}
                          {file.status === 'error' && <AlertCircle className="h-4 w-4 mr-2 text-red-500" />}
                          <span className="font-medium truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <span className="text-gray-500 text-xs">
                          {formatFileSize(file.size)}
                          {file.status === 'uploading' && file.speed && file.timeRemaining ? (
                            <> • {formatFileSize(file.speed)}/s • {formatTime(file.timeRemaining)}</>
                          ) : null}
                        </span>
                      </div>

                      <CustomProgress
                        value={file.progress}
                        className={cn(
                          "h-1",
                          file.status === 'completed' ? "bg-green-100" : "",
                          file.status === 'error' ? "bg-red-100" : ""
                        )}
                      />

                      {file.status === 'error' && (
                        <p className="text-xs text-red-500">{file.errorMessage || '업로드 실패'}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              {isUploading && (
                <Button
                  variant="outline"
                  onClick={handleCancelUpload}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      취소 중...
                    </>
                  ) : (
                    '업로드 취소'
                  )}
                </Button>
              )}
            </div>
            <Button
              type="button"
              disabled={isUploading}
              onClick={handleCloseUploadDialog}
            >
              {isUploading ? "업로드 중..." : "닫기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete File Confirmation</DialogTitle>
            <DialogDescription>
              {filesToDelete.length === 1
                ? `Are you sure you want to delete "${filesToDelete[0]?.displayName || filesToDelete[0]?.key.split('/').pop() || filesToDelete[0]?.key}"?`
                : `Are you sure you want to delete ${filesToDelete.length} selected files?`}
            </DialogDescription>
          </DialogHeader>

          {filesToDelete.length > 1 && (
            <ScrollArea className="max-h-60 mt-2">
              <div className="space-y-1">
                {filesToDelete.map((file) => (
                  <div key={file.key} className="flex items-center text-sm border-b py-1 last:border-0">
                    <FileIcon className="h-3.5 w-3.5 mr-2 text-gray-500" />
                    <span className="truncate">{file.displayName || file.key.split('/').pop() || file.key}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 에러 로그 다이얼로그 */}
      <Dialog open={errorDialogOpen} onOpenChange={() => setErrorDialogOpen(false)}>
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>{errorTitle || 'Error Occurred'}</DialogTitle>
            <DialogDescription>
              An error occurred while loading files. Detailed logs are below.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="border rounded-md bg-gray-50">
              <ScrollArea className="h-60">
                <div className="p-4 space-y-2 font-mono text-sm">
                  {errorLogs.length === 0 ? (
                    <p className="text-gray-500 italic">No logs available.</p>
                  ) : (
                    errorLogs.map((log, index) => (
                      <div key={index} className="border-b border-gray-200 pb-2 last:border-0">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setErrorDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 새 폴더 생성 다이얼로그 */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 폴더 생성</DialogTitle>
            <DialogDescription>
              현재 위치에 새 폴더를 생성합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="name" className="text-right text-sm font-medium">
                폴더 이름
              </label>
              <input
                id="name"
                className="col-span-3 flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter new folder name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={createFolder} disabled={isCreatingFolder}>
              {isCreatingFolder ? (
                <>
                  <span className="mr-2">생성 중...</span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "생성"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileManager;
