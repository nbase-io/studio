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
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { Progress } from './ui/progress'
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
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
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
      // S3 설정 로드 시도
      if (!window.api) {
        console.error('window.api가 정의되지 않았습니다.');
        showErrorDialog('API 오류', 'Electron IPC API가 정의되지 않았습니다. 애플리케이션을 재시작해주세요.');
        return defaultS3Config;
      }

      if (typeof window.api.getS3Config !== 'function') {
        console.error('window.api.getS3Config 함수가 정의되지 않았습니다.');
        showErrorDialog('API 오류', 'S3 설정 API가 정의되지 않았습니다. 애플리케이션을 재시작해주세요.');
        return defaultS3Config;
      }

      try {
        const config = await window.api.getS3Config();
        return config;
      } catch (error: any) {
        console.error('S3 설정 가져오기 오류:', error);
        showErrorDialog('S3 설정 오류', `S3 설정을 가져오는 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        return defaultS3Config;
      }
    } catch (error: any) {
      console.error('S3 설정 가져오기 오류:', error);
      return defaultS3Config;
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
              displayName: 'Root',
              type: 'folder',
              children: rootFolders
            };

            setS3Objects([rootNode]);
            setExpandedFolders(['/']); // 루트 노드는 항상 펼침
            setFolders(result.folders);

            // 루트 폴더의 파일 목록
            const rootFiles: S3Object[] = result.files.map(file => ({
              key: file.key,
              size: file.size,
              lastModified: file.lastModified,
              type: 'file'
            }));

            setFiles(rootFiles);

            // 초기 폴더 설정
            if (rootFolders.length > 0) {
              const firstFolder = rootFolders[0].key;
              setSelectedFolder(firstFolder);
              setCurrentPath(firstFolder);
              // 첫 번째 폴더 내용 로드
              loadFolderContents(firstFolder);
            }
          } catch (apiError: any) {
            console.error('S3 API 호출 오류:', apiError);
            // 모의 데이터로 fallback
            useMockData();
          }
        } else {
          // API가 사용 불가능할 경우 모의 데이터 사용
          console.warn('listS3Files API not available, using mock data');
          useMockData();
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

    // 모의 데이터 사용 함수
    const useMockData = () => {
      // 모의 데이터
      const mockData: S3Object[] = [
        {
          key: 'builds',
          type: 'folder',
          children: [
            {
              key: 'builds/android',
              type: 'folder',
              children: [
                { key: 'builds/android/game-v1.0.apk', type: 'file', size: 15000000, lastModified: new Date() },
                { key: 'builds/android/game-v1.1.apk', type: 'file', size: 16500000, lastModified: new Date() }
              ]
            },
            {
              key: 'builds/ios',
              type: 'folder',
              children: [
                { key: 'builds/ios/game-v1.0.ipa', type: 'file', size: 18000000, lastModified: new Date() }
              ]
            }
          ]
        },
        {
          key: 'assets',
          type: 'folder',
          children: [
            {
              key: 'assets/images',
              type: 'folder',
              children: [
                { key: 'assets/images/logo.png', type: 'file', size: 250000, lastModified: new Date() }
              ]
            }
          ]
        }
      ];

      // 루트 노드 생성
      const rootNode: S3Object = {
        key: '/',
        type: 'folder',
        children: mockData
      };

      setS3Objects([rootNode]);
      setExpandedFolders(['/']); // 루트 노드는 항상 펼침

      // 초기 선택된 폴더 설정
      if (mockData.length > 0) {
        setSelectedFolder(mockData[0].key);
        setCurrentPath(mockData[0].key);

        // 첫 번째 폴더의 내용 설정
        const files = mockData[0].children?.filter(item => item.type === 'file') || [];
        const subfolders = mockData[0].children?.filter(item => item.type === 'folder') || [];

        setFileList([...subfolders, ...files]);
      }
    };

    // 컴포넌트 마운트 시 S3 객체 로드
    setTimeout(() => {
      loadS3Objects();
    }, 500); // 약간의 지연을 주어 설정이 먼저 로드될 수 있도록 함
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
        // 파일을 ArrayBuffer로 읽기
        const reader = new FileReader();

        reader.onload = async (event) => {
          try {
            if (!event.target || !event.target.result) {
              throw new Error('파일 읽기 실패');
            }

            // 파일 데이터를 ArrayBuffer로 변환
            const arrayBuffer = event.target.result as ArrayBuffer;

            // 메인 프로세스를 통해 임시 파일로 저장
            if (!window.api || !window.api.saveTempFile) {
              throw new Error('saveTempFile API가 정의되지 않았습니다');
            }

            const tempFilePath = await window.api.saveTempFile({
              buffer: arrayBuffer,
              fileName: file.name
            });

            if (!tempFilePath) {
              throw new Error('임시 파일 저장 실패');
            }

            resolve(tempFilePath);
          } catch (error) {
            console.error('임시 파일 저장 오류:', error);
            reject(error);
          }
        };

        reader.onerror = (error) => {
          console.error('파일 읽기 오류:', error);
          reject(new Error('파일 읽기 실패'));
        };

        // 파일을 ArrayBuffer로 읽기 시작
        reader.readAsArrayBuffer(file);
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
        if (uploadResult.success) {
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
          throw new Error(uploadResult.error || 'Upload failed');
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
  const handleCancelUpload = () => {
    // In a real implementation, you would need to abort the S3 upload
    // For now, we'll just close the dialog and reset states
    setIsUploading(false);
    setUploadDialogOpen(false);
    setFileUploads([]);
    setOverallProgress(0);

    toast({
      title: "Upload cancelled",
      description: "File uploads have been cancelled",
    });
  };

  // File click handler
  const handleFileClick = (file: S3Object) => {
    setSelectedFile(file === selectedFile ? null : file);
  };

  // Folder click handler
  const handleFolderClick = (folder: string) => {
    setCurrentPath(folder);
    setSelectedFolder(folder);
    loadFolderContents(folder);
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

  // Delete file handler
  const handleDelete = async () => {
    if (!selectedFile) return;

    try {
      const s3Config = await getS3Config();

      if (window.api && typeof window.api.deleteFileFromS3 === 'function') {
        const result = await window.api.deleteFileFromS3({
          bucket: s3Config.bucket,
          key: selectedFile.key
        });

        if (result.success) {
          toast({
            title: "File deleted",
            description: `${selectedFile.key.split('/').pop()} has been deleted successfully`,
          });

          // Refresh the file list after deletion
          loadFiles();
          setSelectedFile(null);
        } else {
          throw new Error(result.error || 'Failed to delete file');
        }
      } else {
        toast({
          title: "Delete feature",
          description: `API not available to delete ${selectedFile.key}`,
        });
      }
    } catch (error: any) {
      console.error('File deletion error:', error);
      toast({
        title: "Delete failed",
        description: error.message || 'Failed to delete file',
        variant: "destructive",
      });
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
        const emptyFile = new File([emptyBlob], '.keep', { type: 'text/plain' });

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

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <FileToolbar
        currentPath={currentPath}
        uploading={isUploading}
        uploadProgress={uploadProgress}
        selectedFile={selectedFile}
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
            objects={s3Objects.length > 0 ? s3Objects : [{ key: '/', type: 'folder', children: [] }]}
            selectedFolder={selectedFolder}
            expandedFolders={expandedFolders}
            onSelectFolder={handleSelectFolder}
            onToggleFolder={handleToggleFolder}
          />
        </div>

        {/* 오른쪽 파일 목록 */}
        <div className="flex-1 min-w-0">
          <FileListView
            loading={loading}
            currentPath={currentPath}
            files={files}
            folders={folders}
            selectedFile={selectedFile}
            viewMode={viewMode}
            onFileClick={handleFileClick}
            onFolderClick={handleFolderClick}
          />
        </div>
      </div>

      {/* 업로드 진행 대화상자 */}
      <Dialog open={uploadDialogOpen} onOpenChange={handleCloseUploadDialog}>
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>Uploading Files</DialogTitle>
            <DialogDescription>
              {isUploading
                ? "Files are being uploaded to the server. Please don't close this dialog."
                : "All files have been uploaded successfully."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium flex justify-between">
                <span>Overall Progress</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <CustomProgress value={overallProgress} className="h-2" />
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
                        <span className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
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
                        <p className="text-xs text-red-500">{file.errorMessage || 'Upload failed'}</p>
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
                <Button variant="outline" onClick={handleCancelUpload}>
                  Cancel Upload
                </Button>
              )}
            </div>
            <Button
              type="button"
              disabled={isUploading}
              onClick={handleCloseUploadDialog}
            >
              {isUploading ? "Uploading..." : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 에러 로그 대화상자 */}
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
