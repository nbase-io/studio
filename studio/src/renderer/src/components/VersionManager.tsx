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
import { ChevronLeft, Plus, Trash, Edit, Download, UploadCloud, Loader2, RefreshCw, AlertTriangle, FilePlus, FileIcon, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'

interface VersionManagerProps {
  buildId: string;
  onBack: () => void;
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
    version: '',
    description: '',
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

  // 파일 입력 참조 생성
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    // 버전 유효성 검사
    if (!newVersion.version) {
      errors.version = 'Version is required';
    } else {
      // 버전 형식 검사 (x.y.z 또는 x.y 또는 x 형식)
      const versionPattern = /^(\d+)(\.\d+)?(\.\d+)?(-[a-zA-Z0-9]+)?$/;
      if (!versionPattern.test(newVersion.version)) {
        errors.version = 'Version should follow format: x.y.z (e.g. 1.0.0)';
      }

      // 버전 길이 검사
      if (newVersion.version.length > 20) {
        errors.version = 'Version cannot exceed 20 characters';
      }

      // 중복 버전 검사
      const versionExists = versions.some(v =>
        v.version === newVersion.version
      );

      if (versionExists) {
        errors.version = 'This version number already exists';
      }
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
    if (newVersion.description && newVersion.description.length > 500) {
      errors.description = 'Description cannot exceed 500 characters';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      // 버전 생성
      const createdVersion = await apiService.createVersion(buildId, newVersion);

      // 파일 업로드 처리
      if (uploadedFiles.length > 0) {
        setIsUploading(true)

        for (const file of uploadedFiles) {
          try {
            // 파일 업로드 진행 상태 초기화
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 0
            }))

            // S3에 파일 업로드
            const { url, md5 } = await uploadFileToS3(file)

            // 버전에 파일 추가
            await apiService.addFileToVersion(buildId, createdVersion.id!, {
              name: file.name,
              size: file.size,
              download_url: url,
              md5_hash: md5,
              file_type: file.type
            })

            // 업로드 완료 표시
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: 100
            }))
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            toast({
              title: 'File Upload Failed',
              description: `${file.name}: ${errorMessage}`
            })
          }
        }

        setIsUploading(false)
      }

      // 성공 메시지
      toast({
        title: 'Version Added',
        description: `Version ${createdVersion.version} has been added successfully.`
      })

      // 다이얼로그 닫기 및 상태 초기화
      setShowAddDialog(false)
      setNewVersion({
        buildId: buildId,
        version: '',
        description: '',
        status: 'draft'
      })
      setUploadedFiles([])

      // 버전 목록 새로고침
      await loadVersions()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Failed to Add Version',
        description: errorMessage
      })
      console.error('Error adding version:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 버전 업데이트 처리
  const handleUpdateVersion = async () => {
    if (!selectedVersion || !selectedVersion.id) return

    // 유효성 검사
    const errors: Record<string, string> = {};

    // 버전 유효성 검사
    if (!selectedVersion.version) {
      errors.version = 'Version is required';
    } else {
      // 버전 형식 검사 (x.y.z 또는 x.y 또는 x 형식)
      const versionPattern = /^(\d+)(\.\d+)?(\.\d+)?(-[a-zA-Z0-9]+)?$/;
      if (!versionPattern.test(selectedVersion.version)) {
        errors.version = 'Version should follow format: x.y.z (e.g. 1.0.0)';
      }

      // 버전 길이 검사
      if (selectedVersion.version.length > 20) {
        errors.version = 'Version cannot exceed 20 characters';
      }

      // 중복 버전 검사 (현재 버전 제외)
      const versionExists = versions.some(v =>
        v.version === selectedVersion.version && v.id !== selectedVersion.id
      );

      if (versionExists) {
        errors.version = 'This version number already exists';
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
    if (selectedVersion.description && selectedVersion.description.length > 500) {
      errors.description = 'Description cannot exceed 500 characters';
    }

    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    setIsSubmitting(true)

    try {
      // 선택된 버전 업데이트
      await apiService.updateVersion(buildId, selectedVersion.id, selectedVersion)

      // 성공 메시지
      toast({
        title: 'Version Updated',
        description: `Version ${selectedVersion.version} has been updated successfully.`
      })

      // 다이얼로그 닫기
      setShowEditDialog(false)

      // 버전 목록 새로고침
      await loadVersions()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Failed to Update Version',
        description: errorMessage
      })
      console.error('Error updating version:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

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
        description: `Version ${selectedVersion.version} has been deleted.`
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

  // 파일 업로드 처리 (S3)
  const uploadFileToS3 = async (file: File): Promise<{ url: string, md5: string }> => {
    try {
      // 파일 MD5 해시 계산
      const md5Hash = await generateMD5Hash(file)

      // 파일을 Blob으로 변환하여 업로드에 사용할 임시 파일 생성
      const buffer = await file.arrayBuffer()
      const tempFilePath = await (window as any).api.saveTempFile({
        buffer: Array.from(new Uint8Array(buffer)),
        fileName: file.name
      })

      if (!tempFilePath) {
        throw new Error("임시 파일 생성에 실패했습니다.")
      }

      // 설정에서 S3 버킷 정보 가져오기
      const settings = JSON.parse(localStorage.getItem('settings') || '{}')
      const bucket = settings.s3Bucket || 'gamepot-builds'

      // 플랫폼 경로 추가
      const platform = build?.platform || 'unknown'

      // Key 생성 (경로/플랫폼/파일명)
      const key = `versions/${build?.id}/${Date.now()}-${file.name}`

      // 진행 표시 시뮬레이션 시작
      let progress = 0
      const progressInterval = setInterval(() => {
        progress += 5
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: Math.min(progress, 95)
        }))

        if (progress >= 95) {
          clearInterval(progressInterval)
        }
      }, 300)

      // S3 업로드 실행
      const uploadResult = await (window as any).api.uploadFileToS3({
        filePath: tempFilePath,
        bucket: bucket,
        key: key
      })

      // 진행률 업데이트 중지 및 완료 표시
      clearInterval(progressInterval)
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 100
      }))

      // 임시 파일 삭제
      await (window as any).api.deleteTempFile({ filePath: tempFilePath })

      if (!uploadResult.success) {
        throw new Error(`S3 업로드 실패: ${uploadResult.error}`)
      }

      // 업로드 결과 URL 가공
      let downloadUrl = uploadResult.location

      // CDN URL이 설정되어 있는 경우 CDN URL로 변경
      const cdnUrl = settings.cdnUrl
      if (cdnUrl && !downloadUrl.startsWith(cdnUrl)) {
        try {
          const urlObj = new URL(downloadUrl)
          const pathParts = urlObj.pathname.split('/')
          const cdnPath = pathParts.slice(1).join('/') // 버킷 이름 제외
          downloadUrl = `${cdnUrl}/${cdnPath}`
        } catch (err) {
          console.warn('CDN URL 변환 실패, 원본 URL 사용', err)
        }
      }

      return {
        url: downloadUrl,
        md5: md5Hash
      }
    } catch (error) {
      console.error('S3 파일 업로드 오류:', error)
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: 0
      }))
      throw error
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
    const uploadedFileData: { url: string, md5: string, name: string, size: number }[] = []

    try {
      for (const file of uploadedFiles) {
        // 파일 업로드
        const { url, md5 } = await uploadFileToS3(file)

        // 업로드된 파일 데이터 저장
        uploadedFileData.push({
          url,
          md5,
          name: file.name,
          size: file.size
        })

        // 파일마다 버전에 추가
        await apiService.addFileToVersion(buildId, newVersion.id!, {
          name: file.name,
          size: file.size,
          download_url: url,
          md5_hash: md5,
          file_type: file.type
        })
      }

      // 성공 메시지 표시
      toast({
        title: "업로드 완료",
        description: `${uploadedFiles.length}개 파일 업로드가 완료되었습니다.`,
      })

      // 파일 목록 초기화
      setUploadedFiles([])
      setUploadProgress({})

      // 화면 새로고침
      await loadVersions()

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
        <Button size="sm" onClick={() => {
          setShowAddDialog(true)
          setFormErrors({})
        }} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" />
          Add New Version
        </Button>
      </div>

      {/* 버전 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Version List</CardTitle>
          <CardDescription className="text-xs">
            Total {totalCount} versions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px] text-xs">Status</TableHead>
                  <TableHead className="w-[120px] text-xs">Version</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="w-[100px] text-xs">Files</TableHead>
                  <TableHead className="w-[120px] text-xs">Created</TableHead>
                  <TableHead className="w-[150px] text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-xs text-gray-500">
                      No versions available
                    </TableCell>
                  </TableRow>
                ) : (
                  versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>
                        <Badge
                          variant={version.status === 'published' ? 'default' :
                                 version.status === 'draft' ? 'secondary' :
                                 version.status === 'archived' ? 'outline' : 'destructive'}
                          className="px-2 text-[9px]"
                        >
                          {version.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">{version.version}</TableCell>
                      <TableCell className="text-xs truncate max-w-[300px]">
                        {version.description || '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {version.files?.length || 0} files
                      </TableCell>
                      <TableCell className="text-[9px]">
                        {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
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
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
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
                            className="h-6 w-6 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
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
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadVersions()}
            className="text-xs h-6"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>

          {/* 페이지네이션 */}
          {totalCount > limit && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
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
                    disabled={page === Math.ceil(totalCount / limit)}
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
          <div className="grid grid-cols-3 gap-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="version" className="text-right text-xs">
                Version Number
              </Label>
              <Input
                id="version"
                placeholder="1.0.1"
                className="col-span-3 text-xs h-8"
                value={newVersion.version}
                onChange={(e) => setNewVersion(prev => ({ ...prev, version: e.target.value }))}
              />
              {formErrors.version && (
                <div className="col-span-3 col-start-2 text-xs text-red-500">
                  {formErrors.version}
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right text-xs">
                Status
              </Label>
              <Select
                value={newVersion.status}
                onValueChange={(value) => setNewVersion(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger className="col-span-3 text-xs h-8">
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
                          <FileIcon className="h-3 w-3 text-blue-500" />
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
                id="description"
                placeholder="Version description"
                className="col-span-4 h-20 text-xs"
                value={newVersion.description || ''}
                onChange={(e) => setNewVersion(prev => ({ ...prev, description: e.target.value }))}
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-version" className="text-right text-xs">
                  Version Number
                </Label>
                <Input
                  id="edit-version"
                  placeholder="1.0.1"
                  className="col-span-3 text-xs h-8"
                  value={selectedVersion.version}
                  onChange={(e) => setSelectedVersion({ ...selectedVersion, version: e.target.value })}
                />
                {editFormErrors.version && (
                  <div className="col-span-3 col-start-2 text-xs text-red-500">
                    {editFormErrors.version}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-status" className="text-right text-xs">
                  Status
                </Label>
                <Select
                  value={selectedVersion.status}
                  onValueChange={(value) => setSelectedVersion({ ...selectedVersion, status: value as any })}
                >
                  <SelectTrigger className="col-span-3 text-xs h-8">
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
                  <div className="col-span-3 col-start-2 text-xs text-red-500">
                    {editFormErrors.status}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Textarea
                  id="edit-description"
                  placeholder="Version description"
                  className="col-span-4 h-20 text-xs"
                  value={selectedVersion.description || ''}
                  onChange={(e) => setSelectedVersion({ ...selectedVersion, description: e.target.value })}
                />
                {editFormErrors.description && (
                  <div className="col-span-4 text-xs text-red-500">
                    {editFormErrors.description}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isSubmitting}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateVersion}
              disabled={isSubmitting}
              className="text-xs h-8"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Updating...
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
                  Version <span className="font-bold">{selectedVersion.version}</span> will be deleted.
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
    </div>
  )
}
