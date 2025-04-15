import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import BuildsList from './BuildsList'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, RefreshCw, Plus, Trash, Edit, Check, X, Upload, Download, FileText, Loader2, ArrowUpIcon, UploadCloud } from "lucide-react"
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogDescription,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert"
import { useToast } from '@/components/ui/use-toast'
import BuildForm from './BuildForm'
import crypto from 'crypto'
import VersionManager from './VersionManager'

function Builds(): JSX.Element {
  const { toast } = useToast()
  const [versions] = useState(window.electron.process.versions)
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list')
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Selected build and version management screen state
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null)
  const [showVersionManagement, setShowVersionManagement] = useState(false)

  // File upload state
  const [setupFile, setSetupFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
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
  const [newBuild, setNewBuild] = useState<Build>({
    name: 'First Build',
    version: '1',
    description: '',
    status: 'development',
    size: 0,
    download_url: '/',
    build_number: 1,
    platform: 'android',
    build_path: '/'
  })

  // Build list data
  const [builds, setBuilds] = useState<Build[]>([])

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingBuild, setEditingBuild] = useState<Build | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [buildToDelete, setBuildToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Edit form validation and submission states
  const [editFormErrors, setEditFormErrors] = useState<{
    name?: string;
    version?: string;
    build_number?: string;
    platform?: string;
    status?: string;
    download_url?: string;
    build_path?: string;
  }>({})
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
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    version?: string;
    build_number?: string;
    platform?: string;
    status?: string;
    download_url?: string;
    build_path?: string;
  }>({})

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

    if (newBuild.download_url && newBuild.download_url !== '/') {
      if (!newBuild.download_url.startsWith('http://') &&
          !newBuild.download_url.startsWith('https://') &&
          !newBuild.download_url.startsWith('/uploads/')) {
        errors.download_url = 'Invalid URL format (must start with http://, https://, or be an uploaded file)'
      }
    }

    // Don't update errors state if nothing has changed to avoid unnecessary re-renders
    const currentErrorCount = Object.keys(formErrors).filter(k => !!formErrors[k as keyof typeof formErrors]).length;
    const newErrorCount = Object.keys(errors).length;

    if (currentErrorCount !== newErrorCount || JSON.stringify(formErrors) !== JSON.stringify(errors)) {
      setFormErrors(errors);
    }
  }, [newBuild, showAddBuildDialog, setupFile]);

  // File Upload Zone Component
  const FileUploadZone = () => {
    const handleFileSelect = async (file: File) => {
      if (!file) return;

      setSetupFile(file);

      // Calculate file size in MB
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setNewBuild(prev => ({ ...prev, size: parseFloat(fileSizeMB) }));

      // Calculate MD5 hash
      const buffer = await file.arrayBuffer();
      const hash = crypto.createHash('md5').update(Buffer.from(buffer)).digest('hex');
      setFileHash(hash);

      addDebugLog(`File selected: ${file.name} (${fileSizeMB} MB)`, 'info');
      addDebugLog(`File MD5: ${hash}`, 'info');
    };

    const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
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
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />
        </div>

        {setupFile && (
          <div className="mt-2 text-sm">
            <p className="font-medium">{setupFile.name}</p>
            <p className="text-gray-500">Size: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            {fileHash && <p className="text-gray-500 truncate">MD5: {fileHash}</p>}
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
            <DialogTitle>Uploading Build File</DialogTitle>
            <DialogDescription>
              {uploadProgress < 100
                ? "Please wait while your build file is being uploaded to the server."
                : "Upload completed successfully!"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-center mt-4 text-sm">
              {uploadProgress < 100
                ? `${uploadProgress.toFixed(0)}% complete`
                : "Processing your build..."}
            </p>
            {setupFile && (
              <div className="mt-4 text-sm text-slate-500">
                <p>File: {setupFile.name}</p>
                <p>Size: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                <p>MD5: {fileHash}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            {uploadProgress === 100 && (
              <Button
                onClick={() => setIsUploadDialogOpen(false)}
                disabled={isSubmitting}
              >
                Close
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
        try {
          // Simple URL validation
          if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('/uploads/')) {
            return 'Invalid URL format (must start with http://, https://, or be an uploaded file)'
          }
        } catch (e) {
          return 'Invalid URL format'
        }
        return ''
      default:
        return ''
    }
  }

  // Handle input change with validation
  const handleInputChange = (field: keyof Build, value: any) => {
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
      reader.onload = function(event) {
        if (!event.target || !event.target.result) {
          reject(new Error('Failed to read file'));
          return;
        }

        // ArrayBuffer에서 MD5 해시 계산
        const buffer = event.target.result as ArrayBuffer;
        const hashBuffer = crypto.createHash('md5').update(Buffer.from(buffer)).digest();
        const hashHex = hashBuffer.toString('hex');
        resolve(hashHex);
      };
      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // S3 업로드 함수
  const uploadFileToS3 = async (file: File): Promise<{ url: string, md5: string }> => {
    try {
      // 파일 MD5 해시 계산
      const md5Hash = await generateMD5Hash(file);
      addDebugLog(`File MD5 hash: ${md5Hash}`, 'info');

      // 설정에서 S3 버킷 정보 가져오기
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      const bucket = settings.s3Bucket || 'gamepot-builds';

      // 플랫폼 경로 추가 - 현재 빌드 플랫폼에 따라 폴더 구조화
      const platform = newBuild.platform || 'unknown';

      // Key 생성 (경로/플랫폼/파일명) - 파일 관리가 용이하도록 구조화
      const key = `builds/${platform}/${Date.now()}-${file.name}`;
      const metadataKey = `${key}.metadata.json`;

      // 업로드 진행 다이얼로그 표시
      setIsUploading(true);
      setUploadProgress(0);

      // 진행 표시 시뮬레이션 시작
      const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10; // 좀 더 자연스러운 진행률
        });
      }, 300);

      addDebugLog(`S3 업로드 시작: ${file.name} (플랫폼: ${platform})`, 'info');

      // 파일을 Blob으로 변환하여 업로드에 사용할 임시 파일 생성
      const buffer = await file.arrayBuffer();
      const tempFilePath = await (window as any).api.saveTempFile({
        buffer: Array.from(new Uint8Array(buffer)),
        fileName: file.name
      });

      if (!tempFilePath) {
        throw new Error("임시 파일 생성에 실패했습니다.");
      }

      addDebugLog(`임시 파일 생성됨: ${tempFilePath}`, 'info');

      // S3 업로드 실행 - 객체 형태로 파라미터 전달
      const uploadResult = await (window as any).api.uploadFileToS3({
        filePath: tempFilePath,
        bucket: bucket,
        key: key
      });

      // 진행률 업데이트 중지 및 완료 표시
      clearInterval(progressInterval);
      setUploadProgress(100);

      // 임시 파일 삭제
      await (window as any).api.deleteTempFile({ filePath: tempFilePath });
      addDebugLog(`임시 파일 삭제됨: ${tempFilePath}`, 'info');

      if (!uploadResult.success) {
        throw new Error(`S3 업로드 실패: ${uploadResult.error}`);
      }

      // 메타데이터 생성 (빌드 정보 포함)
      const metadata = {
        md5: md5Hash,
        fileName: file.name,
        fileSize: file.size,
        platform: platform,
        version: newBuild.version || '',
        name: newBuild.name || '',
        build_number: newBuild.build_number || 0,
        uploadedAt: new Date().toISOString()
      };

      addDebugLog(`메타데이터 정보: ${JSON.stringify(metadata)}`, 'info');

      // 메타데이터 파일 업로드 - 실제 구현은 여기서 추가해야 함
      // 메타데이터를 JSON 문자열로 변환하여 임시 파일로 저장
      const metadataStr = JSON.stringify(metadata, null, 2);
      const metadataFilePath = await (window as any).api.saveTempFile({
        buffer: Array.from(new TextEncoder().encode(metadataStr)),
        fileName: 'metadata.json'
      });

      if (metadataFilePath) {
        // 메타데이터 파일 S3 업로드
        const metadataUploadResult = await (window as any).api.uploadFileToS3({
          filePath: metadataFilePath,
          bucket: bucket,
          key: metadataKey
        });

        // 임시 메타데이터 파일 삭제
        await (window as any).api.deleteTempFile({ filePath: metadataFilePath });

        if (metadataUploadResult.success) {
          addDebugLog(`메타데이터 파일 업로드 완료: ${metadataKey}`, 'success');
        } else {
          addDebugLog(`메타데이터 파일 업로드 실패: ${metadataUploadResult.error}`, 'warning');
        }
      }

      // 업로드 결과 URL 가공 - 다운로드 링크 형식으로 변환
      let downloadUrl = uploadResult.location;

      // CDN URL이 설정되어 있는 경우 CDN URL로 변경
      const cdnUrl = settings.cdnUrl;
      if (cdnUrl && !downloadUrl.startsWith(cdnUrl)) {
        // CDN URL로 변환 시도
        try {
          const urlObj = new URL(downloadUrl);
          const pathParts = urlObj.pathname.split('/');
          const cdnPath = pathParts.slice(1).join('/'); // 버킷 이름 제외
          downloadUrl = `${cdnUrl}/${cdnPath}`;
          addDebugLog(`CDN URL로 변환됨: ${downloadUrl}`, 'info');
        } catch (err) {
          const error = err as Error;
          addDebugLog(`CDN URL 변환 실패, 원본 URL 사용: ${error.message}`, 'warning');
        }
      }

      addDebugLog(`S3 업로드 완료: ${downloadUrl}`, 'success');

      // 업로드 성공 후 다운로드 URL과 MD5 해시 반환
      return {
        url: downloadUrl,
        md5: md5Hash
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addDebugLog(`S3 업로드 오류: ${errorMessage}`, 'error');
      setUploadProgress(0);
      throw error;
    } finally {
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

    // 파일 크기 MB로 변환
    const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    addDebugLog(`파일 선택됨: ${file.name} (${fileSizeInMB} MB)`, 'info');

    try {
      // S3에 파일 업로드
      const { url, md5 } = await uploadFileToS3(file);

      // 빌드 데이터에 다운로드 URL과 크기, MD5 해시 업데이트
      setNewBuild(prev => ({
        ...prev,
        size: parseFloat(fileSizeInMB),
        download_url: url,
        md5_hash: md5 // MD5 해시 저장 (API에서 이 필드를 지원한다고 가정)
      }));

      // 폼 오류 업데이트 (다운로드 URL 관련 오류 제거)
      setFormErrors(prev => ({
        ...prev,
        download_url: ''
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setFormErrors(prev => ({
        ...prev,
        download_url: `파일 업로드 실패: ${errorMessage}`
      }));
    }
  };

  // 파일 선택 핸들러 수정
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    handleFileUpload(files[0]);
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
      name: 'First Build',
      version: '1',
      description: '',
      status: 'development',
      size: 0,
      download_url: '/',
      build_number: 1,
      platform: 'android',
      build_path: '/'
    });

    // Reset file upload state
    setSetupFile(null);
    setUploadProgress(0);
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
        message: "Build added successfully!",
        type: "success"
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
    addDebugLog(`버전 관리 화면으로 이동: 빌드 ID ${buildId}`, 'info')
  }

  const handleBackToBuildList = () => {
    setSelectedBuild(null)
    setShowVersionManagement(false)
  }

  const handleEditClick = (build: Build, e: React.MouseEvent) => {
    e.stopPropagation()
    // Reset edit form states
    setEditFormErrors({})
    setEditSubmitError(null)
    setEditSetupFile(null)
    setEditingBuild({...build})
    setIsEditDialogOpen(true)
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
        if (!value) return ''
        try {
          // Simple URL validation
          if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('/uploads/')) {
            return 'Invalid URL format (must start with http://, https://, or be an uploaded file)'
          }
        } catch (e) {
          return 'Invalid URL format'
        }
        return ''
      default:
        return ''
    }
  }

  // Handle edit input change with validation
  const handleEditInputChange = (field: keyof Build, value: any) => {
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

  // Handle file selection for edit dialog
  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingBuild) return;

    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      setEditSetupFile(file)

      // Validate file type
      const allowedTypes = ['.exe', '.dmg', '.apk', '.zip', '.app', '.appx', '.ipa', '.msi']
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      let fileError = ''

      if (!allowedTypes.includes(fileExtension)) {
        fileError = 'Unsupported file type. Please upload an executable file.'
        addDebugLog(`Invalid file type: ${fileExtension}`, 'error')
      }

      // Auto-update size field based on file size
      const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2)

      // Create a virtual download URL for the uploaded file
      const fakeDownloadUrl = `/uploads/${file.name}`

      // Update both size and downloadUrl
      setEditingBuild({
        ...editingBuild,
        size: parseFloat(fileSizeInMB),
        download_url: fakeDownloadUrl
      })

      // Set or clear error
      setEditFormErrors({
        ...editFormErrors,
        download_url: fileError
      })

      // Log to debug panel
      addDebugLog(`File selected for edit: ${file.name} (${fileSizeInMB} MB)`, 'info')
      addDebugLog(`Virtual download URL created: ${fakeDownloadUrl}`, 'info')
    }
  }

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
        message: "Build has been successfully updated",
        type: "success"
      })
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

  const handleDeleteClick = (buildId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setBuildToDelete(buildId)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!buildToDelete) return

    setIsDeleting(true);
    setDeleteError(null);

    // Add to debug logs
    addDebugLog(`API call: DELETE /builds/${buildToDelete}`, 'warning')

    try {
      // 서버 연결 확인
      const isConnected = await checkServerConnection();
      if (!isConnected) {
        setDeleteError(`Server connection error: ${serverStatus.message}. Unable to delete build.`);
        setIsDeleting(false);
        // Keep dialog open for error message
        return;
      }

      // 삭제할 빌드 찾기
      const buildObj = builds.find(b => b.id === buildToDelete);
      if (buildObj && buildObj.download_url) {
        // 파일을 S3에서 삭제 시도
        try {
          await deleteFileFromS3(buildObj.download_url);
          addDebugLog(`S3 파일 삭제 완료: ${buildObj.download_url}`, 'success');
        } catch (error) {
          // 파일 삭제 실패해도 빌드 삭제는 계속 진행
          const errorMessage = error instanceof Error ? error.message : String(error);
          addDebugLog(`S3 파일 삭제 실패 (계속 진행): ${errorMessage}`, 'warning');
        }
      } else {
        addDebugLog('이 빌드에는 연결된 파일이 없습니다', 'info');
      }

      // API를 통해 빌드 삭제
      await apiService.deleteBuild(buildToDelete)

      // Add to debug logs
      addDebugLog(`API response: build deletion success`, 'success')

      await loadBuilds() // Reload builds after deletion

      // Successfully deleted, close dialog
      setIsDeleteDialogOpen(false)
      setBuildToDelete(null)

      // 성공 메시지 표시
      toast({
        message: "빌드가 성공적으로 삭제되었습니다",
        type: "success"
      });
    } catch (err) {
      console.error('Failed to delete build:', err)

      // 구체적인 오류 메시지 설정
      const errorMessage = err instanceof Error ? err.message : String(err)
      setDeleteError(`Build deletion failed: ${errorMessage}`);

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
        addDebugLog(`server settings check needed: ${localStorage.getItem('settings') ? JSON.parse(localStorage.getItem('settings') || '{}').serverUrl || 'not set' : 'not set'}`, 'error')
      }

      // 오류 메시지 표시
      toast({
        message: `빌드 삭제 실패: ${errorMessage}`,
        type: "error"
      });

      // Keep dialog open for error message
    } finally {
      setIsDeleting(false);
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

  // Debug Panel Component
  const DebugPanel = () => {
    if (!showDebugPanel) return null

    const getLogColor = (type: 'info' | 'success' | 'error' | 'warning') => {
      switch (type) {
        case 'info': return 'text-blue-600'
        case 'success': return 'text-green-600'
        case 'error': return 'text-red-600'
        case 'warning': return 'text-yellow-600'
        default: return 'text-gray-600'
      }
    }

    return (
      <div className="fixed bottom-0 right-0 w-96 h-80 bg-white border-l border-t shadow-lg z-50 flex flex-col">
        <div className="bg-gray-100 p-2 flex justify-between items-center border-b">
          <div className="text-sm font-medium">Debug Console</div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={clearDebugLogs}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => setShowDebugPanel(false)}
            >
              Close
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 bg-gray-50 text-xs">
          {debugLogs.length === 0 ? (
            <div className="text-gray-400 italic text-center mt-2">No logs yet</div>
          ) : (
            <div className="space-y-1">
              {debugLogs.map((log, index) => (
                <div key={index} className={`${getLogColor(log.type)}`}>
                  <span className="text-gray-400 mr-1">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-2 border-t bg-gray-100">
          <div className="text-xs text-gray-500 grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Status:</span> {loading ? 'Loading' : 'Ready'}
            </div>
            <div>
              <span className="font-medium">Builds:</span> {builds.length}
            </div>
            <div>
              <span className="font-medium">Error:</span> {error ? 'Yes' : 'No'}
            </div>
            <div>
              <span className="font-medium">API URL:</span> {apiService ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
      </div>
    )
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
        message: "Build list has been refreshed successfully",
        type: "success"
      });
    } catch (error) {
      console.error('Manual refresh failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      addDebugLog(`Manual refresh failed: ${errorMessage}`, 'error');

      toast({
        message: `Refresh failed: ${errorMessage}`,
        type: "error"
      });
    }
  };

  // 모든 resetFileUpload 호출을 fileInputRef 리셋 코드로 대체
  const handleCloseDialog = () => {
    setIsDialogOpen(false);

    // 직접 파일 입력 필드 초기화
    setSetupFile(null);
    setUploadProgress(0);
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
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto p-4">
      {/* Debug Panel Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDebugPanel}
        className="fixed bottom-4 right-4 z-50 bg-white shadow-md h-8 text-xs px-3"
      >
        {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
      </Button>

      {/* Debug Panel */}
      <DebugPanel />

      {/* Current view - either build list or version management */}
      {showVersionManagement && selectedBuild ? (
        <VersionManager
          buildId={selectedBuild}
          onBack={handleBackToBuildList}
        />
      ) : (
        <div>
          {/* Header with title and actions */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold">Builds</h1>
              </div>
              <p className="text-xs text-gray-500">Manage and deploy game builds</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="ml-2 h-7 text-xs"
              >
                {loading ? (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3" />
                Refresh
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowAddBuildDialog(true)}
                size="sm"
                className="text-xs flex items-center gap-1 h-7 px-2 py-0"
              >
                <Plus className="h-3 w-3" />
                New Build
              </Button>
            </div>
          </div>

          {/* Build List with onBuildSelect prop */}
          <BuildsList
            key={buildListKey}
            onBuildSelect={handleBuildSelect}
            onEditBuild={(build: Build) => {
              setEditingBuild({...build});
              setIsEditDialogOpen(true);
            }}
          />
        </div>
      )}

      {/* Add Build Dialog */}
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
                placeholder="빌드 이름"
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
                  <SelectValue placeholder="플랫폼 선택" />
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
                  <SelectValue placeholder="상태 선택" />
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
                설명
              </Label>
              <Textarea
                id="description"
                placeholder="빌드 설명"
                className="col-span-3 text-xs min-h-[60px]"
                value={newBuild.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-3">
              <Label className="text-right text-xs pt-2">
                파일 업로드
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
                      빌드 파일을 여기에 끌어다 놓거나 클릭하여 선택하세요
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      업로드는 S3에 저장되고 다운로드 URL이 저장됩니다
                    </p>
            </div>
                <input
                  ref={fileInputRef}
                    type="file"
                  className="hidden"
                    onChange={handleFileSelect}
                  />
              </div>

              {setupFile && (
                  <div className="mt-2 text-xs">
                    <p className="font-medium">{setupFile.name}</p>
                    <p className="text-gray-500">크기: {(setupFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    {fileHash && <p className="text-gray-500 truncate">MD5: {fileHash}</p>}
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
            <Button onClick={handleAddBuild} disabled={isSubmitting || Object.keys(formErrors).some(k => !!formErrors[k as keyof typeof formErrors])} className="h-7 text-xs">
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

              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="edit-download_url" className="text-right text-xs">
                  Download URL
                </Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      id="edit-download_url"
                      value={editingBuild.download_url || ''}
                      onChange={(e) => handleEditInputChange('download_url', e.target.value)}
                      placeholder="https://example.com/downloads/file.exe"
                      className={`flex-1 h-7 text-xs ${editFormErrors.download_url ? 'border-red-500' : ''}`}
                    />
                    <div className="relative">
                      <Button
                        onClick={handleEditBrowseClick}
                        variant="outline"
                        type="button"
                        title="Upload Executable File"
                      >
                        <FileText className="h-4 w-4" />
            </Button>
                      <input
                        type="file"
                        ref={editFileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleEditFileSelect}
                        accept=".exe,.dmg,.apk,.zip,.app,.appx,.ipa,.msi"
                      />
                    </div>
                  </div>
                  {editSetupFile && (
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-blue-500" />
                      <span>{editSetupFile.name} ({(editSetupFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      <span className="text-green-500 text-[10px]">Uploaded - Download URL generated</span>
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
                  {Object.keys(editFormErrors).some(key => !!editFormErrors[key as keyof typeof editFormErrors]) && (
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
                      Object.keys(editFormErrors).some(key => !!editFormErrors[key as keyof typeof editFormErrors])
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


    </div>
  )
}

export default Builds
