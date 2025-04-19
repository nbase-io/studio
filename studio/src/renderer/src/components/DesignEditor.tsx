import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, UploadCloud, X, Image as ImageIcon } from 'lucide-react'
import { apiService, Environment, ThemeConfig } from '@/lib/api'
import { getS3Config, generateMD5Hash } from '@/lib/utils'
import { useSettings } from '@/main'
interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  buttonText: string
  border: string
}

interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

// defaultTheme 정의 추가
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
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showImageUploadDialog, setShowImageUploadDialog] = useState<boolean>(false)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [currentEnvironment, setCurrentEnvironment] = useState<Environment | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings } = useSettings();
  // Fetch environments from API
  const fetchEnvironments = async () => {
    try {
      const environments = await apiService.fetchEnvironments();
      setEnvironments(environments);

      // Set current environment if available
      if (environments.length > 0) {
        const currentEnv = environments[0];
        setCurrentEnvironment(currentEnv);
        setTheme(currentEnv.data);

        // 오브젝트 스토리지에서 이미지 가져오기
        if (currentEnv.data.backgroundImage) {
          if (currentEnv.data.backgroundImage.startsWith('data:')) {
            // 이미 data URL인 경우 그대로 사용
            setPreviewImage(currentEnv.data.backgroundImage);
          } else {
            try {
              // S3 설정 가져오기
              const s3Config = await getS3Config();
              if (!s3Config) throw new Error('S3 설정을 가져올 수 없습니다');

              // 상대 경로인 경우 전체 URL 구성
              let imageUrl = currentEnv.data.backgroundImage;
              if (imageUrl.startsWith('/')) {
                // CDN URL이 있으면 사용, 없으면 endpointUrl 사용
                const baseUrl = settings.cdnUrl || s3Config.endpointUrl;
                imageUrl = `${baseUrl}${imageUrl}`;
              }

              // 이미지를 Fetch API로 가져와서 blob으로 변환
              const response = await fetch(imageUrl, { mode: 'no-cors' });
              const blob = await response.blob();

              // Blob을 Base64로 변환
              const reader = new FileReader();
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                setPreviewImage(dataUrl);
              };
              reader.readAsDataURL(blob);
            } catch (error) {
              console.error('이미지 가져오기 실패:', error);
              // 이미지 가져오기 실패 시 기본 이미지 사용
              setPreviewImage(defaultTheme.backgroundImage);
              toast({
                title: '이미지 로드 실패',
                description: '오브젝트 스토리지에서 이미지를 가져오는데 실패했습니다.',
                variant: 'destructive'
              });
            }
          }
        } else {
          // 이미지 URL이 없는 경우 기본 이미지 사용
          setPreviewImage(defaultTheme.backgroundImage);
        }

        // Update preview styles after setting the theme
        updatePreviewStyles(currentEnv.data);
      }
    } catch (error) {
      console.error('Error fetching environments:', error);
      toast({
        title: 'Failed to Load Environments',
        description: 'Could not load saved environments. Using default settings.',
        variant: 'destructive'
      });
    }
  };

  // Initial CDN URL loading
  useEffect(() => {

    // 설정에서 로그인 정보 가져오기

    fetchEnvironments(); // Load saved environments on component mount
  }, []);

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
      const newFileName = `${settings.projectId}_background.${fileExtension}`;
      const key = `themes/${newFileName}`;

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

  const handleImageClick = () => {
    setShowImageUploadDialog(true)
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }


  // Image upload handler
  const handleImageUpload = async (file: File) => {
    setIsUploading(true)

    try {
      // File size limit (10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File Size Exceeded',
          description: 'File size cannot exceed 10MB.',
          variant: "destructive"
        })
        setIsUploading(false)
        return
      }

      // File type validation - only PNG allowed
      if (file.type !== 'image/png') {
        toast({
          title: 'Unsupported File Format',
          description: 'Only PNG image format is allowed.',
          variant: "destructive"
        })
        setIsUploading(false)
        return
      }

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreviewImage(dataUrl)
        // Update theme with the data URL
        updateThemeProperty('backgroundImage', dataUrl)
      }
      reader.readAsDataURL(file)
      setSelectedFile(file)

      // Close dialog after upload
      setShowImageUploadDialog(false)
    } catch (error) {
      console.error('Error processing file:', error)
      toast({
        title: 'File Processing Error',
        description: `Failed to process file: ${error instanceof Error ? error.message : 'An unknown error occurred'}`,
        variant: "destructive"
      })
    } finally {
      setIsUploading(false)
    }
  }

  const saveTheme = async () => {
    try {
      setIsSaving(true);
      let backgroundImageUrl = theme.backgroundImage;

      // 선택된 이미지 파일이 있다면 S3에 업로드
      if (selectedFile) {
        try {
          const uploadResult = await uploadFileToS3(selectedFile);
          backgroundImageUrl = uploadResult.url;
          console.log('S3 업로드 완료:', backgroundImageUrl);
        } catch (uploadError) {
          console.error('이미지 업로드 오류:', uploadError);
          toast({
            title: '이미지 업로드 실패',
            description: '이미지를 업로드하는 중 오류가 발생했습니다. 테마는 저장되지만 이미지는 기존 이미지가 유지됩니다.',
            variant: 'destructive'
          });
          // 업로드 실패 시 기존 URL 유지
        }
      }

      // Create environment object to save
      const environment: Environment = {
        data: {
          colors: theme.colors,
          backgroundImage: backgroundImageUrl,
          titleColor: theme.titleColor
        }
      };

      // If editing existing environment, include its ID
      if (currentEnvironment?.id) {
        environment.id = currentEnvironment.id;
      }

      const jsonStr = JSON.stringify(environment, null, 2);
      setJsonOutput(jsonStr);

      // API를 통해 환경 설정 저장
      const savedEnvironment = await apiService.saveEnvironment(environment);

      // Update the current environment
      setCurrentEnvironment(savedEnvironment);

      // Refresh environments list
      fetchEnvironments();

      // Show success and JSON dialog
      toast({
        title: 'Environment Saved',
        description: 'Your environment settings have been saved successfully.',
      });

      setShowJsonDialog(true);

      // Clear selected file and preview after save
      if (selectedFile) {
        setSelectedFile(null);
        setPreviewImage(null);
      }
    } catch (error) {
      console.error('Environment save error:', error);
      toast({
        title: 'Save Failed',
        description: 'An error occurred while saving your environment settings.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
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
                className="border rounded-lg overflow-hidden shadow-md"
                style={previewStyle}
                onClick={handleImageClick}
              >
                {/* Background image area */}
                <div className="flex-1 bg-gray-900 relative overflow-hidden cursor-pointer group">
                  <div
                    className="absolute inset-0 flex items-center justify-center"

                  >
                    {previewImage && (
                      <img
                        src={previewImage}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                      <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center">
                        <UploadCloud className="w-8 h-8 mb-2" />
                        <span className="text-sm">Click to Upload Image</span>
                      </div>
                    </div>
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

          {/* Settings area at the bottom */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Design Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Button Settings */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Button Settings</h3>
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

                {/* Background Settings */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Background Settings</h3>
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
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Save button */}
      <Button
        onClick={saveTheme}
        className="w-full h-10 mt-4 mb-8"
        disabled={isUploading || isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Changes'
        )}
      </Button>

      {/* JSON output dialog */}
      <Dialog open={showJsonDialog} onOpenChange={setShowJsonDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Environment Settings JSON</DialogTitle>
            <DialogDescription className="text-[10px]">
              The JSON below has been saved to the server via API.
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

      {/* Image upload dialog */}
      <Dialog open={showImageUploadDialog} onOpenChange={setShowImageUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Upload Background Image</DialogTitle>
            <DialogDescription className="text-[10px]">
              Select a PNG image to use as your launcher background.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png"
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              style={{ display: 'none' }}
            />

            <Button
              onClick={handleFileSelect}
              className="w-full"
              variant="outline"
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Select PNG Image
                </>
              )}
            </Button>

            <div className="text-xs text-gray-500">
              <p>Requirements:</p>
              <ul className="list-disc list-inside">
                <li>PNG format only</li>
                <li>Maximum file size: 10MB</li>
                <li>Recommended resolution: 1920×1080 or higher</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowImageUploadDialog(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedFile) {
                  // FileReader로 데이터 URL 생성
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const dataUrl = e.target?.result as string;
                    // 테마 업데이트에 데이터 URL 사용
                    updateThemeProperty('backgroundImage', dataUrl);
                    setShowImageUploadDialog(false);
                  };
                  reader.readAsDataURL(selectedFile);
                } else {
                  toast({
                    title: 'No Image Selected',
                    description: 'Please select an image first.',
                    variant: "destructive"
                  });
                }
              }}
              className="text-xs"
              disabled={!selectedFile || isUploading}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default DesignEditor
