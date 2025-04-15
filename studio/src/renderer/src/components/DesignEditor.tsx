import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme)
  const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({})
  const [buttonStyle, setButtonStyle] = useState<React.CSSProperties>({})
  const [jsonOutput, setJsonOutput] = useState<string>('')
  const [showJsonDialog, setShowJsonDialog] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateThemeColors = (key: keyof ThemeColors, value: string) => {
    setTheme(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value }
    }))

    // 미리보기 스타일 업데이트
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

    // 미리보기 스타일 업데이트
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

  // 초기 스타일 설정
  useEffect(() => {
    updatePreviewStyles(theme)
  }, [])

  const saveTheme = () => {
    // 중요 설정만 포함한 간결한 출력 객체 생성
    const outputTheme = {
      colors: theme.colors,
      backgroundImage: theme.backgroundImage.startsWith('data:image')
        ? '[Uploaded Image Data]' // 데이터 URL이 너무 길면 간략하게 표시
        : theme.backgroundImage,
      titleColor: theme.titleColor
    }

    const jsonStr = JSON.stringify(outputTheme, null, 2)
    setJsonOutput(jsonStr)
    setShowJsonDialog(true)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string
      if (imageUrl) {
        updateThemeProperty('backgroundImage', imageUrl)
      }
    }
    reader.readAsDataURL(file)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="container mx-auto p-4 text-sm">
      <h1 className="text-2xl font-bold mb-6">Design Editor</h1>

      <div className="flex flex-col space-y-6">
        {/* 위쪽: 미리보기 영역 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden shadow-md" style={previewStyle}>
              {/* 배경 이미지 영역 */}
              <div className="flex-1 bg-gray-900 relative overflow-hidden">
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    backgroundImage: `url("${theme.backgroundImage}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.7)'
                  }}
                ></div>
              </div>

              {/* 하단 다운로드 정보 영역 */}
              <div className="p-4 bg-white border-t" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
                <div className="flex items-center justify-between h-full">
                  <div className="flex-1 mr-4 space-y-2">
                    <div className="flex justify-between text-sm" style={{ color: theme.colors.text }}>
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
                    <div className="flex justify-between text-xs" style={{ color: theme.colors.text }}>
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

        {/* 아래쪽: 설정 영역 (탭 형태) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Design Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="images">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="images" className="text-xs">Image Settings</TabsTrigger>
                <TabsTrigger value="buttons" className="text-xs">Button Settings</TabsTrigger>
                <TabsTrigger value="background" className="text-xs">Background Settings</TabsTrigger>
              </TabsList>

              {/* 이미지 설정 탭 */}
              <TabsContent value="images">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Background Image Upload</Label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                    <div className="grid gap-2">
                      <Button
                        onClick={triggerFileInput}
                        variant="outline"
                        className="w-full h-8 text-xs"
                      >
                        Select Image File
                      </Button>
                      {theme.backgroundImage && theme.backgroundImage.startsWith('data:image') && (
                        <div className="text-xs text-green-600">
                          User image has been uploaded.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 버튼 설정 탭 */}
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

              {/* 배경 설정 탭 */}
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

        {/* 저장 버튼을 하단으로 이동 */}
        <Button onClick={saveTheme} className="w-full h-10">Save Changes</Button>
      </div>

      {/* JSON 출력 다이얼로그 */}
      <Dialog open={showJsonDialog} onOpenChange={setShowJsonDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Theme Settings JSON</DialogTitle>
            <DialogDescription className="text-xs">
              Copy the JSON code below to save your settings.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-800 p-4 rounded-md overflow-auto text-white">
            <pre className="text-xs whitespace-pre-wrap">
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
