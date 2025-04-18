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
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { apiService, Build, Version, VersionFile } from '@/lib/api'
import { ChevronLeft, Plus, Trash, Edit, Download,  Loader2, RefreshCw, AlertTriangle, } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'

import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
// 상단에 새로 분리한 컴포넌트들을 임포트
import AddVersionDialog from './AddVersionDialog';
import EditVersionDialog from './EditVersionDialog';
import DeleteVersionDialog from './DeleteVersionDialog';
import ViewFilesDialog from './ViewFilesDialog';


interface VersionManagerProps {
  buildId: string;
  onBack: () => void;
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
        endpointUrl: string;
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
  const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false)
  const [fileUploads, setFileUploads] = useState<FileUploadStatus[]>([])
  const [overallProgress, setOverallProgress] = useState<number>(0)

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
      const response = await apiService.getVersions(buildId, page, limit);
      setVersions(response.versions)
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
      // 업로드된 파일 정보 저장
      const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, type: string, registered: boolean }[] = [];

      // 1단계: 버전 생성
      try {
        const createdVersion = await apiService.createVersion(buildId, newVersion);
        if (!createdVersion.id) {
          throw new Error('Failed to create version');
        } else {
          newVersion.id = createdVersion.id;
        }

        // 파일 정보는 이미 uploadFileToS3 내에서 저장되었으므로 추가 호출 필요 없음

        // 성공 메시지
        toast({
          title: '버전 추가 완료',
          description: `버전 ${createdVersion.versionCode}가 생성되었습니다.`
        });


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

    try {
      if (!newVersion.id) {
        throw new Error('Version ID is required');
      }
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
            const { url, relativePath, md5, size } = await uploadFileToS3(file, newVersion.id!);

            // 업로드된 파일 정보 저장 (UI 업데이트용)
            uploadedFileData.push({
              url,
              relativePath,
              md5,
              name: file.name,
              size,
              type: file.type,
              registered: false // 이제 S3 업로드 후 별도로 등록 필요
            });

            // 업로드 완료 표시
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }));

            await apiService.addFileToVersion(buildId, newVersion.id, {
              name: file.name,
              size: file.size,
              fileSize: file.size,
              download_url: url,
              md5_hash: md5,
              fileType: file.type,
              fileName: file.name,
              originalName: file.name,
              filePath: relativePath,
            });

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

        setNewVersion({
          buildId: buildId,
          versionCode: '',
          versionName: '',
          changeLog: '',
          status: 'draft'
        });
        setUploadedFiles([]);
        await loadVersions();
        setShowAddDialog(false);
      } else {

        setNewVersion({
          buildId: buildId,
          versionCode: '',
          versionName: '',
          changeLog: '',
          status: 'draft'
        });
        setUploadedFiles([]);
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
    const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, type: string, registered: boolean }[] = [];

    try {
      // 업로드된 파일 정보 저장

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
            const { url, relativePath, md5, size } = await uploadFileToS3(file, selectedVersion.id!);

            // 업로드된 파일 정보 저장 (UI 업데이트용)
            uploadedFileData.push({
              url,
              relativePath,
              md5,
              name: file.name,
              size,
              type: file.type,
              registered: false // 이제 S3 업로드 후 별도로 등록 필요
            });

            await apiService.addFileToVersion(buildId, selectedVersion.id, {
              name: file.name,
              size: file.size,
              fileSize: file.size,
              download_url: url,
              md5_hash: md5,
              fileType: file.type,
              fileName: file.name,
              originalName: file.name,
              filePath: relativePath,
            });
            // 업로드 완료 표시
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }));

            //Selected Files  초기화
            setUploadedFiles([]);
            setFilesToDelete([]);
            await loadVersions();
            setShowAddDialog(false);
            toast({
              title: '파일 업로드 완료',
              description: `${file.name} 업로드 완료`,
              variant: "default"
            });
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
        const localSettings = localStorage.getItem('settings');
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

      const { bucket, region, accessKeyId, secretAccessKey, endpointUrl } = s3Config;

      // 랜덤 4자리 문자열 생성
      const randomPrefix = Math.random().toString(36).substring(2, 6);

      // 파일 이름에서 확장자 추출
      const originalName = file.name;
      const fileExtension = originalName.includes('.') ?
        originalName.substring(originalName.lastIndexOf('.')) : '';
      const fileNameWithoutExt = originalName.includes('.') ?
        originalName.substring(0, originalName.lastIndexOf('.')) : originalName;

      // 새 파일 이름 생성 (xxxx파일명.확장자)
      const newFileName = `${randomPrefix}_${fileNameWithoutExt}${fileExtension}`;
      const key = `versions/${versionId}/${newFileName}`;

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

      // 진행률 초기화
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 0
      }));

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

        // 청크 업로드 후 진행률 업데이트
        const progress = Math.round(((i + 1) / totalChunks) * 50); // 청크 업로드는 전체 진행률의 50%로 계산
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: progress
        }));
      }

      console.log(`모든 청크 처리 완료. S3 업로드 시작: ${file.name}`);

      // 진행률 표시 (청크 조합 완료 = 50% 진행)
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
      const fileUrl = `${cdnUrl}/${key}`;
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

  // // 업로드 다이얼로그 닫기
  // const handleCloseUploadDialog = () => {
  //   // 업로드 중이 아니거나 모든 파일이 완료/에러 상태일 때만 닫기
  //   const canClose = !isUploading || fileUploads.every(file =>
  //     file.status === 'completed' || file.status === 'error'
  //   );

  //   if (canClose) {
  //     setUploadDialogOpen(false);
  //     setFileUploads([]);
  //     setOverallProgress(0);
  //   } else {
  //     toast({
  //       title: "업로드 중",
  //       description: "모든 파일 업로드가 완료될 때까지 기다려주세요.",
  //     });
  //   }
  // };

  // 업로드 취소
  const handleCancelUpload = () => {
    setIsUploading(false);
    setUploadDialogOpen(false);
    setFileUploads([]);
    setOverallProgress(0);
    setUploadProgress({});

    toast({
      title: "업로드가 취소되었습니다",
      description: "파일 업로드가 사용자에 의해 취소되었습니다.",
      variant: "destructive"
    });

    console.log("파일 업로드가 취소되었습니다.");
  };

  // 파일 목록 보기 처리
  const handleViewFiles = (version: Version) => {
    setSelectedVersionFiles(version);
    setShowFilesDialog(true);
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

  // 포맷 파일 사이즈 래퍼 함수 - undefined 처리 지원
  const formatFileSizeWrapper = (bytes: number | undefined): string => {
    if (bytes === undefined) return '0 B';
    return formatFileSize(bytes);
  };

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

    const versionId = newVersion.id; // ID를 별도 변수에 저장 (타입 에러 방지)

    setIsUploading(true)
    const uploadedFileData: { url: string, relativePath: string, md5: string, name: string, size: number, registered: boolean, originalName?: string }[] = []
    let allFilesRegistered = true;

    try {
      // 1단계: 모든 파일을 S3에 업로드
      for (const file of uploadedFiles) {
        // 원본 파일명 확인 (확장된 File 객체인 경우)
        const originalName = (file as any).originalName || file.name;

        // S3에 파일 업로드 (API 서버 등록은 하지 않음)
        const { url, relativePath, md5, size } = await uploadFileToS3(file, versionId);

        // 업로드된 파일 데이터 저장
        uploadedFileData.push({
          url,
          relativePath,
          md5,
          name: file.name,
          size,
          registered: false, // 아직 등록되지 않음
          originalName // 원본 파일명 저장
        })
      }

      // 2단계: S3 업로드 완료 후 API 서버에 파일 정보 일괄 등록
      console.log(`${uploadedFileData.length}개 파일이 S3에 업로드 완료, API 서버에 등록 시작`);

      for (let i = 0; i < uploadedFileData.length; i++) {
        const fileData = uploadedFileData[i];
        try {
          // API 서버에 파일 정보 등록
          console.log(`파일 정보를 API 서버에 등록 중 (${i+1}/${uploadedFileData.length}): ${fileData.name}`);

          const result = await apiService.addFileToVersion(buildId, versionId, {
            name: fileData.name,
            size: fileData.size,
            fileSize: fileData.size,
            download_url: fileData.relativePath,
            md5_hash: fileData.md5,
            fileType: uploadedFiles[i].type,
            fileName: fileData.name,
            originalName: fileData.originalName || fileData.name, // 원본 파일명 사용
            filePath: fileData.relativePath,
          });

          if(result) {
            allFilesRegistered = true;
            fileData.registered = true;
            console.log(`파일 정보가 API 서버에 성공적으로 저장되었습니다 (${i+1}/${uploadedFileData.length}): ${fileData.name}`);
          } else {
            console.error(`${fileData.name} 파일 정보 API 서버 등록 실패`);
            allFilesRegistered = false;
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
    <div>
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-center">
            <Button variant="outline" onClick={onBack} className="h-7 w-7 p-0 mr-2 rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-lg">{build?.name || 'Version Management'}</CardTitle>
              <CardDescription className="text-sm">
                {build ? `Manage versions for ${build.name}` : 'Loading...'}
              </CardDescription>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={() => {
                setShowAddDialog(true)
                setFormErrors({})
                setUploadedFiles([])
              }}
              className="text-xs h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Version
            </Button>
            <Button
              onClick={() => loadVersions()}
              variant="outline"
              className="text-xs h-8"
              disabled={loading}
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", { "animate-spin": loading })} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4 flex items-center space-x-2 text-red-600 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <div className="text-sm">{error}</div>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="py-1 px-2 text-[6px]">Status</TableHead>
                  <TableHead className="py-1 px-2 text-[6px]">Version</TableHead>
                  <TableHead className="py-1 px-2 text-[6px]">Change Log</TableHead>
                  <TableHead className="py-1 px-2 text-[6px]">Files</TableHead>
                  <TableHead className="py-1 px-2 text-[6px]">Created</TableHead>
                  <TableHead className="text-right py-1 px-2 text-[6px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-[7px] text-gray-500">
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
                          className="px-2 text-[6px]"
                        >
                          {version.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-[7px] py-1 px-2">{version.versionCode}</TableCell>
                      <TableCell className="text-[7px] truncate max-w-[300px] py-1 px-2">
                        {version.changeLog || '-'}
                      </TableCell>
                      <TableCell className="text-[7px] py-1 px-2">
                        <Button
                          variant="link"
                          className="p-0 h-auto text-[7px]"
                          onClick={() => handleViewFiles(version)}
                        >
                          {version.files?.totalCount || 0} files
                          {version.files?.totalSize ? ` (${formatFileSizeWrapper(version.files.totalSize)})` : ''}
                        </Button>
                      </TableCell>
                      <TableCell className="text-[6px] py-1 px-2">
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
                                console.log('다운로드 URL:', version.download_url);

                                // URL이 상대 경로인지 확인하고 cdnUrl 추가
                                let fullUrl = version.download_url;
                                if (!fullUrl.startsWith('http')) {
                                  // 설정에서 cdnUrl 가져오기
                                  const settings = JSON.parse(localStorage.getItem('settings') || '{}');
                                  const cdnUrl = settings.cdnUrl || '';
                                  if (cdnUrl) {
                                    fullUrl = `${cdnUrl.replace(/\/$/, '')}/${version.download_url.replace(/^\//, '')}`;
                                  }
                                }

                                console.log('최종 다운로드 URL:', fullUrl);

                                // 파일 다운로드를 위한 임시 링크 요소 생성
                                const link = document.createElement('a');
                                link.href = fullUrl;
                                link.target = '_blank';
                                link.download = `${version.versionCode || 'download'}`; // 파일명 지정

                                // 요소를 DOM에 추가하고 클릭 이벤트 발생시킨 후 제거
                                document.body.appendChild(link);
                                link.click();
                                setTimeout(() => {
                                  document.body.removeChild(link);
                                }, 100);

                                toast({
                                  title: '다운로드 시작',
                                  description: '파일 다운로드가 시작되었습니다.',
                                });
                              } else {
                                toast({
                                  title: '다운로드 불가',
                                  description: '다운로드 URL이 설정되지 않았습니다.',
                                  variant: 'destructive'
                                });
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

      {/* 분리된 다이얼로그 컴포넌트 사용 */}
      <AddVersionDialog
        showDialog={showAddDialog}
        setShowDialog={setShowAddDialog}
        newVersion={newVersion}
        setNewVersion={setNewVersion}
        formErrors={formErrors}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        uploadProgress={uploadProgress}
        isSubmitting={isSubmitting}
        isUploading={isUploading}
        handleAddVersion={handleAddVersion}
        handleUploadAllFiles={handleUploadAllFiles}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleRemoveFile={handleRemoveFile}
        handleFileSelect={handleFileSelect}
        cancelUpload={handleCancelUpload}
      />

      <EditVersionDialog
        showDialog={showEditDialog}
        setShowDialog={setShowEditDialog}
        selectedVersion={selectedVersion}
        setSelectedVersion={setSelectedVersion}
        editFormErrors={editFormErrors}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        uploadProgress={uploadProgress}
        isSubmitting={isSubmitting}
        isUploading={isUploading}
        filesToDelete={filesToDelete}
        setFilesToDelete={setFilesToDelete}
        handleUpdateVersion={handleUpdateVersion}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleRemoveFile={handleRemoveFile}
        handleFileSelect={handleFileSelect}
        formatFileSize={formatFileSizeWrapper}
        toast={toast}
        cancelUpload={handleCancelUpload}
      />

      <DeleteVersionDialog
        showDialog={showDeleteDialog}
        setShowDialog={setShowDeleteDialog}
        selectedVersion={selectedVersion}
        isSubmitting={isSubmitting}
        handleDeleteVersion={handleDeleteVersion}
      />

      <ViewFilesDialog
        showDialog={showFilesDialog}
        setShowDialog={setShowFilesDialog}
        selectedVersion={selectedVersionFiles}
        formatFileSize={formatFileSizeWrapper}
      />
    </div>
  )
}

