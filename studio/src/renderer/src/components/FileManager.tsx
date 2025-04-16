import React, { useState, useEffect, useRef } from 'react'
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
import { Loader2, CheckCircle2, AlertCircle, X, File as FileIcon } from 'lucide-react'
import { Progress } from './ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '../lib/utils'

// 컴포넌트 임포트
import FolderTreeView, { S3Object } from './FolderTreeView'
import FileListView from './FileListView'
import FileToolbar from './FileToolbar'

// window.api 타입 정의
declare global {
  interface Window {
    api: {
      loadSettings: () => Promise<Record<string, unknown>>;
      saveSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      getS3Config: () => Promise<{
        bucket: string;
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
        cdnUrl?: string;
      } | null>;
      uploadFileToS3: (params: {
        filePath: string;
        bucket: string;
        key: string;
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
      }) => Promise<{ success: boolean; location?: string; error?: string }>;
      listS3Files: (params: {
        bucket: string;
        prefix?: string;
      }) => Promise<{ files: any[]; folders: string[]; error?: string }>;
      selectFile: (options?: any) => Promise<string[]>;
      createTempFile: (params: { fileName: string; totalSize: number }) => Promise<string | null>;
      appendToTempFile: (params: { filePath: string; buffer: ArrayBuffer; offset: number }) => Promise<{ success: boolean; error?: string }>;
      deleteTempFile: (params: { filePath: string }) => Promise<{ success: boolean; error?: string }>;
      deleteFileFromS3: (params: any) => Promise<{ success: boolean; error?: string }>;

      // 이벤트 리스너 관리
      on: (channel: string, listener: (...args: any[]) => void) => any;
      off: (channel: string, listener: (...args: any[]) => void) => any;
    };
  }
}

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
  const [selectedFolder, setSelectedFolder] = useState<string | null>('');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
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
    try {
      if (!window.api || typeof window.api.getS3Config !== 'function') {
        console.error('window.api.getS3Config 함수가 정의되지 않았습니다.');

        // localStorage에서 정보 가져오기 (대체 방법)
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return {
          bucket: settings.bucketName || 'my-default-bucket',
          accessKeyId: settings.accessKey || '',
          secretAccessKey: settings.secretKey || '',
          region: settings.region || 'ap-northeast-2',
          cdnUrl: settings.cdnUrl || ''
        };
      }

      const config = await window.api.getS3Config();
      if (!config) {
        throw new Error('S3 설정을 가져오지 못했습니다');
      }

      return config;
    } catch (error) {
      console.error('S3 설정 가져오기 오류:', error);
      toast({
        title: 'S3 설정 오류',
        description: '설정을 가져오는 중 오류가 발생했습니다. 기본값을 사용합니다.'
      });

      // 오류 발생 시 기본값 반환
      return {
        bucket: 'my-default-bucket',
        accessKeyId: '',
        secretAccessKey: '',
        region: 'ap-northeast-2',
        cdnUrl: ''
      };
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    const loadS3Objects = async () => {
      try {
        setLoading(true);
        setError(null);

        // S3 설정 가져오기
        const s3Config = await getS3Config();

        if (!s3Config.bucket || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
          console.warn('S3 configuration is incomplete. Please enter S3 information in the settings menu.');
          // 빈 폴더 구조 생성
          const rootNode: S3Object = {
            key: '/',
            type: 'folder',
            children: []
          };

          setS3Objects([rootNode]);
          setExpandedFolders(['/']);
          setLoading(false);
          return;
        }

        // 실제 S3 서버에서 데이터 가져오기
        if (window.api && typeof window.api.listS3Files === 'function') {
          try {
            const result = await window.api.listS3Files({
              bucket: s3Config.bucket,
              prefix: '' // 루트 디렉토리
            });

            // S3 구조로 데이터 변환
            const rootFolders: S3Object[] = result.folders.map(folder => {
              // 폴더 이름만 추출 (경로의 마지막 부분)
              const folderName = folder.split('/').filter(part => part.trim() !== '').pop() || folder;

              return {
                key: folder,
                displayName: folderName,
                type: 'folder',
                children: [] // 나중에 하위 항목을 로드할 때 채워짐
              };
            });

            // 루트 노드 생성
            const rootNode: S3Object = {
              key: '/',
              displayName: '/',
              type: 'folder',
              children: rootFolders
            };

            setS3Objects([rootNode]);
            setExpandedFolders(['/']); // 루트 노드는 항상 펼침
            setFolders(result.folders);

            // // 루트 폴더의 파일 목록
            // const rootFiles: S3Object[] = result.files.map(file => ({
            //   key: file.key,
            //   size: file.size,
            //   lastModified: file.lastModified,
            //   type: 'file'
            // }));

            // setFiles(rootFiles);

            // // 초기 폴더 설정
            // if (rootFolders.length > 0) {
            //   const firstFolder = rootFolders[0].key;
            //   setSelectedFolder(firstFolder);
            //   setCurrentPath(firstFolder);
            //   // 첫 번째 폴더 내용 로드
            //   loadFolderContents(firstFolder);
            // }
          } catch (apiError: any) {
            console.error('S3 API 호출 오류:', apiError);

            const rootNode: S3Object = {
              key: '/',
              type: 'folder',
              children: []
            };

            setS3Objects([rootNode]);
            setExpandedFolders(['/']);
          }
        } else {
          // API가 사용 불가능할 경우 빈 구조 생성
          console.warn('listS3Files API not available');

          const rootNode: S3Object = {
            key: '/',
            type: 'folder',
            children: []
          };

          setS3Objects([rootNode]);
          setExpandedFolders(['/']);
        }
      } catch (err) {
        const errorMessage = 'Failed to load file list: ' + (err instanceof Error ? err.message : String(err));
        setError(errorMessage);
        console.error('Error loading S3 objects:', err);
        showErrorDialog('Failed to load files', errorMessage);

        // 에러 발생 시에도 기본 UI는 표시
        const rootNode: S3Object = {
          key: '/',
          type: 'folder',
          children: []
        };

        setS3Objects([rootNode]);
        setExpandedFolders(['/']);
      } finally {
        setLoading(false);
      }
    };

    // 초기 로드 실행
      loadS3Objects();
  }, []);

  // 특정 폴더의 내용을 로드하는 함수
  const loadFolderContents = async (folderKey: string) => {
    console.log('[DEBUG] loadFolderContents - Loading folder:', folderKey);
    setLoading(true);
    try {
      const s3Config = await getS3Config();

      if (window.api && typeof window.api.listS3Files === 'function') {
        // S3 서버에서 폴더 내용 가져오기
        // 'root' 키는 실제 S3 경로가 아니므로 빈 문자열로 대체
        const prefix = folderKey === '/' ? '' : folderKey;
        console.log('[DEBUG] S3 API Request prefix:', prefix);

        const result = await window.api.listS3Files({
          bucket: s3Config.bucket,
          prefix
        });

        console.log('[DEBUG] S3 API Result:', JSON.stringify({
          files: result.files.length,
          folders: result.folders.length,
          prefix: folderKey
        }));

        // 파일 목록 변환
        const folderFiles: S3Object[] = result.files.map(file => ({
          key: file.key,
          size: file.size,
          lastModified: file.lastModified,
          type: 'file'
        }));

        // 하위 폴더 목록 변환
        const subFolders: S3Object[] = result.folders.map(folder => ({
          key: folder,
          type: 'folder',
          children: [] // 나중에 필요할 때 로드
        }));

        console.log('[DEBUG] Processed folder contents:', {
          folderFiles: folderFiles.length,
          subFolders: subFolders.length
        });

        // 폴더 내용 업데이트
        const updatedObjects = [...s3Objects];

        // 해당 폴더 찾기
        const updateFolderChildren = (objects: S3Object[], key: string): boolean => {
          console.log('[DEBUG] updateFolderChildren - Searching for key:', key, 'in objects:', objects.map(o => o.key));

          for (let i = 0; i < objects.length; i++) {
            if (objects[i].key === key) {
              console.log('[DEBUG] Found folder to update:', key);
              // 중요: children을 빈 배열이라도 항상 설정하여 구조 유지
              objects[i].children = [...subFolders, ...folderFiles];
              return true;
            }
            if (objects[i].children) {
              const objChildren = objects[i].children;
              if (objChildren && objChildren.length > 0) {
                if (updateFolderChildren(objChildren, key)) {
                  return true;
                }
              }
            }
          }
          console.log('[DEBUG] Could not find folder:', key);
          return false;
        };

        const updateResult = updateFolderChildren(updatedObjects, folderKey);
        console.log('[DEBUG] Update result:', updateResult);

        // 업데이트 성공했을 때만 상태 업데이트
        if (updateResult) {
          setS3Objects(updatedObjects);
          console.log('[DEBUG] Updated s3Objects:', updatedObjects);
        } else {
          console.warn('[DEBUG] Could not update folder structure for:', folderKey);
          // 폴더 구조 업데이트 실패 시 객체를 찾을 수 없는 경우 처리
          // 구조 강제 유지 로직 추가
          if (s3Objects.length === 0) {
            const rootNode: S3Object = {
              key: '/',
              type: 'folder',
              children: []
            };
            setS3Objects([rootNode]);
            setExpandedFolders(prev => {
              if (!prev.includes('root')) return [...prev, '/'];
              return prev;
            });
          }
        }

        // 파일 리스트 업데이트 - 항상 수행
        setFileList([...subFolders, ...folderFiles]);

        // 현재 폴더의 파일과 하위 폴더 설정
        setFiles(folderFiles);
        setFolders(result.folders);

      } else {
        // API가 없는 경우 모의 데이터 사용
        console.warn('listS3Files API is not available');
      }
    } catch (error) {
      const errorMessage = 'Failed to load folder contents: ' + (error instanceof Error ? error.message : String(error));
      console.error('[DEBUG] Error loading folder contents:', error);
      setError(errorMessage);
      showErrorDialog('Failed to load folder contents', errorMessage);

      // 에러 발생 시에도 폴더 트리는 유지
      if (s3Objects.length === 0) {
        const rootNode: S3Object = {
          key: '/',
          type: 'folder',
          children: []
        };
        setS3Objects([rootNode]);
        setExpandedFolders(['/']);
      }
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
    // Update status to uploading
    setFileUploads(prev => {
      const newUploads = [...prev];
      newUploads[index] = { ...newUploads[index], status: 'uploading' };
      return newUploads;
    });

    let tempFilePath = '';

    try {
      // Prepare file path based on current directory (슬래시 중복 방지)
      const s3FilePath = currentPath
        ? `${currentPath.replace(/\/$/, '')}/${file.name}`
        : file.name;

      // Get S3 client config from window API
      const s3Config = await getS3Config();

      // Track upload progress
      const updateProgress = (progress: number) => {
        setFileUploads(prev => {
          const newUploads = [...prev];
          newUploads[index] = { ...newUploads[index], progress };

          // Calculate overall progress
          const totalProgress = newUploads.reduce((sum, file) => sum + file.progress, 0) / newUploads.length;
          setOverallProgress(totalProgress);

          return newUploads;
        });
      };

      // 개발/테스트 환경에서 시뮬레이션 업로드 사용
      if (process.env.NODE_ENV === 'development' && typeof window.api.uploadFileToS3 !== 'function') {
        console.log('시뮬레이션 업로드 진행...');
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 10;
          if (progress > 100) progress = 100;

          updateProgress(progress);

          if (progress === 100) {
            clearInterval(interval);

            // Set status to completed
            setFileUploads(prev => {
              const newUploads = [...prev];
              newUploads[index] = { ...newUploads[index], status: 'completed' };
              return newUploads;
            });

            // If all files completed, refresh the file list
            const allCompleted = uploadStatuses.every((upload, i) =>
              i > index || uploadStatuses[i].status === 'completed'
            );

            if (allCompleted) {
              setTimeout(() => {
                loadFiles();
                setIsUploading(false);
              }, 1000);
            }
          }
        }, 300);

        return;
      }

      try {
        console.log(`파일 ${file.name} 업로드 시작...`);

        // 1. 파일을 임시 파일로 저장
        tempFilePath = await saveFileToTemp(file);
        console.log(`임시 파일 생성 완료: ${tempFilePath}`);

        // 업로드 진행 표시 (25%)
        updateProgress(25);

        // 2. S3 업로드 실행
        console.log(`S3 업로드 시작: ${s3FilePath}`);
        const uploadResult = await window.api.uploadFileToS3({
          filePath: tempFilePath,
          bucket: s3Config.bucket,
          key: s3FilePath,
          accessKeyId: s3Config.accessKeyId,
          secretAccessKey: s3Config.secretAccessKey,
          region: s3Config.region
        });

        // 업로드 진행 표시 (100%)
        updateProgress(100);

        // 3. 업로드 결과 처리
        if (uploadResult && uploadResult.success) {
          console.log(`파일 업로드 성공: ${uploadResult.location}`);

          // 성공 상태로 업데이트
          setFileUploads(prev => {
            const newUploads = [...prev];
            newUploads[index] = {
              ...newUploads[index],
              status: 'completed',
              progress: 100
            };
            return newUploads;
          });

          // 임시 파일 정리
          if (window.api.deleteTempFile && tempFilePath) {
            try {
              await window.api.deleteTempFile({ filePath: tempFilePath });
              console.log('Temporary file cleanup complete');
            } catch (tempError) {
              console.warn('Failed to clean up temporary file:', tempError);
            }
          }
        } else {
          throw new Error(uploadResult && uploadResult.error ? uploadResult.error : 'Upload failed');
        }
      } catch (uploadError: any) {
        console.error('File upload error:', uploadError);
        throw uploadError;
      }

      // If this is the last file, refresh the file list
      if (index === uploadStatuses.length - 1) {
        setTimeout(() => {
          loadFiles();
          setIsUploading(false);
        }, 1000);
      }
    } catch (error: any) {
      console.error('File upload error:', error);

      // 임시 파일 정리 시도
      if (window.api.deleteTempFile && tempFilePath) {
        try {
          await window.api.deleteTempFile({ filePath: tempFilePath });
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary file:', cleanupError);
        }
      }

      // Set status to error
      setFileUploads(prev => {
        const newUploads = [...prev];
        newUploads[index] = {
          ...newUploads[index],
          status: 'error',
          errorMessage: error instanceof Error ? error.message : '알 수 없는 오류'
        };
        return newUploads;
      });

      toast({
        title: "Upload failed",
        description: `Failed to upload ${file.name}: ${error.message || '알 수 없는 오류'}`,
        variant: "destructive",
      });
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

      if (window.api && typeof window.api.cancelUpload === 'function') {
        const result = await window.api.cancelUpload();

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
    // 클릭된 파일이 이미 선택되어 있는지 확인
    if (selectedFile && selectedFile.key === file.key) {
      // 이미 선택된 파일을 다시 클릭하면 선택 해제
      setSelectedFile(null);
      setSelectedFiles(selectedFiles.filter(f => f.key !== file.key));
    } else {
      // Ctrl 키를 누르지 않은 경우 기존 선택 초기화
      if (!event || !(event.ctrlKey || event.metaKey)) {
        setSelectedFiles([file]);
      } else {
        // Ctrl 키를 누른 경우 해당 파일을 선택 목록에 추가
        const isAlreadySelected = selectedFiles.some(f => f.key === file.key);
        if (isAlreadySelected) {
          setSelectedFiles(selectedFiles.filter(f => f.key !== file.key));
        } else {
          setSelectedFiles([...selectedFiles, file]);
        }
      }
      setSelectedFile(file);
    }
  };

  // 파일 더블클릭 핸들러
  const handleFileDoubleClick = (file: S3Object) => {
    // 파일 다운로드 또는 미리보기 등의 작업 수행
    handleDownload(file);
  };

  // 파일 선택 토글 핸들러
  const handleSelectFile = (file: S3Object, selected: boolean) => {
    if (selected) {
      // 파일 선택 추가
      if (!selectedFiles.some(f => f.key === file.key)) {
        setSelectedFiles([...selectedFiles, file]);
      }
    } else {
      // 파일 선택 해제
      setSelectedFiles(selectedFiles.filter(f => f.key !== file.key));
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

      if (window.api && typeof window.api.listS3Files === 'function') {
        // 'root' 키는 실제 S3 경로가 아니므로 빈 문자열로 대체
        const prefix = currentPath === '/' ? '' : currentPath;
        console.log('[DEBUG] loadFiles - Using prefix:', prefix);

        const result = await window.api.listS3Files({
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
      const deleteResults = [];

      if (window.api && typeof window.api.deleteFileFromS3 === 'function') {
        // 모든 파일에 대해 삭제 실행
        for (const file of filesToDelete) {
          const result = await window.api.deleteFileFromS3({
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
              ? `${filesToDelete[0].key.split('/').pop()} 파일이 삭제되었습니다.`
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

      if (window.api && typeof window.api.renameFileInS3 === 'function') {
        const result = await window.api.renameFileInS3({
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

      if (window.api && typeof window.api.downloadFileFromS3 === 'function') {
        // 파일 이름을 키에서 추출
        const fileName = file.key.split('/').pop();

        // 사용자에게 저장 위치 선택 요청 - 파일명을 defaultPath로 전달
        const saveResult = await window.api.selectSaveLocation({
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

        const result = await window.api.downloadFileFromS3({
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
      if (data.failed) {
        toast({
          title: '업로드 실패',
          description: data.error || '알 수 없는 오류가 발생했습니다',
          variant: "destructive"
        });
        return;
      }

      // 취소됨 확인
      if (data.cancelled) {
        console.log('업로드 취소 알림 수신:', data);
        setFileUploads(prev => {
          const newUploads = [...prev];
          const fileIndex = newUploads.findIndex(file =>
            file.name && data.key && data.key.includes(file.name)
          );

          if (fileIndex !== -1) {
            newUploads[fileIndex] = {
              ...newUploads[fileIndex],
              status: 'error',
              progress: 0,
              errorMessage: '사용자에 의해 취소됨'
            };
          }

          return newUploads;
        });
        return;
      }

      // 현재 업로드 중인 파일 찾기
      setFileUploads(prev => {
        const now = Date.now();
        const newUploads = [...prev];
        const fileIndex = newUploads.findIndex(file =>
          file.name && data.key && data.key.includes(file.name)
        );

        if (fileIndex !== -1) {
          const currentFile = newUploads[fileIndex];
          const lastUpdate = currentFile.lastUpdate || now;
          const lastBytes = currentFile.uploadedBytes || 0;
          const currentBytes = data.loaded || 0;

          // 속도 계산 (bytes/sec)
          const timeDiff = (now - lastUpdate) / 1000; // 초 단위로 변환
          let speed = currentFile.speed || 0;

          // 최소 0.5초 이상 간격이 있을 때만 속도 계산 (너무 빈번한 업데이트 방지)
          if (timeDiff > 0.5) {
            const byteDiff = currentBytes - lastBytes;

            // 실제로 데이터가 전송되었을 때만 속도 계산
            if (byteDiff > 0) {
              const instantSpeed = byteDiff / timeDiff;

              // 급격한 변화 방지를 위한 이동 평균 적용 (이전 속도에 더 높은 가중치)
              // 더 안정적인 표시를 위해 가중치 조정 (0.7 -> 0.9)
              if (speed > 0) {
                speed = speed * 0.9 + instantSpeed * 0.1;
              } else {
                speed = instantSpeed;
              }
            }
            // 데이터가 전송되지 않았다면 기존 속도 유지하되 약간 감소
            else if (speed > 0) {
              speed = speed * 0.95; // 약간의 감소 적용
            }

            // 남은 시간 계산 (초)
            let timeRemaining = currentFile.timeRemaining || 0;
            if (speed > 0) {
              const remainingBytes = currentFile.size - currentBytes;
              const newTimeRemaining = remainingBytes / speed;

              // 남은 시간도 이동 평균으로 안정화
              if (timeRemaining > 0) {
                timeRemaining = timeRemaining * 0.8 + newTimeRemaining * 0.2;
              } else {
                timeRemaining = newTimeRemaining;
              }

              // 값이 너무 크거나 작으면 제한
              if (timeRemaining > 86400) timeRemaining = 86400; // 최대 24시간
              if (timeRemaining < 0) timeRemaining = 0;
            }

            // 파일 진행률 업데이트
            newUploads[fileIndex] = {
              ...newUploads[fileIndex],
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
        }

        return newUploads;
      });
    };

    // 업로드 취소 완료 리스너
    const handleUploadCancelled = (_: any, data: any) => {
      console.log('업로드 취소 완료:', data);

      if (data.success) {
        // 모든 업로드 작업 취소 완료
        setIsUploading(false);

        // 진행 중이던 모든 파일을 '취소됨' 상태로 변경
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
            <DialogTitle>파일 삭제 확인</DialogTitle>
            <DialogDescription>
              {filesToDelete.length === 1
                ? `${filesToDelete[0]?.key.split('/').pop()} 파일을 삭제하시겠습니까?`
                : `선택한 ${filesToDelete.length}개 파일을 삭제하시겠습니까?`}
            </DialogDescription>
          </DialogHeader>

          {filesToDelete.length > 1 && (
            <ScrollArea className="max-h-60 mt-2">
              <div className="space-y-1">
                {filesToDelete.map((file) => (
                  <div key={file.key} className="flex items-center text-sm border-b py-1 last:border-0">
                    <FileIcon className="h-3.5 w-3.5 mr-2 text-gray-500" />
                    <span className="truncate">{file.key.split('/').pop()}</span>
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
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
            >
              삭제
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
                placeholder="새 폴더 이름을 입력하세요"
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
