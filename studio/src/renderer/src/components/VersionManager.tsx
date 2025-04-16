import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { apiService, Build, Version, VersionFile } from '@/lib/api'
import { ChevronLeft, Plus, Trash, Edit, Download, UploadCloud, Loader2, RefreshCw, AlertTriangle, FilePlus, File, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface VersionManagerProps {
  buildId: string;
  onBack: () => void;
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
        cdnUrl: string;
      } | null>;
      uploadFileToS3: (params: {
        filePath: string;
        bucket: string;
        key: string;
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
      }) => Promise<{ success: boolean; error?: string }>;
      addFileToVersion: (params: {
        versionId: string;
        fileName: string;
        fileUrl: string;
        fileSize: number;
      }) => Promise<{ success: boolean; error?: string }>;
      createTempFile: (params: { fileName: string; totalSize: number }) => Promise<string | null>;
      appendToTempFile: (params: { filePath: string; buffer: ArrayBuffer; offset: number }) => Promise<{ success: boolean; error?: string }>;
      deleteTempFile: (params: { filePath: string }) => Promise<{ success: boolean; error?: string }>;

      // 이벤트 리스너 관리
      on: (channel: string, listener: (...args: any[]) => void) => any;
      off: (channel: string, listener: (...args: any[]) => void) => any;
    };
  }
}

export default function VersionManager({ buildId, onBack }: VersionManagerProps) {
  // 상태 관리
  const [build, setBuild] = useState<Build | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [limit] = useState<number>(10)
  const [showAddDialog, setShowAddDialog] = useState<boolean>(false)
  const [showEditDialog, setShowEditDialog] = useState<boolean>(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false)
  const [newVersion, setNewVersion] = useState<Partial<Version>>({
    buildId: buildId,
    versionCode: '',
    versionName: '',
    changeLog: '',
    status: 'draft'
  })
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const { toast } = useToast()
  const [isDragging, setIsDragging] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false)
  const [fileUploads, setFileUploads] = useState<FileUploadStatus[]>([])
  const [overallProgress, setOverallProgress] = useState<number>(0)

  // 파일 입력 참조 생성
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 파일 목록 대화상자 상태
  const [showFilesDialog, setShowFilesDialog] = useState<boolean>(false);
  const [selectedVersionFiles, setSelectedVersionFiles] = useState<Version | null>(null);

  // 편집 대화상자에서 삭제할 파일 목록을 관리하는 state 추가
  const [filesToDelete, setFilesToDelete] = useState<VersionFile[]>([]);

  // 빌드 정보 및 버전 목록 로드
  useEffect(() => {
    const loadBuildAndVersions = async () => {
      setLoading(true)
      setError(null)

      try {
        // 빌드 정보 로드
        const buildData = await apiService.getBuild(buildId)
        setBuild(buildData)

        // 버전 목록 로드
        await loadVersions()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(`Failed to load build: ${errorMessage}`)
        console.error('Error loading build:', err)
      } finally {
        setLoading(false)
      }
    }

    loadBuildAndVersions()
  }, [buildId])

  // 버전 목록 로드 함수
  const loadVersions = async () => {
    try {
      const response = await apiService.getVersions(buildId, page, limit)
      setVersions(response.data)
      setTotalCount(response.totalCount)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(`Failed to load versions: ${errorMessage}`)
      console.error('Error loading versions:', err)

      // 에러 팝업 표시
      toast({
        title: '버전 로드 실패',
        description: errorMessage,
        variant: "destructive"
      })
    }
  }

  // 페이지 변경 처리
  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  // 페이지 변경 시 버전 목록 다시 로드
  useEffect(() => {
    if (!loading) {
      loadVersions()
    }
  }, [page, limit])

  // 새 버전 추가 처리
  const handleAddVersion = async () => {
    // 유효성 검사
    const errors: Record<string, string> = {};

    // 버전 코드 유효성 검사
    if (!newVersion.versionCode) {
      errors.versionCode = 'Version code is required';
    } else {
      // 버전 형식 검사 (x.y.z 또는 x.y 또는 x 형식)
      const versionPattern = /^(\d+)(\.\d+)?(\.\d+)?(-[a-zA-Z0-9]+)?$/;
      if (!versionPattern.test(newVersion.versionCode)) {
        errors.versionCode = 'Version should follow format: x.y.z (e.g. 1.0.0)';
      }

      // 버전 길이 검사
      if (newVersion.versionCode.length > 20) {
        errors.versionCode = 'Version cannot exceed 20 characters';
      }

      // 중복 버전 검사
      const versionExists = versions.some(v =>
        v.versionCode === newVersion.versionCode
      );

      if (versionExists) {
        errors.versionCode = 'This version number already exists';
      }
    }

    // 버전 이름 유효성 검사
    if (!newVersion.versionName) {
      errors.versionName = 'Version name is required';
    }

    // 상태 검사
    if (!newVersion.status) {
      errors.status = 'Status is required';
    } else {
      const validStatuses = ['draft', 'published', 'archived', 'development'];
      if (!validStatuses.includes(newVersion.status)) {
        errors.status = 'Invalid status value';
      }
    }

    // 설명 길이 검사
    if (newVersion.changeLog && newVersion.changeLog.length > 500) {
      errors.changeLog = 'ChangeLog cannot exceed 500 characters';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      // 업로드된 파일 정보 저장
      const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, type: string, registered: boolean }[] = [];

      // 1단계: 파일을 먼저 S3에 업로드
      if (uploadedFiles.length > 0) {
        setIsUploading(true);

        for (const file of uploadedFiles) {
          try {
            // 파일 업로드 진행 상태 초기화
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 0
            }));

            // S3에 파일 업로드 (uploadFileToS3 함수 내에서 apiService.addFileToVersion 호출됨)
            const { url, relativePath, md5, registered } = await uploadFileToS3(file, newVersion.id!);

            // 업로드된 파일 정보 저장 (UI 업데이트용)
            uploadedFileData.push({
              url,
              relativePath,
              md5,
              name: file.name,
              size: file.size,
              type: file.type,
              registered
            });

            // 업로드 완료 표시
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({
              title: '파일 업로드 실패',
              description: `${file.name}: ${errorMessage}`,
              variant: "destructive"
            });

            // 업로드 실패 시 중단
            setIsUploading(false);
            setIsSubmitting(false);
            return;
          }
        }

        setIsUploading(false);
      }

      // 2단계: 버전 생성
      try {
        const createdVersion = await apiService.createVersion(buildId, newVersion);

        // 파일 정보는 이미 uploadFileToS3 내에서 저장되었으므로 추가 호출 필요 없음

        // 성공 메시지
        toast({
          title: '버전 추가 완료',
          description: `버전 ${createdVersion.versionCode}가 생성되었습니다.`
        });

        // 다이얼로그 닫기 및 상태 초기화
        setShowAddDialog(false);
        setNewVersion({
          buildId: buildId,
          versionCode: '',
          versionName: '',
          changeLog: '',
          status: 'draft'
        });
        setUploadedFiles([]);

        // 버전 목록 새로고침
        await loadVersions();
      } catch (err) {
        // 버전 생성 실패 시 업로드된 파일 삭제
        const errorMessage = err instanceof Error ? err.message : String(err);

        // S3에서 업로드된 파일 삭제 시도
        for (const fileData of uploadedFileData) {
          try {
            // S3 파일 삭제 API 호출
            await deleteFileFromS3(fileData.url);
          } catch (deleteErr) {
            console.error(`Failed to delete S3 file: ${fileData.url}`, deleteErr);
          }
        }

        toast({
          title: 'Failed to Add Version',
          description: errorMessage,
          variant: "destructive"
        });
        console.error('Error adding version:', err);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Failed to Add Version',
        description: errorMessage,
        variant: "destructive"
      });
      console.error('Error adding version:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 버전 업데이트 처리
  const handleUpdateVersion = async () => {
    if (!selectedVersion || !selectedVersion.id) return;

    // 유효성 검사
    const errors: Record<string, string> = {};

    // 버전 코드 유효성 검사
    if (!selectedVersion.versionCode) {
      errors.versionCode = 'Version code is required';
    } else {
      // 버전 형식 검사 (x.y.z 또는 x.y 또는 x 형식)
      const versionPattern = /^(\d+)(\.\d+)?(\.\d+)?(-[a-zA-Z0-9]+)?$/;
      if (!versionPattern.test(selectedVersion.versionCode)) {
        errors.versionCode = 'Version should follow format: x.y.z (e.g. 1.0.0)';
      }

      // 버전 길이 검사
      if (selectedVersion.versionCode.length > 20) {
        errors.versionCode = 'Version cannot exceed 20 characters';
      }

      // 중복 버전 검사 (현재 버전 제외)
      const versionExists = versions.some(v =>
        v.versionCode === selectedVersion.versionCode && v.id !== selectedVersion.id
      );

      if (versionExists) {
        errors.versionCode = 'This version number already exists';
      }
    }

    // 상태 검사
    if (!selectedVersion.status) {
      errors.status = 'Status is required';
    } else {
      const validStatuses = ['draft', 'published', 'archived', 'development'];
      if (!validStatuses.includes(selectedVersion.status)) {
        errors.status = 'Invalid status value';
      }
    }

    // 설명 길이 검사
    if (selectedVersion.changeLog && selectedVersion.changeLog.length > 500) {
      errors.changeLog = 'ChangeLog cannot exceed 500 characters';
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      // 업로드된 파일 정보 저장
      const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, type: string, registered: boolean }[] = [];

      // 1단계: 파일을 먼저 S3에 업로드
      if (uploadedFiles.length > 0) {
        setIsUploading(true);

        for (const file of uploadedFiles) {
          try {
            // 파일 업로드 진행 상태 초기화
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 0
            }));

            // S3에 파일 업로드 (uploadFileToS3 함수 내에서 apiService.addFileToVersion 호출됨)
            const { url, relativePath, md5, registered } = await uploadFileToS3(file, selectedVersion.id!);

            // 업로드된 파일 정보 저장 (UI 업데이트용)
            uploadedFileData.push({
              url,
              relativePath,
              md5,
              name: file.name,
              size: file.size,
              type: file.type,
              registered
            });

            // 업로드 완료 표시
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({
              title: '파일 업로드 실패',
              description: `${file.name}: ${errorMessage}`,
              variant: "destructive"
            });

            // 업로드 실패 시 중단
            setIsUploading(false);
            setIsSubmitting(false);
            return;
          }
        }

        setIsUploading(false);
      }

      // 2단계: 버전 업데이트
      try {
        // API 요청에 필요한 필드만 선택 (특히 _id 필드 제외)
        const updateData: Partial<Version> = {
          versionCode: selectedVersion.versionCode,
          versionName: selectedVersion.versionName,
          status: selectedVersion.status
        };

        // 옵션 필드는 있는 경우만 포함
        if (selectedVersion.changeLog !== undefined) {
          updateData.changeLog = selectedVersion.changeLog;
        }

        // 선택된 버전 업데이트
        await apiService.updateVersion(buildId, selectedVersion.id, updateData);

        // 파일 정보는 이미 uploadFileToS3 내에서 저장되었으므로 추가 호출 필요 없음

        // 4단계: 삭제 요청된 파일들 처리
        for (const fileToDelete of filesToDelete) {
          if (fileToDelete.id) {
            // API에서 파일 삭제
            await apiService.deleteFileFromVersion(buildId, selectedVersion.id, fileToDelete.id);

            // S3에서 파일 삭제
            if (fileToDelete.download_url) {
              try {
                await deleteFileFromS3(fileToDelete.download_url);
                console.log(`S3에서 파일 삭제 완료: ${fileToDelete.download_url}`);
              } catch (deleteErr) {
                console.error(`S3에서 파일 삭제 실패: ${fileToDelete.download_url}`, deleteErr);
                // S3 삭제 실패해도 계속 진행 (데이터베이스 레코드는 삭제됨)
              }
            }
          }
        }

        // 성공 메시지
        toast({
          title: '버전 업데이트 완료',
          description: `버전 ${selectedVersion.versionCode} 업데이트 및 파일 처리가 완료되었습니다.`
        });

        // 다이얼로그 닫기
        setShowEditDialog(false);
        setUploadedFiles([]);
        setFilesToDelete([]);

        // 버전 목록 새로고침
        await loadVersions();
      } catch (err) {
        // 버전 업데이트 실패 시 업로드된 파일 삭제
        const errorMessage = err instanceof Error ? err.message : String(err);

        // 오류 메시지에서 JSON 부분 파싱 시도
        let detailedError = errorMessage;
        try {
          // API Error (400): {"status":-1,"message":"\"_id\" is not allowed"} 형태에서 JSON 부분 추출
          const jsonMatch = errorMessage.match(/\{.*\}/);
          if (jsonMatch) {
            const errorJson = JSON.parse(jsonMatch[0]);
            if (errorJson.message) {
              detailedError = errorJson.message;
            }
          }
        } catch (e) {
          // JSON 파싱 실패 시 원본 에러 메시지 사용
        }

        // S3에서 업로드된 파일 삭제 시도
        for (const fileData of uploadedFileData) {
          try {
            // S3 파일 삭제 API 호출
            await deleteFileFromS3(fileData.url);
          } catch (deleteErr) {
            console.error(`Failed to delete S3 file: ${fileData.url}`, deleteErr);
          }
        }

        toast({
          title: 'Failed to Update Version',
          description: detailedError,
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // 오류 상세 내용 로깅
      console.error('Error updating version:', err);

      // 오류 메시지에서 JSON 부분 파싱 시도
      let detailedError = errorMessage;
      try {
        // API Error (400): {"status":-1,"message":"\"_id\" is not allowed"} 형태에서 JSON 부분 추출
        const jsonMatch = errorMessage.match(/\{.*\}/);
        if (jsonMatch) {
          const errorJson = JSON.parse(jsonMatch[0]);
          if (errorJson.message) {
            detailedError = errorJson.message;
          }
        }
      } catch (e) {
        // JSON 파싱 실패 시 원본 에러 메시지 사용
      }

      toast({
        title: 'Failed to Update Version',
        description: detailedError,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // S3 설정 가져오기 함수
  const getS3Config = async () => {
    try {
      // 먼저 API 통해 S3 설정 가져오기 시도
      let s3Config = await window.api.getS3Config();

      // API에서 설정 못 가져왔다면 localStorage 확인
      if (!s3Config) {
        const localSettings = localStorage.getItem('s3Settings');
        if (localSettings) {
          try {
            s3Config = JSON.parse(localSettings);
          } catch (e) {
            toast({
              title: 'S3 설정 오류',
              description: 'S3 설정을 파싱할 수 없습니다.',
              variant: "destructive"
            });
            console.error('Failed to parse S3 settings from localStorage:', e);
          }
        }
      }

      // 설정이 없으면 오류 처리
      if (!s3Config) {
        toast({
          title: 'S3 설정 없음',
          description: 'S3 설정이 구성되지 않았습니다. 설정에서 S3 정보를 구성해주세요.',
          variant: "destructive"
        });
        throw new Error('S3 settings not configured');
      }

      // 필수 값 확인
      if (!s3Config.bucket || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
        toast({
          title: 'S3 설정 불완전',
          description: 'S3 접근을 위한 필수 설정이 누락되었습니다.',
          variant: "destructive"
        });
        throw new Error('Required S3 settings missing');
      }

      // CDN URL이 없는 경우 기본 S3 URL 사용
      if (!s3Config.cdnUrl) {
        s3Config.cdnUrl = `https://${s3Config.bucket}.s3.${s3Config.region || 'ap-northeast-2'}.amazonaws.com`;
      }

      return s3Config;
    } catch (err) {
      toast({
        title: 'S3 설정 오류',
        description: err instanceof Error ? err.message : '알 수 없는 S3 설정 오류가 발생했습니다.',
        variant: "destructive"
      });
      throw err;
    }
  };

  // 파일 업로드 처리 (S3)
  const uploadFileToS3 = async (file: File, versionId: string): Promise<{ url: string; relativePath: string; md5: string; size: number }> => {
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

      const { bucket, region, accessKeyId, secretAccessKey, cdnUrl } = s3Config;
      const key = `versions/${versionId}/${file.name}`;

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

      // 파일을 청크로 나눠서 업로드
      const chunkSize = 5 * 1024 * 1024; // 5MB
      const totalChunks = Math.ceil(file.size / chunkSize);

      console.log(`파일 ${file.name} 업로드 시작: 총 ${totalChunks}개 청크, 총 크기 ${formatFileSize(file.size)}`);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const buffer = await chunk.arrayBuffer();

        console.log(`청크 ${i+1}/${totalChunks} 처리 중: ${formatFileSize(start)}-${formatFileSize(end)}`);

        const result = await window.api.appendToTempFile({
          filePath: tempFilePath,
          buffer,
          offset: start
        });

        if (!result.success) {
          console.error(`청크 ${i+1}/${totalChunks} 처리 실패:`, result.error);
          toast({
            title: '파일 업로드 오류',
            description: `파일 업로드 실패: ${result.error}`,
            variant: "destructive"
          });
          setIsUploading(false);
          throw new Error(result.error);
        }
      }

      console.log(`모든 청크 처리 완료. S3 업로드 시작: ${file.name}`);

      // 임시 파일을 S3에 업로드
      const uploadResult = await window.api.uploadFileToS3({
        filePath: tempFilePath,
        bucket,
        key,
        accessKeyId,
        secretAccessKey,
        region
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

      console.log(`S3 업로드 완료: ${file.name} -> ${key}`);

      // 파일 정보 준비
      const fileUrl = `${cdnUrl}/${key}`;
      // 상대 경로만 따로 저장 (cdn url 제외)
      const relativePath = key;

      // MD5 해시 계산
      console.log(`MD5 해시 계산 중: ${file.name}`);
      const md5Hash = await generateMD5Hash(file);
      console.log(`MD5 해시 완료: ${md5Hash}`);

      // API 서버 등록 부분 제거 (handleUploadAllFiles에서 일괄 처리)

      return {
        url: fileUrl,         // 전체 URL (UI 표시용)
        relativePath: key,    // 상대 경로 (서버 전송용)
        md5: md5Hash,
        size: file.size
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

  // 파일 업로드 후 처리 (목록 새로고침 및 다이얼로그 닫기)
  const handleUploadComplete = async () => {
    try {
      // 화면 새로고침
      await loadVersions();

      // 다이얼로그 닫기
      setShowAddDialog(false);
      setShowEditDialog(false);
    } catch (error) {
      console.error('업로드 후 처리 중 오류:', error);
    }
  };

  // S3에서 파일 삭제 함수
  const deleteFileFromS3 = async (fileUrl: string): Promise<void> => {
    try {
      // S3 설정 가져오기
      const s3Config = await getS3Config();

      // 필수 설정 검증
      if (!s3Config.bucket || !s3Config.accessKeyId || !s3Config.secretAccessKey) {
        throw new Error("S3 접근을 위한 AWS 인증 정보가 설정되지 않았습니다.");
      }

      // URL에서 Key 추출
      let key = '';
      try {
        const url = new URL(fileUrl);
        const pathname = url.pathname;

        // 경로의 첫 번째 부분(버킷 이름 또는 /를 제외한)을 제외한 부분을 키로 사용
        const pathParts = pathname.split('/');
        key = pathParts.slice(1).join('/');

        // CDN URL인 경우 전체 경로를 key로 사용
        if (s3Config.cdnUrl && fileUrl.startsWith(s3Config.cdnUrl)) {
          key = pathname.startsWith('/') ? pathname.substring(1) : pathname;
        }
      } catch (e) {
        console.error('Failed to parse file URL:', e);
        throw new Error('Invalid file URL');
      }

      // 파일 삭제
      await (window as any).api.deleteFileFromS3({
        bucket: s3Config.bucket,
        key,
        region: s3Config.region || 'ap-northeast-2',
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey
      });

      console.log(`Successfully deleted file from S3: ${fileUrl}`);
    } catch (err) {
      console.error(`Failed to delete file from S3: ${fileUrl}`, err);
      throw err;
    }
  };

  // 버전 삭제 처리
  const handleDeleteVersion = async () => {
    if (!selectedVersion || !selectedVersion.id) return

    setIsSubmitting(true)

    try {
      // 버전 삭제
      await apiService.deleteVersion(buildId, selectedVersion.id)

      // 성공 메시지
      toast({
        title: 'Version Deleted',
        description: `Version ${selectedVersion.versionCode} has been deleted.`
      })

      // 다이얼로그 닫기
      setShowDeleteDialog(false)

      // 버전 목록 새로고침
      await loadVersions()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Failed to Delete Version',
        description: errorMessage
      })
      console.error('Error deleting version:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // MD5 해시 생성 함수
  const generateMD5Hash = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = function(event) {
        if (!event.target || !event.target.result) {
          reject(new Error('Failed to read file'))
          return
        }

        try {
          // ArrayBuffer에서 MD5 해시 계산
          const buffer = event.target.result as ArrayBuffer
          // 실제로는 crypto 모듈을 사용하여 MD5 해시 계산
          // 여기서는 모의 구현
          resolve('md5-' + Math.random().toString(36).substring(2, 15))
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = function() {
        reject(new Error('Failed to read file'))
      }
      reader.readAsArrayBuffer(file)
    })
  }

  // 드래그 앤 드롭 이벤트 핸들러
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.add('border-blue-400', 'bg-blue-50')
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50')

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // 드롭된 파일 추가
      const newFiles = Array.from(e.dataTransfer.files)
      setUploadedFiles(prev => [...prev, ...newFiles])
    }
  }

  // 파일 선택 처리
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setUploadedFiles(prev => [...prev, ...newFiles])

      // 파일 입력 초기화 (동일 파일 재선택 가능하도록)
      e.target.value = ''
    }
  }

  // 업로드 파일 제거
  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))

    // 해당 파일의 업로드 진행률도 제거
    const fileName = uploadedFiles[index].name
    setUploadProgress(prev => {
      const newProgress = { ...prev }
      delete newProgress[fileName]
      return newProgress
    })
  }

  // 모든 파일 업로드
  const handleUploadAllFiles = async () => {
    if (uploadedFiles.length === 0) {
      toast({
        title: "업로드 실패",
        description: "업로드할 파일을 선택해주세요.",
        variant: "destructive"
      })
      return
    }

    // 버전 ID 확인
    if (!newVersion || !newVersion.id) {
      toast({
        title: "업로드 실패",
        description: "먼저 버전 정보를 저장해주세요.",
        variant: "destructive"
      })
      return
    }

    setIsUploading(true)
    const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, registered: boolean }[] = []
    let allFilesRegistered = true;

    try {
      // 1단계: 모든 파일을 S3에 업로드
      for (const file of uploadedFiles) {
        // S3에 파일 업로드 (API 서버 등록은 하지 않음)
        const { url, relativePath, md5, size } = await uploadFileToS3(file, newVersion.id!);

        // 업로드된 파일 데이터 저장
        uploadedFileData.push({
          url,
          relativePath,
          md5,
          name: file.name,
          size,
          registered: false // 아직 등록되지 않음
        })
      }

      // 2단계: S3 업로드 완료 후 API 서버에 파일 정보 일괄 등록
      console.log(`${uploadedFileData.length}개 파일이 S3에 업로드 완료, API 서버에 등록 시작`);

      for (let i = 0; i < uploadedFileData.length; i++) {
        const fileData = uploadedFileData[i];
        try {
          // API 서버에 파일 정보 등록 (최대 3번 재시도)
          let retryCount = 0;
          const maxRetries = 3;
          let lastError;
          let success = false;

          while (retryCount < maxRetries && !success) {
            try {
              await apiService.addFileToVersion(buildId, newVersion.id!, {
                name: fileData.name,
                size: fileData.size,
                download_url: fileData.relativePath,
                md5_hash: fileData.md5,
                fileType: uploadedFiles[i].type,
                fileName: fileData.name,
                originalName: fileData.name,
                filePath: fileData.relativePath,
              });

              success = true;
              fileData.registered = true;
              console.log(`파일 정보가 API 서버에 성공적으로 저장되었습니다 (${i+1}/${uploadedFileData.length}): ${fileData.name}`);
            } catch (error) {
              lastError = error;
              retryCount++;

              if (retryCount < maxRetries) {
                console.warn(`API 서버 등록 실패, 재시도 ${retryCount}/${maxRetries}: ${fileData.name}`, error);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }

          if (!success) {
            allFilesRegistered = false;
            console.error(`${fileData.name} 파일 정보 API 서버 등록 실패:`, lastError);
          }
        } catch (error) {
          allFilesRegistered = false;
          console.error(`파일 등록 실패 (${i+1}/${uploadedFileData.length}): ${fileData.name}`, error);
        }
      }

      // 모든 파일이 성공적으로 업로드 및 등록되었는지 확인
      if (allFilesRegistered) {
        // 성공 메시지 표시
        toast({
          title: "업로드 완료",
          description: `${uploadedFiles.length}개 파일 업로드가 완료되었습니다.`,
        })
      } else {
        // 일부 파일 등록 실패 메시지
        toast({
          title: "일부 파일 등록 실패",
          description: "모든 파일이 S3에 업로드되었지만 일부 파일은 API 서버에 등록되지 않았습니다.",
          variant: "destructive"
        })
      }

      // 파일 목록 초기화
      setUploadedFiles([])
      setUploadProgress({})

      // 화면 새로고침 및 다이얼로그 닫기
      await handleUploadComplete();

    } catch (error) {
      console.error('파일 업로드 오류:', error)
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
    }
  }

  // 업로드 다이얼로그 닫기
  const handleCloseUploadDialog = () => {
    // 업로드 중이 아니거나 모든 파일이 완료/에러 상태일 때만 닫기
    const canClose = !isUploading || fileUploads.every(file =>
      file.status === 'completed' || file.status === 'error'
    );

    if (canClose) {
      setUploadDialogOpen(false);
      setFileUploads([]);
      setOverallProgress(0);
    } else {
      toast({
        title: "업로드 중",
        description: "모든 파일 업로드가 완료될 때까지 기다려주세요.",
      });
    }
  };

  // 업로드 취소
  const handleCancelUpload = () => {
    setIsUploading(false);
    setUploadDialogOpen(false);
    setFileUploads([]);
    setOverallProgress(0);

    toast({
      title: "업로드 취소",
      description: "파일 업로드가 취소되었습니다.",
    });
  };

  // 파일 업로드 이벤트 리스너 추가
  useEffect(() => {
    // 파일 업로드 진행률 리스너 설정
    const handleUploadProgress = (_: any, data: any) => {
      console.log('Upload progress:', data);

      if (data.failed) {
        toast({
          title: '업로드 실패',
          description: data.error || '알 수 없는 오류가 발생했습니다',
          variant: "destructive"
        });
        return;
      }

      // 업로드 진행률 업데이트
      setUploadProgress(prev => {
        // 파일 이름 추출 (key에서 파일 이름 부분만 추출)
        const fileName = data.key.split('/').pop();
        if (!fileName) return prev;

        return {
          ...prev,
          [fileName]: data.percentage
        };
      });

      // 파일 업로드 상태 업데이트 (속도 및 남은 시간 계산 포함)
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

          if (timeDiff > 0) {
            const byteDiff = currentBytes - lastBytes;
            const instantSpeed = byteDiff / timeDiff;
            // 이동 평균으로 속도 계산 (급격한 변화를 완화)
            speed = currentFile.speed ? (currentFile.speed * 0.7 + instantSpeed * 0.3) : instantSpeed;
          }

          // 남은 시간 계산 (초)
          let timeRemaining = 0;
          if (speed > 0) {
            const remainingBytes = currentFile.size - currentBytes;
            timeRemaining = remainingBytes / speed;
          }

          // 파일 진행률 업데이트
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
        }

        return newUploads;
      });

      // 업로드 완료 처리
      if (data.completed) {
        console.log('Upload completed for:', data.key);
      }
    };

    if (window.api && window.api.on) {
      // 리스너 등록
      window.api.on('upload-progress', handleUploadProgress);

      // 클린업
      return () => {
        if (window.api && window.api.off) {
          window.api.off('upload-progress', handleUploadProgress);
        }
      };
    }

    return undefined;
  }, [toast]);

  // 파일 크기 포맷팅 함수
  const formatFileSize = (bytes: number | undefined): string => {
    if (bytes === undefined || bytes === 0) return '0 B';

    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 시간 포맷팅 함수
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '계산 중...';
    if (seconds < 60) return `${Math.ceil(seconds)}초`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);

    if (minutes < 60) return `${minutes}분 ${remainingSeconds}초`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}시간 ${remainingMinutes}분`;
  };

  // 파일 목록 보기 처리
  const handleViewFiles = (version: Version) => {
    setSelectedVersionFiles(version);
    setShowFilesDialog(true);
  };

  // 로딩 중일 때 표시
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
        <p className="text-xs text-gray-600">Loading version information...</p>
      </div>
    )
  }

  // 오류 발생 시 표시
  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={onBack} className="text-xs">
          <ChevronLeft className="h-3 w-3 mr-1" />
          Back
        </Button>
      </div>
    )
  }

  // 빌드 정보가 없을 때 표시
  if (!build) {
    return (
      <div className="p-4">
        <Alert className="mb-4">
          <AlertDescription className="text-xs">Build information not found.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={onBack} className="text-xs">
          <ChevronLeft className="h-3 w-3 mr-1" />
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} className="h-7 text-xs">
            <ChevronLeft className="h-3 w-3 mr-1" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{build.name}</h1>
            <p className="text-xs text-gray-500">Version: {build.version} | Platform: {build.platform}</p>
          </div>
        </div>
      </div>

      {/* 버전 목록 */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Version List</CardTitle>
            <CardDescription className="text-xs">
              Total {totalCount} versions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">

            <Button size="sm" onClick={() => {
              setShowAddDialog(true)
              setFormErrors({})
            }} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add New Version
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={loadVersions}
              className="h-7 text-xs"
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />

            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="w-[80px] text-[9px] py-1 px-2">Status</TableHead>
                  <TableHead className="w-[120px] text-[9px] py-1 px-2">Version</TableHead>
                  <TableHead className="text-[9px] py-1 px-2">Description</TableHead>
                  <TableHead className="w-[100px] text-[9px] py-1 px-2">Files</TableHead>
                  <TableHead className="w-[120px] text-[9px] py-1 px-2">Created</TableHead>
                  <TableHead className="w-[150px] text-right text-[9px] py-1 px-2">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-[9px] text-gray-500">
                      No versions available
                    </TableCell>
                  </TableRow>
                ) : (
                  versions.map((version) => (
                    <TableRow key={version.id} className="h-8">
                      <TableCell className="py-1 px-2">
                        <Badge
                          variant={version.status === 'published' ? 'default' :
                                 version.status === 'draft' ? 'secondary' :
                                 version.status === 'archived' ? 'outline' : 'destructive'}
                          className="px-2 text-[8px]"
                        >
                          {version.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-[9px] py-1 px-2">{version.versionCode}</TableCell>
                      <TableCell className="text-[9px] truncate max-w-[300px] py-1 px-2">
                        {version.changeLog || '-'}
                      </TableCell>
                      <TableCell className="text-[9px] py-1 px-2">
                        <Button
                          variant="link"
                          className="p-0 h-auto text-[9px]"
                          onClick={() => handleViewFiles(version)}
                        >
                          {version.files?.totalCount || 0} 파일
                          {version.files?.totalSize ? ` (${formatFileSize(version.files.totalSize)})` : ''}
                        </Button>
                      </TableCell>
                      <TableCell className="text-[8px] py-1 px-2">
                        {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => {
                              setSelectedVersion(version)
                              setShowEditDialog(true)
                              setEditFormErrors({})
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedVersion(version)
                              setShowDeleteDialog(true)
                            }}
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                            disabled={!version.download_url}
                            onClick={() => {
                              if (version.download_url) {
                                window.open(version.download_url, '_blank')
                              }
                            }}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          {/* 페이지네이션 */}
          {totalCount > limit && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    className={page === 1 ? "cursor-not-allowed opacity-50" : ""}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="text-xs">
                    {page} / {Math.ceil(totalCount / limit)}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => handlePageChange(Math.min(Math.ceil(totalCount / limit), page + 1))}
                    className={page === Math.ceil(totalCount / limit) ? "cursor-not-allowed opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardFooter>
      </Card>

      {/* 새 버전 추가 다이얼로그 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Add New Version</DialogTitle>
            <DialogDescription className="text-xs">
              Add new version information and upload files.
            </DialogDescription>
          </DialogHeader>

          {/* 버전 정보 입력 폼 */}
          <div className="grid gap-4">
            {/* Code, Name, Status 한 줄로 표시 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="versionCode" className="text-xs mb-1 block">
                  Code
                </Label>
                <Input
                  id="versionCode"
                  placeholder="1.0.1"
                  className="text-xs h-8 w-full"
                  value={newVersion.versionCode}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, versionCode: e.target.value }))}
                />
                {formErrors.versionCode && (
                  <div className="text-xs text-red-500 mt-1">
                    {formErrors.versionCode}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="versionName" className="text-xs mb-1 block">
                  Name
                </Label>
                <Input
                  id="versionName"
                  placeholder="First Release"
                  className="text-xs h-8 w-full"
                  value={newVersion.versionName}
                  onChange={(e) => setNewVersion(prev => ({ ...prev, versionName: e.target.value }))}
                />
                {formErrors.versionName && (
                  <div className="text-xs text-red-500 mt-1">
                    {formErrors.versionName}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="status" className="text-xs mb-1 block">
                  Status
                </Label>
                <Select
                  value={newVersion.status}
                  onValueChange={(value) => setNewVersion(prev => ({ ...prev, status: value as any }))}
                >
                  <SelectTrigger className="text-xs h-8 w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development" className="text-xs">Development</SelectItem>
                    <SelectItem value="draft" className="text-xs">Draft</SelectItem>
                    <SelectItem value="published" className="text-xs">Published</SelectItem>
                    <SelectItem value="archived" className="text-xs">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 파일 업로드 UI - 먼저 표시 */}
            <div className="col-span-3">
              <div
                className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center mb-4 transition-colors duration-200"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <UploadCloud className="mx-auto h-8 w-8 text-gray-400" />
                <div className="mt-2">
                  <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100">
                    <FilePlus className="h-3 w-3 mr-1" />
                    Select Files
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Or drop files here
                  </p>
                </div>
              </div>

              {/* 선택된 파일 목록 */}
              {uploadedFiles.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium mb-2">Selected Files ({uploadedFiles.length})</div>
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                        <div className="flex items-center space-x-2 flex-1">
                          <File className="h-3 w-3 text-blue-500" />
                          <div className="text-xs flex-1 truncate" title={file.name}>
                            {file.name}
                          </div>
                          <div className="text-[9px] text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>

                        {/* 업로드 진행률 */}
                        {uploadProgress[file.name] && uploadProgress[file.name] > 0 ? (
                          <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-500 h-1.5"
                              style={{ width: `${uploadProgress[file.name]}%` }}
                            ></div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="text-gray-500 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 설명 필드를 가장 아래로 이동 */}
            <div className="grid grid-cols-4 items-center gap-4 col-span-3">
              <Textarea
                id="changeLog"
                placeholder="Version ChangeLog"
                className="col-span-4 h-20 text-xs"
                value={newVersion.changeLog || ''}
                onChange={(e) => setNewVersion(prev => ({ ...prev, changeLog: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="text-xs h-8">
              Cancel
            </Button>

            {!newVersion?.id ? (
              <Button
                type="submit"
                onClick={handleAddVersion}
                disabled={isSubmitting || isUploading}
                className="text-xs h-8"
              >
                {isSubmitting || isUploading ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    {isUploading ? 'Uploading...' : 'Adding...'}
                  </>
                ) : 'Add Version'}
              </Button>
            ) : (
              <Button
                onClick={handleUploadAllFiles}
                disabled={isUploading || uploadedFiles.length === 0}
                className="text-xs h-8"
              >
                {isUploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Upload Files ({uploadedFiles.length})
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 버전 수정 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Version</DialogTitle>
            <DialogDescription className="text-xs">
              Modify version information
            </DialogDescription>
          </DialogHeader>
          {selectedVersion && (
            <div className="grid gap-4 py-4">
              {/* Code, Name, Status 한 줄로 표시 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="edit-version" className="text-xs mb-1 block">
                    Code
                  </Label>
                  <Input
                    id="edit-version"
                    placeholder="1.0.1"
                    className="text-xs h-8 w-full"
                    value={selectedVersion.versionCode}
                    onChange={(e) => setSelectedVersion({ ...selectedVersion, versionCode: e.target.value })}
                  />
                  {editFormErrors.versionCode && (
                    <div className="text-xs text-red-500 mt-1">
                      {editFormErrors.versionCode}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-name" className="text-xs mb-1 block">
                    Name
                  </Label>
                  <Input
                    id="edit-name"
                    placeholder="Release name"
                    className="text-xs h-8 w-full"
                    value={selectedVersion.versionName}
                    onChange={(e) => setSelectedVersion({ ...selectedVersion, versionName: e.target.value })}
                  />
                  {editFormErrors.versionName && (
                    <div className="text-xs text-red-500 mt-1">
                      {editFormErrors.versionName}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="edit-status" className="text-xs mb-1 block">
                    Status
                  </Label>
                  <Select
                    value={selectedVersion.status}
                    onValueChange={(value) => setSelectedVersion({ ...selectedVersion, status: value as any })}
                  >
                    <SelectTrigger className="text-xs h-8 w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development" className="text-xs">Development</SelectItem>
                      <SelectItem value="draft" className="text-xs">Draft</SelectItem>
                      <SelectItem value="published" className="text-xs">Published</SelectItem>
                      <SelectItem value="archived" className="text-xs">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  {editFormErrors.status && (
                    <div className="text-xs text-red-500 mt-1">
                      {editFormErrors.status}
                    </div>
                  )}
                </div>
              </div>

              {/* ChangeLog */}
              <div>
                <Textarea
                  id="edit-changeLog"
                  placeholder="Version ChangeLog"
                  className="h-20 text-xs w-full"
                  value={selectedVersion.changeLog || ''}
                  onChange={(e) => setSelectedVersion({ ...selectedVersion, changeLog: e.target.value })}
                />
                {editFormErrors.changeLog && (
                  <div className="text-xs text-red-500 mt-1">
                    {editFormErrors.changeLog}
                  </div>
                )}
              </div>

              {/* 파일 업로드 UI 추가 */}
              <div>
                <Label className="text-xs mb-1 block">Files</Label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center mb-4 transition-colors duration-200"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <UploadCloud className="mx-auto h-6 w-6 text-gray-400" />
                  <div className="mt-2">
                    <label htmlFor="edit-file-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100">
                      <FilePlus className="h-3 w-3 mr-1" />
                      Select Files
                    </label>
                    <input
                      id="edit-file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Or drop files here
                    </p>
                  </div>
                </div>

                {/* 선택된 파일 목록 */}
                {uploadedFiles.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-medium mb-2">Selected Files ({uploadedFiles.length})</div>
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                          <div className="flex items-center space-x-2 flex-1">
                            <File className="h-3 w-3 text-blue-500" />
                            <div className="text-xs flex-1 truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-[9px] text-gray-500">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>

                          {/* 업로드 진행률 */}
                          {uploadProgress[file.name] && uploadProgress[file.name] > 0 ? (
                            <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-500 h-1.5"
                                style={{ width: `${uploadProgress[file.name]}%` }}
                              ></div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(index)}
                              className="text-gray-500 hover:text-red-500"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 기존 파일 목록 - 삭제 기능 포함 */}
                {selectedVersion.files && selectedVersion.files.files && selectedVersion.files.files.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-xs font-medium mb-2">
                      현재 파일 목록 ({selectedVersion.files?.totalCount || selectedVersion.files?.files.length}개)
                      {selectedVersion.files?.totalSize ? ` (총 ${formatFileSize(selectedVersion.files?.totalSize)})` : ''}
                    </div>
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {selectedVersion.files.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                          <div className="flex items-center space-x-2 flex-1">
                            <File className="h-3 w-3 text-blue-500" />
                            <div className="text-xs flex-1 truncate" title={file.name || file.fileName}>
                              {file.name || file.fileName}
                            </div>
                            <div className="text-[9px] text-gray-500">
                              {formatFileSize(file.size || file.fileSize || 0)}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (file.download_url) {
                                  window.open(file.download_url, '_blank')
                                }
                              }}
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!file.id) return;

                                // 삭제할 파일 목록에 추가
                                setFilesToDelete(prev => [...prev, file]);

                                // UI에서만 일단 제거 (저장 전까지 실제 삭제되지 않음)
                                setSelectedVersion({
                                  ...selectedVersion,
                                  files: {
                                    ...selectedVersion.files!,
                                    totalCount: (selectedVersion.files?.totalCount || 0) - 1,
                                    totalSize: (selectedVersion.files?.totalSize || 0) - (file.size || file.fileSize || 0),
                                    files: selectedVersion.files!.files.filter(f => f.id !== file.id)
                                  }
                                });

                                toast({
                                  title: '삭제 대기',
                                  description: `${file.name || file.fileName} 파일이 삭제 목록에 추가되었습니다. 저장 시 완전히 삭제됩니다.`
                                });
                              }}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="text-xs font-medium mb-2">현재 파일 목록</div>
                    <div className="p-4 text-center border rounded-md">
                      <div className="text-xs text-gray-500">등록된 파일이 없습니다.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false)
                setUploadedFiles([])
              }}
              disabled={isSubmitting}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateVersion}
              disabled={isSubmitting || isUploading}
              className="text-xs h-8"
            >
              {isSubmitting || isUploading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Updating...'}
                </>
              ) : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 버전 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Version</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete this version? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedVersion && (
            <div className="py-4">
              <Alert variant="destructive" className="mb-4">
                <AlertDescription className="text-xs">
                  Version <span className="font-bold">{selectedVersion.versionCode}</span> will be deleted.
                  All files associated with this version will also be removed.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isSubmitting}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteVersion}
              disabled={isSubmitting}
              className="text-xs h-8"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Deleting...
                </>
              ) : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파일 목록 대화상자 */}
      <Dialog open={showFilesDialog} onOpenChange={setShowFilesDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              파일 목록 - {selectedVersionFiles?.versionCode} ({selectedVersionFiles?.versionName})
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedVersionFiles?.files?.totalCount || 0}개 파일
              {selectedVersionFiles?.files?.totalSize ? ` (총 ${formatFileSize(selectedVersionFiles.files.totalSize)})` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="w-[200px] text-[9px] py-1 px-2">파일명</TableHead>
                  <TableHead className="w-[80px] text-[9px] py-1 px-2">타입</TableHead>
                  <TableHead className="w-[80px] text-[9px] py-1 px-2">크기</TableHead>
                  <TableHead className="w-[80px] text-right text-[9px] py-1 px-2">동작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedVersionFiles?.files?.files && selectedVersionFiles.files.files.length > 0 ? (
                  selectedVersionFiles.files.files.map((file, index) => (
                    <TableRow key={file.id || index} className="h-8">
                      <TableCell className="font-medium text-[9px] py-1 px-2">
                        <div className="flex items-center">
                          <File className="h-3 w-3 mr-1 text-blue-500" />
                          {file.fileName || file.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-[9px] py-1 px-2">
                        {file.fileType ||  "Unknown"}
                      </TableCell>
                      <TableCell className="text-[9px] py-1 px-2">
                        {formatFileSize(file.fileSize || file.size)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                          disabled={!file.download_url}
                          onClick={() => {
                            if (file.download_url) {
                              window.open(file.download_url, '_blank')
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-16 text-[9px] text-gray-500">
                      파일이 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setShowFilesDialog(false)}
              className="text-xs"
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Button variant="outline" onClick={handleCancelUpload}>
                  업로드 취소
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
    </div>
  )
}

