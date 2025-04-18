import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import BuildsList from './BuildsList'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Plus, Loader2, UploadCloud } from "lucide-react"
import { apiService, Build } from '@/lib/api'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert"
import { useToast } from '@/components/ui/use-toast'
import VersionManager from './VersionManager'
import { ScrollArea } from '@/components/ui/scroll-area'

// Build 인터페이스에 md5_hash 추가
interface BuildWithHash extends Build {
  md5_hash?: string;
}

function Builds(): JSX.Element {
  const { toast } = useToast()

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Selected build and version management screen state
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null)
  const [showVersionManagement, setShowVersionManagement] = useState(false)

  // File upload state
  const [setupFile, setSetupFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [fileHash, setFileHash] = useState<string>('')
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // API data loading state
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<{
    connected: boolean;
    message: string;
  }>({ connected: false, message: 'Checking server connection status...' })

  // New build information
  const [newBuild, setNewBuild] = useState<BuildWithHash>({
    name: '',
    version: '1',
    description: '',
    status: 'development',
    size: 0,
    download_url: '/',
    build_number: 1,
    platform: 'windows',
    build_path: '/'
  })

  // Build list data
  const [builds, setBuilds] = useState<BuildWithHash[]>([])

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingBuild, setEditingBuild] = useState<BuildWithHash | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [buildToDelete, setBuildToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Edit form validation and submission states
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({})
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [editSetupFile, setEditSetupFile] = useState<File | null>(null)

  // Debugging state
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false)
  const [debugLogs, setDebugLogs] = useState<Array<{
    timestamp: Date,
    message: string,
    type: 'info' | 'success' | 'error' | 'warning'
  }>>([])

  // Add Build Dialog state
  const [showAddBuildDialog, setShowAddBuildDialog] = useState(false)

  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Form submission status
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // 강제 리렌더링을 위한 키 값
  const [buildListKey, setBuildListKey] = useState<number>(0);

  // Validate all form fields when values change
  useEffect(() => {
    if (!showAddBuildDialog) return;

    // Only validate if the dialog is open
    const errors: Record<string, string> = {};

    // Validate required fields
    if (newBuild.name === '') errors.name = 'Build name is required';
    if (newBuild.version === '') errors.version = 'Version is required';
    if (!newBuild.platform) errors.platform = 'Platform is required';
    if (!newBuild.status) errors.status = 'Status is required';
    if (!setupFile && !newBuild.download_url) errors.download_url = 'Build file is required';

    // Validate other fields
    if (newBuild.build_number && isNaN(Number(newBuild.build_number))) {
      errors.build_number = 'Build number must be a number';
    }

    // Don't update errors state if nothing has changed to avoid unnecessary re-renders
    const currentErrorCount = Object.values(formErrors).filter(Boolean).length;
    const newErrorCount = Object.values(errors).filter(Boolean).length;

    if (currentErrorCount !== newErrorCount || JSON.stringify(formErrors) !== JSON.stringify(errors)) {
      setFormErrors(errors);
    }
  }, [newBuild, showAddBuildDialog, setupFile, formErrors]);

  // File Upload Zone Component
  const FileUploadZone = () => {
    const handleFileSelect = async (file: File) => {
      if (!file) return;

      setSetupFile(file);

      // Calculate file size in MB
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setNewBuild(prev => ({
        ...prev,
        size: parseFloat(fileSizeMB),
      }));

      // Calculate MD5 hash
      const hash = await generateMD5Hash(file);
      setFileHash(hash);

      addDebugLog(`File selected: ${file.name} (${fileSizeMB} MB)`, 'info');
      addDebugLog(`File MD5: ${hash}`, 'info');
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    return (
      <div className="mt-4">
        <Label htmlFor="download_url">Build File</Label>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className="border-2 border-dashed border-gray-300 rounded-md p-6 mt-2 text-center cursor-pointer hover:border-blue-500 transition-colors"
        >
          <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-2">
            <p className="text-sm text-gray-600">
              Drag and drop your build file here, or click to select
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Uploads will be stored in S3 and the download URL will be saved
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            accept=".exe,.dmg,.apk,.zip,.app,.appx,.ipa,.msi"
          />
        </div>

        {setupFile && (
          <div className="mt-2 text-xs">
            <p className="font-medium">{setupFile.name}</p>
            <p className="text-gray-500">Size: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            {fileHash && <p className="text-gray-500 truncate">Hash: {fileHash}</p>}
          </div>
        )}
      </div>
    );
  };

  // Upload Progress Dialog Component
  const UploadProgressDialog = () => {
    return (
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>파일 업로드 중</DialogTitle>
            <DialogDescription>
              {Object.keys(uploadProgress).length > 0
                ? "파일을 서버에 업로드하는 중입니다. 잠시만 기다려주세요."
                : "업로드가 완료되었습니다!"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  Object.keys(uploadProgress).length > 0 ? "bg-blue-600" : "bg-green-500"
                }`}
                style={{ width: `${Object.keys(uploadProgress).length > 0 ? Object.values(uploadProgress).reduce((a, b) => a + b) / Object.keys(uploadProgress).length : 0}%` }}
              ></div>
            </div>
            <p className="text-center mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {Object.keys(uploadProgress).length > 0
                ? `${Object.values(uploadProgress).reduce((a, b) => a + b).toFixed(0)}% 완료`
                : "처리 중..."}
            </p>
            {setupFile && (
              <div className="mt-4 text-sm space-y-1 p-3 bg-gray-50 rounded-md dark:bg-gray-800">
                <p className="font-medium">{setupFile.name}</p>
                <p className="text-gray-500 dark:text-gray-400">크기: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                {fileHash && <p className="text-gray-500 dark:text-gray-400 truncate">해시: {fileHash}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            {Object.keys(uploadProgress).length > 0 && (
              <Button
                onClick={() => setIsUploadDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                확인
              </Button>
            )}
            {Object.keys(uploadProgress).length > 0 && (
              <Button
                variant="outline"
                onClick={() => setIsUploadDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                배경에서 계속하기
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Check server connection
  const checkServerConnection = async () => {
    setServerStatus({
      connected: false,
      message: 'Checking server connection status...'
    });

    try {
      // Test API connection
      const testResult = await apiService.testConnection();

      if (testResult.success) {
        setServerStatus({
          connected: true,
          message: 'Server connection is normal.'
        });
        addDebugLog('Server connection test: SUCCESS', 'success');
        return true;
      } else {
        setServerStatus({
          connected: false,
          message: `Server connection failed: ${testResult.message}`
        });
        addDebugLog(`Server connection test: FAILED - ${testResult.message}`, 'error');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      addDebugLog(`Server connection test: ERROR - ${errorMessage}`, 'error');
      return false;
    }
  };

  // Load builds from API
  const loadBuilds = async () => {
    setLoading(true);
    setError(null);

    // Add to debug logs
    addDebugLog('API call: GET /builds');

    try {
      // API connection test
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        setError('Failed to connect to API server. Check server settings.');
        setLoading(false);
        return;
      }

      addDebugLog('Fetching builds list...', 'info');
      const builds = await apiService.getBuilds();

      // 데이터가 배열인지 확인
      if (!Array.isArray(builds)) {
        setError('Invalid data format received from server');
        console.error('Invalid builds data format:', builds);
        addDebugLog('API error: Received non-array data from server', 'error');
        setLoading(false);
        return;
      }

      // 디버깅용 상세 로그
      console.log('Received builds:', builds);
      addDebugLog(`Received ${builds.length} builds from server`, 'info');

      // 빌드 목록 상태 업데이트
      setBuilds([...builds]); // 새 배열을 생성하여 참조가 변경되도록 함

      // Add to debug logs
      addDebugLog(`API response: ${builds.length} builds loaded`, 'success');
    } catch (err) {
      setError('Failed to load builds. Please check your API settings.');
      console.error('Error loading builds:', err);

      // Add to debug logs with more details
      const errorMessage = err instanceof Error ? err.message : String(err);
      addDebugLog(`API error: ${errorMessage}`, 'error');

      // Add detailed error information if available
      if (errorMessage.includes('API Error')) {
        const statusMatch = errorMessage.match(/API Error \((\d+)\)/);
        const status = statusMatch ? statusMatch[1] : 'unknown';
        addDebugLog(`status code: ${status}`, 'error');

        const responseText = errorMessage.replace(/API Error \(\d+\): /, '');
        addDebugLog(`response content: ${responseText}`, 'error');
      } else if (errorMessage.includes('Failed to fetch')) {
        addDebugLog('network connection problem or CORS error occurred', 'error');
        addDebugLog(`server URL: ${localStorage.getItem('settings') ? JSON.parse(localStorage.getItem('settings') || '{}').serverUrl || 'not set' : 'not set'}`, 'error');

        // CORS problem resolution suggestion
        addDebugLog('resolution suggestion:', 'info');
        addDebugLog('1. Check if the API server is running', 'info');
        addDebugLog('2. Check if the API server\'s CORS setting is allowed', 'info');
        addDebugLog('3. Check if the server URL is correct (http:// included)', 'info');
        addDebugLog('4. Open Inspector to check console error', 'info');
      } else if (errorMessage.includes('timeout')) {
        addDebugLog('request timeout - server might be too slow to respond', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load builds and check server connection on component mount
  useEffect(() => {
    checkServerConnection().then(() => {
      loadBuilds();
    });
  }, []);

  // Check server status periodically (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (showAddBuildDialog) {
        // Only check if the add build dialog is open
        checkServerConnection();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [showAddBuildDialog]);

  // Validate input fields
  const validateField = (field: string, value: any): string => {
    switch (field) {
      case 'name':
        return !value ? 'Build name is required' : ''
      case 'version':
        return !value ? 'Version is required' : ''
      case 'build_number':
        return value && isNaN(Number(value)) ? 'Build number must be a number' : ''
      case 'platform':
        return !value ? 'Platform is required' : ''
      case 'status':
        return !value ? 'Status is required' : ''
      case 'download_url':
        if (!value) return ''
        return ''
      default:
        return ''
    }
  }

  // Handle input change with validation
  const handleInputChange = (field: keyof BuildWithHash, value: any) => {
    // First update the build data
    setNewBuild(prev => ({
      ...prev,
      [field]: value
    }))

    // Validate the field and update error state
    const error = validateField(field, value)

    setFormErrors(prev => ({
      ...prev,
      [field]: error
    }))
  }

  // S3 파일 업로드 함수 추가
  const generateMD5Hash = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async function(event) {
        if (!event.target || !event.target.result) {
          reject(new Error('Failed to read file'));
          return;
        }

        try {
          const buffer = event.target.result as ArrayBuffer;

          // Web Crypto API 사용
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);

          // ArrayBuffer를 16진수 문자열로 변환
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          resolve(hashHex);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
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
  // S3 업로드 함수
  const uploadFileToS3 = async (file: File): Promise<{ url: string, md5: string }> => {
    let tempFilePath: string | null = null;

    try {
      setIsUploading(true);
      const s3Config = await getS3Config();
      if (!s3Config) {
        toast({
          title: 'S3 설정 오류',
          description: 'S3 설정을 가져올 수 없습니다',
          variant: "destructive"
        });
        setIsUploading(false);
        throw new Error('S3 설정을 가져올 수 없습니다');
      }

      const { bucket, region, accessKeyId, secretAccessKey, endpointUrl } = s3Config;

      // 랜덤 4자리 문자열 생성
      const randomPrefix = Math.random().toString(36).substring(2, 6);

      // 파일 이름에서 확장자 추출
      const originalName = file.name;
      const fileExtension = originalName.includes('.') ?
        originalName.substring(originalName.lastIndexOf('.')) : '';
      const fileNameWithoutExt = originalName.includes('.') ?
        originalName.substring(0, originalName.lastIndexOf('.')) : originalName;

      // 새 파일 이름 생성 (xxxx_파일명.확장자)
      const newFileName = `${randomPrefix}_${fileNameWithoutExt}${fileExtension}`;
      const key = `builds/${editingBuild?.id || 'new'}/${newFileName}`;

      // 임시 파일 생성
      tempFilePath = await window.api.createTempFile({
        fileName: file.name,
        totalSize: file.size
      });

      if (!tempFilePath) {
        toast({
          title: '파일 생성 오류',
          description: '임시 파일 생성 실패',
          variant: "destructive"
        });
        setIsUploading(false);
        throw new Error('임시 파일 생성 실패');
      }

      // 파일을 한 번에 업로드
      const buffer = await file.arrayBuffer();
      const result = await window.api.appendToTempFile({
        filePath: tempFilePath,
        buffer,
        offset: 0
      });

      if (!result.success) {
        console.error('파일 업로드 실패:', result.error);
        toast({
          title: '파일 업로드 오류',
          description: `파일 업로드 실패: ${result.error}`,
          variant: "destructive"
        });
        setIsUploading(false);
        throw new Error(result.error);
      }

      // 진행률 표시 (50%)
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 50
      }));

      // 임시 파일을 S3에 업로드
      const uploadResult = await window.api.uploadFileToS3({
        filePath: tempFilePath,
        bucket,
        key,
        accessKeyId,
        secretAccessKey,
        region,
        endpointUrl
      });

      if (!uploadResult.success) {
        console.error('S3 업로드 실패:', uploadResult.error);
        toast({
          title: 'S3 업로드 오류',
          description: `S3 업로드 실패: ${uploadResult.error}`,
          variant: "destructive"
        });
        setIsUploading(false);
        throw new Error(uploadResult.error);
      }

      // S3 업로드 완료 시 진행률 100%로 설정
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 100
      }));

      console.log(`S3 업로드 완료: ${file.name} -> ${key}`);

      // 파일 정보 준비
      const fileUrl = `/${key}`;

      // MD5 해시 계산
      console.log(`MD5 해시 계산 중: ${file.name}`);
      const md5Hash = await generateMD5Hash(file);
      console.log(`MD5 해시 완료: ${md5Hash}`);

      return {
        url: fileUrl,
        md5: md5Hash
      };
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      toast({
        title: '업로드 오류',
        description: `파일 업로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'}`,
        variant: "destructive"
      });
      throw error;
    } finally {
      // 임시 파일 삭제 시도
      if (tempFilePath) {
        try {
          await window.api.deleteTempFile({ filePath: tempFilePath });
          console.log(`임시 파일 삭제 완료: ${tempFilePath}`);
        } catch (deleteError) {
          console.warn(`임시 파일 삭제 실패: ${tempFilePath}`, deleteError);
        }
      }

      setIsUploading(false);
    }
  };

  // S3에서 파일 삭제 함수
  const deleteFileFromS3 = async (url: string): Promise<void> => {
    try {
      if (!url) {
        addDebugLog('삭제할 URL이 없습니다.', 'error');
        return;
      }

      // URL이 빈 문자열이거나 null/undefined 처리
      if (typeof url !== 'string' || url.trim() === '') {
        addDebugLog('잘못된 URL 형식입니다.', 'error');
        return;
      }

      addDebugLog(`S3 파일 삭제 시작: ${url}`, 'info');

      try {
        // URL에서 버킷과 키 추출
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');

        // s3.amazonaws.com 형식인 경우
        let bucket = '';
        let key = '';

        if (urlObj.hostname.includes('s3.amazonaws.com')) {
          // 버킷은 subdomain에 있음
          bucket = urlObj.hostname.split('.')[0];
          key = pathParts.slice(1).join('/'); // 첫 번째 슬래시 이후의 모든 경로
        } else {
          // 설정에서 S3 버킷 정보 가져오기 - CDN URL인 경우
          const settings = JSON.parse(localStorage.getItem('settings') || '{}');
          bucket = settings.s3Bucket || 'gamepot-builds';
          key = pathParts.slice(1).join('/'); // 첫 번째 슬래시 이후의 모든 경로
        }

        if (!bucket || !key) {
          throw new Error('URL에서 버킷과 키를 추출할 수 없습니다');
        }

        addDebugLog(`추출된 버킷: ${bucket}, 키: ${key}`, 'info');

        // API를 통해 파일 삭제
        const deleteResult = await (window as any).api.deleteFromS3({
          bucket,
          key
        });

        if (!deleteResult.success) {
          throw new Error(`S3 파일 삭제 실패: ${deleteResult.error}`);
        }

        addDebugLog(`S3 파일 삭제 완료`, 'success');
      } catch (error) {
        // URL 파싱 오류 시 간단한 처리
        addDebugLog(`URL 파싱 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');

        // 그래도 빌드 삭제는 계속 진행 (파일 삭제 실패해도 빌드 자체는 삭제되게)
        addDebugLog('파일 삭제에 실패했지만 빌드 삭제는 계속 진행합니다', 'warning');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addDebugLog(`S3 파일 삭제 오류: ${errorMessage}`, 'error');
      throw error; // 상위 함수에서 처리할 수 있도록 오류 전파
    }
  };

  // 드래그 앤 드롭 핸들러 추가
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // 파일 업로드 처리 함수
  const handleFileUpload = async (file: File) => {
    setSetupFile(file);
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: 0
    }));
    setIsUploading(true);

    const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    addDebugLog(`파일 선택됨: ${file.name} (${fileSizeInMB} MB)`, 'info');

    try {
      const { url, md5 } = await uploadFileToS3(file);

      if (editingBuild) {
        setEditingBuild(prev => ({
          ...prev!,
          size: parseFloat(fileSizeInMB),
          download_url: url,
          md5_hash: md5
        }));
      } else {
        setNewBuild(prev => ({
          ...prev,
          size: parseFloat(fileSizeInMB),
          download_url: url,
          md5_hash: md5
        }));
      }

      toast({
        description: "파일이 성공적으로 업로드되었습니다.",
        variant: "default"
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      toast({
        description: `파일 업로드 실패: ${errorMessage}`,
        variant: "destructive"
      });

      if (editingBuild) {
        setEditFormErrors(prev => ({
          ...prev,
          download_url: `파일 업로드 실패: ${errorMessage}`
        }));
      } else {
        setFormErrors(prev => ({
          ...prev,
          download_url: `파일 업로드 실패: ${errorMessage}`
        }));
      }
    } finally {
      setIsUploading(false);
    }
  };

  // 파일 선택 핸들러 수정
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileUpload(file);
  };

  // Add a log to debug panel
  const addDebugLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setDebugLogs(prev => [
      {
        timestamp: new Date(),
        message,
        type
      },
      ...prev.slice(0, 99) // Keep only the last 100 logs
    ])
  }

  // Clear debug logs
  const clearDebugLogs = () => {
    setDebugLogs([])
    addDebugLog('Debug logs cleared')
  }

  // Toggle debug panel
  const toggleDebugPanel = () => {
    setShowDebugPanel(prev => !prev)
    if (!showDebugPanel) {
      addDebugLog('Debug panel opened')
    }
  }

  // Reset form state to default values
  const resetFormState = () => {
    setNewBuild({
      name: '',
      version: '1',
      description: '',
      status: 'development',
      size: 0,
      download_url: '/',
      build_number: 1,
      platform: 'windows',
      build_path: '/'
    });

    // Reset file upload state
    setSetupFile(null);
    setUploadProgress({});
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Reset form errors and submission state
    setFormErrors({});
    setSubmitError(null);
    setIsSubmitting(false);
  };

  // Add new build function
  const handleAddBuild = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Validate all fields
    let hasErrors = false;
    const errors: Record<string, string> = {};

    // Required fields validation
    if (!newBuild.name) {
      errors.name = 'Build name is required';
      hasErrors = true;
    }

    if (!newBuild.version) {
      errors.version = 'Version is required';
      hasErrors = true;
    }

    if (!newBuild.platform) {
      errors.platform = 'Platform is required';
      hasErrors = true;
    }

    if (!newBuild.status) {
      errors.status = 'Status is required';
      hasErrors = true;
    }

    // Check if a file has been uploaded
    if (!setupFile && !newBuild.download_url) {
      errors.download_url = 'Please upload a build file';
      hasErrors = true;
    }

    if (hasErrors) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }

    try {
      // Add to debug logs
      addDebugLog('Creating new build...', 'info');

      // Create the build via API
      const createdBuild = await apiService.createBuild(newBuild);

      // Add to debug logs
      addDebugLog(`Build created with ID: ${createdBuild.id}`, 'success');

      // Close dialog and refresh builds list
      toast({
        description: "Build added successfully!",
        variant: "default"
      });

      setShowAddBuildDialog(false);
      resetFormState();
      loadBuilds();

    } catch (err) {
      // Handle failed API call
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitError(`Failed to create build: ${errorMessage}`);
      addDebugLog(`API error: ${errorMessage}`, 'error');

      // If we have a download URL from S3, attempt to delete the uploaded file
      if (newBuild.download_url && newBuild.download_url.includes('s3.amazonaws.com')) {
        addDebugLog('Cleaning up uploaded file due to API error', 'warning');
        try {
          await deleteFileFromS3(newBuild.download_url);
        } catch (deleteErr) {
          const deleteErrorMsg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
          addDebugLog(`Failed to delete S3 file: ${deleteErrorMsg}`, 'error');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBuildSelect = (buildId: string) => {
    setSelectedBuild(buildId)
    setShowVersionManagement(true)
  }

  const handleBackToBuildList = () => {
    setSelectedBuild(null)
    setShowVersionManagement(false)
  }

  const handleBuildEdit = (build: BuildWithHash) => {
    if (build.id) {
      setEditingBuild(build)
      setIsEditDialogOpen(true)
    }
  }

  const handleBuildDelete = (buildId: string) => {
    setBuildToDelete(buildId)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!buildToDelete) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      // 빌드의 다운로드 URL 확인
      const buildToBeDeleted = builds.find(build => build.id === buildToDelete);

      // 먼저 API를 통해 서버에서 빌드 삭제
      await apiService.deleteBuild(buildToDelete)

      // 상태 업데이트하여 UI에서 즉시 삭제된 것을 반영
      setBuilds(builds.filter(build => build.id !== buildToDelete))

      // S3에서도 파일 삭제 시도
      if (buildToBeDeleted?.download_url) {
        try {
          await deleteFileFromS3(buildToBeDeleted.download_url);
        } catch (s3Error) {
          // S3 삭제 오류는 로그만 남기고 진행 (빌드 자체는 삭제되었으므로)
          console.warn('S3 file deletion failed:', s3Error);
          addDebugLog('S3 파일 삭제 실패: ' + (s3Error instanceof Error ? s3Error.message : String(s3Error)), 'warning');
        }
      }

      setIsDeleteDialogOpen(false)
      setBuildToDelete(null)
      toast({
        title: "성공",
        description: "빌드가 성공적으로 삭제되었습니다.",
      })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '빌드 삭제 실패')
      addDebugLog('빌드 삭제 실패: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setIsDeleting(false)
    }
  }

  // Validate edit form fields
  const validateEditField = (field: string, value: any): string => {
    switch (field) {
      case 'name':
        return !value ? 'Build name is required' : ''
      case 'version':
        return !value ? 'Version is required' : ''
      case 'build_number':
        return value && isNaN(Number(value)) ? 'Build number must be a number' : ''
      case 'platform':
        return !value ? 'Platform is required' : ''
      case 'status':
        return !value ? 'Status is required' : ''
      case 'download_url':
       return !value ? 'Download URL is required' : ''
      default:
        return ''
    }
  }

  // Handle edit input change with validation
  const handleEditInputChange = (field: keyof BuildWithHash, value: any) => {
    if (!editingBuild) return;

    // First update the build data
    setEditingBuild(prev => ({
      ...prev!,
      [field]: value
    }))

    // Validate the field and update error state
    const error = validateEditField(field, value)

    setEditFormErrors(prev => ({
      ...prev,
      [field]: error
    }))
  }

  // Edit file handling
  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingBuild || !e.target.files?.[0]) return;

    const file = e.target.files[0];
    setEditSetupFile(file);

    // 파일 크기 제한 (1GB)
    if (file.size > 1024 * 1024 * 1024) {
      setEditFormErrors(prev => ({
        ...prev,
        download_url: '파일 크기는 1GB를 초과할 수 없습니다.'
      }));
      return;
    }

    // 파일 타입 검증
    const allowedTypes = ['.exe', '.dmg', '.apk', '.zip', '.app', '.appx', '.ipa', '.msi'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      setEditFormErrors(prev => ({
        ...prev,
        download_url: '지원하지 않는 파일 형식입니다.'
      }));
      return;
    }

    // 파일 크기 계산
    const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);

    try {
      // 파일 업로드 시작
      const { url, md5 } = await uploadFileToS3(file);

      // 빌드 정보 업데이트
      setEditingBuild(prev => ({
        ...prev!,
        size: parseFloat(fileSizeInMB),
        download_url: url,
        md5_hash: md5
      }));

      // 에러 초기화
      setEditFormErrors(prev => ({
        ...prev,
        download_url: ''
      }));

      addDebugLog(`파일 업로드 완료: ${file.name} (${fileSizeInMB} MB)`, 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setEditFormErrors(prev => ({
        ...prev,
        download_url: `파일 업로드 실패: ${errorMessage}`
      }));
      addDebugLog(`파일 업로드 실패: ${errorMessage}`, 'error');
    }
  };

  // Function to handle file browse button click for edit
  const handleEditBrowseClick = () => {
    editFileInputRef.current?.click()
  }

  // 리스트 새로고침을 위한 함수
  const refreshBuildsList = async () => {
    try {
      // 먼저 빌드 목록 다시 로드
      await loadBuilds();

      // 키 값을 변경하여 강제 리렌더링
      setBuildListKey(prev => prev + 1);

      addDebugLog('Build list refreshed and component re-rendered', 'success');
    } catch (error) {
      console.error('Failed to refresh builds list:', error);
      addDebugLog('Failed to refresh builds list after update', 'error');
    }
  };

  const handleUpdateBuild = async () => {
    if (!editingBuild || !editingBuild.id) {
      return
    }

    setIsEditSubmitting(true)
    setEditSubmitError(null)


    // Add to debug logs
    addDebugLog(`API call: PUT /builds/${editingBuild.id}`, 'info')

    try {
      // 서버 연결 확인
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        setEditSubmitError(`Server connection error: ${serverStatus.message}. Unable to update build.`);
        setIsEditSubmitting(false);
        // Keep dialog open for error message
        return;
      }
      addDebugLog(`editSetupFile: ${editSetupFile}`, 'info')
      // if (editSetupFile) {
      //   await handleFileUpload(editSetupFile)
      // }

      // 빌드 업데이트
      await apiService.updateBuild(editingBuild.id, editingBuild)

      // Add to debug logs
      addDebugLog(`API response: build update success`, 'success')

      // 성공적으로 업데이트됨, 다이얼로그 닫기
      setIsEditDialogOpen(false)
      setEditingBuild(null)

      // 빌드 리스트 새로고침 - 개선된 메소드 사용
      await refreshBuildsList();

      // 성공 메시지 표시
      toast({
        description: "Build has been successfully updated",
        variant: "default"
      });
    } catch (err) {
      console.error('Failed to update build:', err)

      // 구체적인 오류 메시지 설정
      const errorMessage = err instanceof Error ? err.message : String(err)
      setEditSubmitError(`Build update failed: ${errorMessage}`);

      // Add to debug logs with more details
      addDebugLog(`API error: ${errorMessage}`, 'error')

      // Add detailed error information if available
      if (errorMessage.includes('API Error')) {
        const statusMatch = errorMessage.match(/API Error \((\d+)\)/)
        const status = statusMatch ? statusMatch[1] : 'unknown'
        addDebugLog(`status code: ${status}`, 'error')

        const responseText = errorMessage.replace(/API Error \(\d+\): /, '')
        addDebugLog(`response content: ${responseText}`, 'error')

        if (status === '404') {
          addDebugLog(`build not found: it may have been deleted or does not exist`, 'error')
        } else if (status === '401' || status === '403') {
          addDebugLog(`authentication error: please check the API key and project ID`, 'error')
        }
      } else if (errorMessage.includes('Failed to fetch')) {
        addDebugLog('network connection problem or CORS error occurred', 'error')
      }

      // Keep dialog open for error message
    } finally {
      setIsEditSubmitting(false);
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadgeClass = (status?: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  // Function to handle file browse button click
  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  // Refresh 버튼 핸들러 함수 수정
  const handleRefresh = async () => {
    addDebugLog('Manual refresh requested', 'info');

    try {
      // 개선된 새로고침 함수 사용
      await refreshBuildsList();

      // 성공 메시지 표시
      toast({
        description: "Build list has been refreshed successfully",
        variant: "default"
      });
    } catch (error) {
      console.error('Manual refresh failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      addDebugLog(`Manual refresh failed: ${errorMessage}`, 'error');

      toast({
        description: `Refresh failed: ${errorMessage}`,
        variant: "destructive"
      });
    }
  };

  // 모든 resetFileUpload 호출을 fileInputRef 리셋 코드로 대체
  const handleCloseDialog = () => {
    setIsDialogOpen(false);

    // 직접 파일 입력 필드 초기화
    setSetupFile(null);
    setUploadProgress({});
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    resetFormState();
  };

  const handleCancelDialog = () => {
    // 업로드 중이면 취소 작업 수행
    if (isUploading) {
      // TODO: 실제 업로드 취소 로직 구현 필요
      setIsUploading(false);
    }

    // 다이얼로그 닫기
    setIsDialogOpen(false);

    // 파일 입력 필드 초기화
    setSetupFile(null);
    setUploadProgress({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto p-4 h-full flex flex-col">
      {/* 버전 관리 화면 */}
      {showVersionManagement && selectedBuild ? (
        <VersionManager buildId={selectedBuild} onBack={handleBackToBuildList} />
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-xl font-bold">Builds</h1>
              <p className="text-xs text-gray-500">Manage your application builds</p>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="h-8 text-xs"
                disabled={loading}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={() => setShowAddBuildDialog(true)}
                size="sm"
                className="h-8 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Build
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 overflow-auto h-[calc(100vh-12rem)]">
            <Card className="w-full">
              <CardContent className="p-0">
                <BuildsList
                  key={buildListKey}
                  items={builds}
                  loading={loading}
                  error={error}
                  onBuildSelect={handleBuildSelect}
                  onSelect={handleBuildSelect}
                  onEdit={handleBuildEdit}
                  onDelete={handleBuildDelete}
                  serverStatus={serverStatus}
                />
              </CardContent>
            </Card>
          </ScrollArea>
        </>
      )}

      {/* Add Build Dialog - 빌드 추가 다이얼로그 */}
      <Dialog open={showAddBuildDialog} onOpenChange={(open) => {
        if (!open) resetFormState();
        setShowAddBuildDialog(open);
      }}>
        <DialogContent className="sm:max-w-[600px] text-sm">
          <DialogHeader>
            <DialogTitle className="text-base">새 빌드 추가</DialogTitle>
            <DialogDescription className="text-xs">
              아래에 새 빌드 버전의 세부 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="name" className="text-right text-xs">
                이름
              </Label>
              <Input
                id="name"
                placeholder="Build name"
                className="col-span-3 h-7 text-xs"
                value={newBuild.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
              {formErrors.name && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.name}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="version" className="text-right text-xs">
                버전
              </Label>
              <Input
                id="version"
                placeholder="1.0.0"
                className="col-span-3 h-7 text-xs"
                value={newBuild.version}
                onChange={(e) => handleInputChange('version', e.target.value)}
              />
              {formErrors.version && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.version}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="build_number" className="text-right text-xs">
                빌드 번호
              </Label>
              <Input
                id="build_number"
                placeholder="100"
                className="col-span-3 h-7 text-xs"
                value={newBuild.build_number?.toString() || ''}
                onChange={(e) => handleInputChange('build_number', parseInt(e.target.value) || '')}
              />
              {formErrors.build_number && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.build_number}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="platform" className="text-right text-xs">
                플랫폼
              </Label>
              <Select
                value={newBuild.platform}
                onValueChange={(value) => handleInputChange('platform', value)}
              >
                <SelectTrigger className="col-span-3 h-7 text-xs">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.platform && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.platform}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="status" className="text-right text-xs">
                상태
              </Label>
              <Select
                value={newBuild.status}
                onValueChange={(value) => handleInputChange('status', value as 'draft' | 'published' | 'archived' | 'development')}
              >
                <SelectTrigger className="col-span-3 h-7 text-xs">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.status && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.status}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label htmlFor="description" className="text-right text-xs">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Build description"
                className="col-span-3 text-xs min-h-[60px]"
                value={newBuild.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-3">
              <Label htmlFor="download_url" className="text-right text-xs pt-2">
                Upload Setup File
              </Label>
              <div className="col-span-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-gray-300 rounded-md p-4 mt-1 text-center cursor-pointer hover:border-blue-500 transition-colors"
                >
                  <UploadCloud className="mx-auto h-8 w-8 text-gray-400" />
                  <div className="mt-1">
                    <p className="text-xs text-gray-600">
                      Drag and drop a new setup file here or click to select
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {newBuild.download_url
                        ? "Current URL: " + newBuild.download_url
                        : "Files will be uploaded to S3 and a download URL will be generated automatically"}
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".exe,.dmg,.apk,.zip,.app,.appx,.ipa,.msi"
                  />
                </div>

                {setupFile && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">{setupFile.name}</p>
                    <p className="text-gray-500">Size: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    {fileHash && <p className="text-gray-500 truncate">Hash: {fileHash}</p>}
                  </div>
                )}
                {formErrors.download_url && (
                  <div className="text-red-500 text-xs mt-0.5">
                    {formErrors.download_url}
                  </div>
                )}
              </div>
            </div>
          </div>
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{submitError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="secondary" onClick={() => {
              resetFormState();
              setShowAddBuildDialog(false);
            }} className="h-7 text-xs">
              취소
            </Button>
            <Button
              onClick={handleAddBuild}
              disabled={isSubmitting || Object.values(formErrors).some(Boolean)}
              className="h-7 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  <span>생성 중...</span>
                </>
              ) : (
                <span>빌드 생성</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Progress Dialog */}
      <UploadProgressDialog />

      {/* Edit Build Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="text-sm max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Build</DialogTitle>
            <DialogDescription className="text-xs">
              Modify the build information below.
            </DialogDescription>
          </DialogHeader>
          {/* Server Status Banner */}

          {editingBuild && (
            <div className="grid gap-3 py-3 text-xs">
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-name" className="text-right text-xs">
                  Name
                </Label>
                <Input
                  id="edit-name"
                  value={editingBuild.name}
                  onChange={(e) => handleEditInputChange('name', e.target.value)}
                  className={`col-span-3 h-7 text-xs ${editFormErrors.name ? 'border-red-500' : ''}`}
                />
                {editFormErrors.name && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.name}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-version" className="text-right text-xs">
                  Version
                </Label>
                <Input
                  id="edit-version"
                  value={editingBuild.version}
                  onChange={(e) => handleEditInputChange('version', e.target.value)}
                  className={`col-span-3 h-7 text-xs ${editFormErrors.version ? 'border-red-500' : ''}`}
                />
                {editFormErrors.version && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.version}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-build_number" className="text-right text-xs">
                  Build Number
                </Label>
                <Input
                  id="edit-build_number"
                  type="number"
                  value={editingBuild.build_number || ''}
                  onChange={(e) => handleEditInputChange('build_number', parseInt(e.target.value))}
                  className={`col-span-3 h-7 text-xs ${editFormErrors.build_number ? 'border-red-500' : ''}`}
                />
                {editFormErrors.build_number && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.build_number}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-platform" className="text-right text-xs">
                  Platform
                </Label>
                <Select
                  onValueChange={(value) => handleEditInputChange('platform', value)}
                  value={editingBuild.platform || ''}
                >
                  <SelectTrigger className={`col-span-3 h-7 text-xs ${editFormErrors.platform ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="mac">macOS</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                    <SelectItem value="xbox">Xbox</SelectItem>
                    <SelectItem value="playstation4">PlayStation 4</SelectItem>
                    <SelectItem value="playstation5">PlayStation 5</SelectItem>
                    <SelectItem value="steam">Steam</SelectItem>
                  </SelectContent>
                </Select>
                {editFormErrors.platform && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.platform}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-description" className="text-right text-xs">
                  Description
                </Label>
                <Textarea
                  id="edit-description"
                  value={editingBuild.description || ''}
                  onChange={(e) => handleEditInputChange('description', e.target.value)}
                  className="col-span-3 text-xs min-h-[60px]"
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-status" className="text-right text-xs">
                  Status
                </Label>
                <Select
                  onValueChange={(value) => handleEditInputChange('status', value as 'development' | 'testing' | 'release' | 'deprecated')}
                  value={editingBuild.status || 'development'}
                >
                  <SelectTrigger className={`col-span-3 h-7 text-xs ${editFormErrors.status ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
                {editFormErrors.status && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.status}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-start gap-3">
                <Label htmlFor="edit-download_url" className="text-right text-xs pt-2">
                  Upload Setup File
                </Label>
                <div className="col-span-3">
                  <div
                    onClick={handleEditBrowseClick}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const file = e.dataTransfer.files[0];
                        setEditSetupFile(file);

                        // Update file size
                        const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);
                        setEditingBuild({
                          ...editingBuild!,
                          size: parseFloat(fileSizeInMB)
                        });

                        addDebugLog(`File dropped: ${file.name} (${fileSizeInMB} MB)`, 'info');
                      }
                    }}
                    className="border-2 border-dashed border-gray-300 rounded-md p-4 mt-1 text-center cursor-pointer hover:border-blue-500 transition-colors"
                  >
                    <UploadCloud className="mx-auto h-8 w-8 text-gray-400" />
                    <div className="mt-1">
                      <p className="text-xs text-gray-600">
                        Drag and drop a new setup file here or click to select
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {editingBuild?.download_url
                          ? "Current URL: " + editingBuild.download_url
                          : "Files will be uploaded to S3 and a download URL will be generated automatically"}
                      </p>
                    </div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleEditFileSelect}
                      accept=".exe,.dmg,.apk,.zip,.app,.appx,.ipa,.msi"
                    />
                  </div>

                  {editSetupFile && (
                    <div className="mt-2 text-xs">
                      <p className="font-medium">{editSetupFile.name}</p>
                      <p className="text-gray-500">Size: {(editSetupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      <p className="text-green-500 text-[10px]">Will be uploaded when saved</p>
                    </div>
                  )}
                  {editFormErrors.download_url && (
                    <div className="text-red-500 text-xs mt-0.5">
                      {editFormErrors.download_url}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-build_path" className="text-right text-xs">
                  Build Path
                </Label>
                <Input
                  id="edit-build_path"
                  value={editingBuild.build_path || ''}
                  onChange={(e) => handleEditInputChange('build_path', e.target.value)}
                  className={`col-span-3 h-7 text-xs ${editFormErrors.build_path ? 'border-red-500' : ''}`}
                />
                {editFormErrors.build_path && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.build_path}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-download_url" className="text-right text-xs">
                  Download URL
                </Label>
                <Input
                  id="edit-download_url"
                  value={editingBuild.download_url || ''}
                  onChange={(e) => handleEditInputChange('download_url', e.target.value)}
                  className={`col-span-3 h-7 text-xs ${editFormErrors.download_url ? 'border-red-500' : ''}`}

                />
                {editFormErrors.download_url && (
                  <div className="col-span-3 col-start-2 text-red-500 text-xs mt-0.5">
                    {editFormErrors.download_url}
                  </div>
                )}
              </div>
            </div>
          )}
           {editSubmitError && (
              <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-md mb-2 text-xs w-full">
                <div className="font-medium mb-1">Error:</div>
                <p>{editSubmitError}</p>

              </div>
            )}
          <DialogFooter className="flex flex-col items-stretch sm:items-end">

            <div className="flex justify-between w-full">
              <Button
                variant="destructive"
                onClick={() => {
                  if (editingBuild && editingBuild.id) {
                    setBuildToDelete(editingBuild.id);
                    setIsEditDialogOpen(false);
                    setIsDeleteDialogOpen(true);
                  }
                }}
                className="h-7 text-xs py-0"
              >
                Delete
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-7 text-xs py-0">
              Cancel
            </Button>
                <div className="flex flex-col items-end">
                  {Object.values(editFormErrors).some(Boolean) && (
                    <div className="text-red-500 text-xs mb-1">
                      Please fix the errors before submitting
                    </div>
                  )}
                  <Button
                    onClick={handleUpdateBuild}
                    disabled={
                      !editingBuild ||
                      !editingBuild.name ||
                      !editingBuild.version ||
                      isEditSubmitting ||
                      !serverStatus.connected ||
                      Object.values(editFormErrors).some(Boolean)
                    }
                    className="h-7 text-xs py-0"
                  >
                    {isEditSubmitting ? 'Updating...' : 'Update Build'}
                  </Button>
                </div>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>빌드 삭제 확인</DialogTitle>
            <DialogDescription>
              이 빌드를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4 text-sm">
              <p className="font-semibold">오류 발생:</p>
              <p>{deleteError}</p>
            </div>
          )}
          <DialogFooter className="flex space-x-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  <span>삭제 중...</span>
                </>
              ) : (
                <span>삭제</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default Builds
