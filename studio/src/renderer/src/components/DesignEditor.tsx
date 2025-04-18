import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { UploadCloud, Image, Loader2, X } from 'lucide-react'

interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  buttonText: string
  border: string
}

interface ThemeConfig {
  colors: ThemeColors
  backgroundImage: string
  titleColor: string
}

interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

const defaultTheme: ThemeConfig = {
  colors: {
    primary: '#0070f3',
    secondary: '#1e1e2d',
    accent: '#0056b3',
    background: '#f7f7f7',
    text: '#333333',
    buttonText: '#ffffff',
    border: '#e1e1e1'
  },
  backgroundImage: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?q=80&w=1000',
  titleColor: '#e6bb7c'
}

function DesignEditor(): JSX.Element {
  const { toast } = useToast()
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme)
  const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({})
  const [buttonStyle, setButtonStyle] = useState<React.CSSProperties>({})
  const [jsonOutput, setJsonOutput] = useState<string>('')
  const [showJsonDialog, setShowJsonDialog] = useState<boolean>(false)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

      };
    }
  };

  const updateThemeColors = (key: keyof ThemeColors, value: string) => {
    setTheme(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value }
    }))

    // Update preview styles
    updatePreviewStyles({
      ...theme,
      colors: { ...theme.colors, [key]: value }
    })
  }

  const updateThemeProperty = (key: keyof Omit<ThemeConfig, 'colors'>, value: string) => {
    setTheme(prev => ({
      ...prev,
      [key]: value
    }))

    // Update preview styles
    updatePreviewStyles({
      ...theme,
      [key]: value
    })
  }

  const updatePreviewStyles = (themeData: ThemeConfig) => {
    setPreviewStyle({
      backgroundColor: themeData.colors.background,
      color: themeData.colors.text,
      borderColor: themeData.colors.border,
      borderWidth: '1px',
      borderStyle: 'solid',
      padding: '0',
      display: 'flex',
      flexDirection: 'column',
      height: '600px',
      overflow: 'hidden'
    })

    setButtonStyle({
      backgroundColor: themeData.colors.primary,
      color: themeData.colors.buttonText,
      border: 'none',
      padding: '0.5rem 1.5rem',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      fontWeight: '500'
    })
  }

  // Initial style setup
  useEffect(() => {
    updatePreviewStyles(theme)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        title: '잘못된 파일 형식',
        description: '이미지 파일만 업로드 가능합니다.',
        variant: 'destructive'
      })
      return
    }

    await handleImageUpload(file)
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const generateMD5Hash = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async function(event) {
        if (!event.target || !event.target.result) {
          reject(new Error('파일 읽기 실패'))
          return
        }

        try {
          const buffer = event.target.result as ArrayBuffer
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
          resolve(hashHex)
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = function() {
        reject(new Error('파일 읽기 실패'))
      }

      reader.readAsArrayBuffer(file)
    })
  }

  const uploadFileToS3 = async (file: File): Promise<{ url: string, md5: string }> => {
    let tempFilePath: string | null = null

    try {
      console.log('파일 업로드 시작:', file.name)
      setIsUploading(true)
      const s3Config = await getS3Config()
      if (!s3Config) {
        console.error('S3 설정을 가져올 수 없습니다')
        toast({
          title: 'S3 설정 오류',
          description: 'S3 설정을 가져올 수 없습니다',
          variant: "destructive"
        })
        setIsUploading(false)
        throw new Error('S3 설정을 가져올 수 없습니다')
      }

      const { bucket, region, accessKeyId, secretAccessKey } = s3Config
      console.log('S3 설정 로드 완료:', { bucket, region })

      // 랜덤 4자리 문자열 생성
      const randomPrefix = Math.random().toString(36).substring(2, 6)

      // 파일 이름에서 확장자 추출
      const originalName = file.name
      const fileExtension = originalName.includes('.') ?
        originalName.substring(originalName.lastIndexOf('.')) : ''
      const fileNameWithoutExt = originalName.includes('.') ?
        originalName.substring(0, originalName.lastIndexOf('.')) : originalName

      // 새 파일 이름 생성 (xxxx_파일명.확장자)
      const newFileName = `${randomPrefix}_${fileNameWithoutExt}${fileExtension}`
      const key = `themes/${newFileName}`
      console.log('새 파일 이름 생성:', { originalName, newFileName, key })

      // 임시 파일 생성
      console.log('임시 파일 생성 시작')
      tempFilePath = await window.api.createTempFile({
        fileName: file.name,
        totalSize: file.size
      })

      if (!tempFilePath) {
        console.error('임시 파일 생성 실패')
        toast({
          title: '파일 생성 오류',
          description: '임시 파일 생성 실패',
          variant: "destructive"
        })
        setIsUploading(false)
        throw new Error('임시 파일 생성 실패')
      }
      console.log('임시 파일 생성 완료:', tempFilePath)

      // 파일을 한 번에 업로드
      console.log('파일 버퍼 생성 시작')
      const buffer = await file.arrayBuffer()
      const result = await window.api.appendToTempFile({
        filePath: tempFilePath,
        buffer,
        offset: 0
      })

      if (!result.success) {
        console.error('파일 업로드 실패:', result.error)
        toast({
          title: '파일 업로드 오류',
          description: `파일 업로드 실패: ${result.error}`,
          variant: "destructive"
        })
        setIsUploading(false)
        throw new Error(result.error)
      }
      console.log('파일 버퍼 생성 완료')

      // 진행률 표시 (50%)
      setUploadProgress(50)

      // 임시 파일을 S3에 업로드
      console.log('S3 업로드 시작')
      const uploadResult = await window.api.uploadFileToS3({
        filePath: tempFilePath,
        bucket,
        key,
        accessKeyId,
        secretAccessKey,
        region
      })

      if (!uploadResult.success) {
        console.error('S3 업로드 실패:', uploadResult.error)
        toast({
          title: 'S3 업로드 오류',
          description: `S3 업로드 실패: ${uploadResult.error}`,
          variant: "destructive"
        })
        setIsUploading(false)
        throw new Error(uploadResult.error)
      }

      // S3 업로드 완료 시 진행률 100%로 설정
      setUploadProgress(100)
      console.log('S3 업로드 완료:', { file: file.name, key })

      // 파일 정보 준비
      const fileUrl = `/${key}`

      // MD5 해시 계산
      console.log('MD5 해시 계산 시작')
      const md5Hash = await generateMD5Hash(file)
      console.log('MD5 해시 계산 완료:', md5Hash)

      return {
        url: fileUrl,
        md5: md5Hash
      }
    } catch (error) {
      console.error('파일 업로드 중 오류:', error)
      toast({
        title: '업로드 오류',
        description: `파일 업로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'}`,
        variant: "destructive"
      })
      throw error
    } finally {
      // 임시 파일 삭제 시도
      if (tempFilePath) {
        try {
          console.log('임시 파일 삭제 시도:', tempFilePath)
          await window.api.deleteTempFile({ filePath: tempFilePath })
          console.log('임시 파일 삭제 완료')
        } catch (deleteError) {
          console.warn('임시 파일 삭제 실패:', deleteError)
        }
      }

      setIsUploading(false)
      console.log('파일 업로드 프로세스 종료')
    }
  }

  const handleImageUpload = async (file: File) => {
    // 파일 크기 제한 (1GB)
    if (file.size > 1024 * 1024 * 1024) {
      toast({
        title: '파일 크기 초과',
        description: '파일 크기는 1GB를 초과할 수 없습니다.',
        variant: "destructive"
      })
      return
    }

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      toast({
        title: '잘못된 파일 형식',
        description: '이미지 파일만 업로드 가능합니다.',
        variant: "destructive"
      })
      return
    }

    // 미리보기 생성
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    setSelectedFile(file)
  }

  const saveTheme = async () => {
    try {
      let backgroundImageUrl = theme.backgroundImage

      // 새 이미지가 선택된 경우 업로드
      if (selectedFile) {
        const { url } = await uploadFileToS3(selectedFile)
        backgroundImageUrl = url
        setSelectedFile(null)
        setPreviewImage(null)
      }

      // Create a concise output object with only important settings
      const outputTheme = {
        colors: theme.colors,
        backgroundImage: backgroundImageUrl,
        titleColor: theme.titleColor
      }

      const jsonStr = JSON.stringify(outputTheme, null, 2)
      setJsonOutput(jsonStr)
      setShowJsonDialog(true)

      // 테마 설정 저장 API 호출
      const response = await fetch('/api/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(outputTheme)
      })

      if (!response.ok) {
        throw new Error('테마 설정 저장 실패')
      }

      // 테마 업데이트
      updateThemeProperty('backgroundImage', backgroundImageUrl)

      toast({
        title: '테마 설정 저장 완료',
        description: '테마 설정이 성공적으로 저장되었습니다.',
      })
    } catch (error) {
      console.error('테마 설정 저장 오류:', error)
      toast({
        title: '테마 설정 저장 실패',
        description: '테마 설정 저장 중 오류가 발생했습니다.',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="container mx-auto p-4 text-xs h-full">
      <h1 className="text-xl font-bold mb-2">Design Editor</h1>
      <p className="text-xs text-gray-500 mb-4">Customize your game launcher appearance and style</p>

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="flex flex-col space-y-6">
          {/* Preview area at the top */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border rounded-lg overflow-hidden shadow-md ${isDragging ? 'border-blue-500 bg-blue-50' : ''}`}
                style={previewStyle}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleImageClick}
              >
                {/* Background image area */}
                <div className="flex-1 bg-gray-900 relative overflow-hidden cursor-pointer group">
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      backgroundImage: previewImage
                        ? `url("${previewImage}")`
                        : `url("${theme.backgroundImage}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'brightness(0.7)'
                    }}
                  >
                    {!previewImage && (
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center">
                        <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center">
                          <UploadCloud className="w-8 h-8 mb-2" />
                          <span className="text-sm">이미지 업로드</span>
                          <span className="text-xs">클릭하거나 드래그앤드롭</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Download information area at the bottom */}
                <div className="p-4 bg-white border-t" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
                  <div className="flex items-center justify-between h-full">
                    <div className="flex-1 mr-4 space-y-2">
                      <div className="flex justify-between text-xs" style={{ color: theme.colors.text }}>
                        <span>Preparing file download...</span>
                        <span>Time remaining: Calculating...</span>
                      </div>
                      <div
                        className="w-full h-2 rounded-full"
                        style={{
                          backgroundColor: theme.colors.border,
                          position: 'relative'
                        }}
                      >
                        <div
                          style={{
                            width: '0%',
                            height: '100%',
                            backgroundColor: theme.colors.primary,
                            borderRadius: 'inherit'
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px]" style={{ color: theme.colors.text }}>
                        <span>Download speed: 0 KB/s</span>
                        <span>0%</span>
                      </div>
                    </div>

                    <button
                      style={{
                        ...buttonStyle,
                        width: '150px',
                        height: '60px',
                        backgroundColor: '#0e1525',
                        color: '#fff',
                        fontWeight: 'bold'
                      }}
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings area at the bottom (tabbed interface) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Design Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="images">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="images" className="text-xs">Image Settings</TabsTrigger>
                  <TabsTrigger value="buttons" className="text-xs">Button Settings</TabsTrigger>
                  <TabsTrigger value="background" className="text-xs">Background Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="images">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Background Image Upload</Label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                        style={{ display: 'none' }}
                      />
                      <div className="grid gap-2">
                        <Button
                          onClick={handleImageClick}
                          variant="outline"
                          className="w-full h-8 text-xs"
                        >
                          <Image className="mr-2 h-4 w-4" />
                          이미지 선택
                        </Button>
                        {previewImage && (
                          <div className="relative">
                            <img
                              src={previewImage}
                              alt="미리보기"
                              className="w-full h-32 object-cover rounded-md"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8 bg-white/80 hover:bg-white"
                              onClick={() => {
                                setPreviewImage(null)
                                setSelectedFile(null)
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {theme.backgroundImage && !previewImage && (
                          <div className="text-xs text-green-600">
                            이미지가 업로드되었습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="buttons">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="buttonColor" className="text-xs">Button Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="buttonColor"
                          type="color"
                          value={theme.colors.primary}
                          onChange={(e) => updateThemeColors('primary', e.target.value)}
                          className="w-8 h-8 p-1"
                        />
                        <Input
                          type="text"
                          value={theme.colors.primary}
                          onChange={(e) => updateThemeColors('primary', e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="background">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="backgroundColor" className="text-xs">Background Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="backgroundColor"
                          type="color"
                          value={theme.colors.background}
                          onChange={(e) => updateThemeColors('background', e.target.value)}
                          className="w-8 h-8 p-1"
                        />
                        <Input
                          type="text"
                          value={theme.colors.background}
                          onChange={(e) => updateThemeColors('background', e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="textColor" className="text-xs">Text Color</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="textColor"
                          type="color"
                          value={theme.colors.text}
                          onChange={(e) => updateThemeColors('text', e.target.value)}
                          className="w-8 h-8 p-1"
                        />
                        <Input
                          type="text"
                          value={theme.colors.text}
                          onChange={(e) => updateThemeColors('text', e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Save button */}
      <Button
        onClick={saveTheme}
        className="w-full h-10 mt-4"
        disabled={isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            저장 중...
          </>
        ) : (
          'Save Changes'
        )}
      </Button>

      {/* JSON output dialog */}
      <Dialog open={showJsonDialog} onOpenChange={setShowJsonDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Theme Settings JSON</DialogTitle>
            <DialogDescription className="text-[10px]">
              Copy the JSON code below to save your settings.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-800 p-4 rounded-md overflow-auto text-white">
            <pre className="text-[10px] whitespace-pre-wrap">
              {jsonOutput}
            </pre>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(jsonOutput);
                const button = document.activeElement as HTMLButtonElement;
                const originalText = button.textContent;
                button.textContent = 'Copied to clipboard!';
                setTimeout(() => {
                  button.textContent = originalText;
                }, 2000);
              }}
              className="text-xs"
            >
              Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default DesignEditor
