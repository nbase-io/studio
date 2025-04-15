import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface UploadResult {
  success: boolean
  location?: string
  error?: string
}

function S3Upload(): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [keyPrefix, setKeyPrefix] = useState<string>('')
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [bucket, setBucket] = useState<string>('')

  // 컴포넌트 마운트 시 설정에서 버킷 정보 불러오기
  useState(() => {
    loadBucketFromSettings()
  })

  // 저장된 설정에서 버킷 정보 불러오기
  const loadBucketFromSettings = async () => {
    try {
      // @ts-ignore - Window 타입에 api 프로퍼티가 없어서 발생하는 타입 오류 무시
      const settings = await window.api.loadSettings()
      if (settings) {
        const parsedSettings = JSON.parse(settings)
        if (parsedSettings.s3Bucket) {
          setBucket(parsedSettings.s3Bucket)
        }
      }
    } catch (error) {
      console.error('버킷 정보를 불러오는 중 오류가 발생했습니다:', error)
    }
  }

  // 파일 선택 대화상자 열기
  const handleFileSelect = async () => {
    try {
      // @ts-ignore - Window 타입에 api 프로퍼티가 없어서 발생하는 타입 오류 무시
      const filePaths = await window.api.selectFile({
        properties: ['openFile'],
        filters: [
          { name: '모든 파일', extensions: ['*'] }
        ]
      })

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0]
        setSelectedFile(filePath)

        // 파일 이름 추출
        const fileNameParts = filePath.split(/[\/\\]/)
        const newFileName = fileNameParts[fileNameParts.length - 1]
        setFileName(newFileName)
      }
    } catch (error) {
      console.error('파일 선택 중 오류가 발생했습니다:', error)
    }
  }

  // S3 업로드 수행
  const handleUpload = async () => {
    if (!selectedFile || !bucket) {
      setUploadResult({
        success: false,
        error: '파일과 버킷을 선택해야 합니다. 환경 설정에서 버킷을 설정하세요.'
      })
      return
    }

    setUploading(true)
    setUploadResult(null)

    try {
      const key = keyPrefix
        ? `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${fileName}`
        : fileName

      // @ts-ignore - Window 타입에 api 프로퍼티가 없어서 발생하는 타입 오류 무시
      const result = await window.api.uploadFileToS3(selectedFile, bucket, key)

      setUploadResult({
        success: result.success,
        location: result.location,
        error: result.error
      })
    } catch (error) {
      setUploadResult({
        success: false,
        error: error.message || '업로드 중 오류가 발생했습니다.'
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">S3 파일 업로드</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">AWS S3에 파일 업로드</p>
        </div>
      </div>

      <Card className="w-full flex-1">
        <CardHeader>
          <CardTitle className="text-lg">파일 업로드</CardTitle>
          <CardDescription className="text-xs">
            업로드할 파일을 선택하고 S3에 업로드합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="selectedFile" className="text-xs">선택된 파일</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="selectedFile"
                  value={selectedFile || ''}
                  readOnly
                  className="h-8 text-xs flex-1"
                  placeholder="파일을 선택하세요"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFileSelect}
                  className="h-8"
                >
                  찾아보기
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bucket" className="text-xs">S3 버킷</Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="h-8 text-xs"
                placeholder="S3 버킷 이름"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keyPrefix" className="text-xs">키 접두사 (폴더 경로)</Label>
              <Input
                id="keyPrefix"
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value)}
                className="h-8 text-xs"
                placeholder="예: uploads/images"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fileName" className="text-xs">파일 이름</Label>
              <Input
                id="fileName"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="h-8 text-xs"
                placeholder="업로드될 파일 이름"
              />
            </div>
          </div>

          {uploadResult && (
            <div className={`mt-4 p-3 rounded-md text-xs ${
              uploadResult.success
                ? 'bg-green-50 border border-green-200 text-green-600'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {uploadResult.success ? (
                <div>
                  <p className="font-medium">업로드 성공!</p>
                  <p className="mt-1">파일 URL: {uploadResult.location}</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">업로드 실패</p>
                  <p className="mt-1">오류: {uploadResult.error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? '업로드 중...' : 'S3에 업로드'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default S3Upload
