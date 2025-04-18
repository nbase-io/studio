import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, UploadCloud, X, Image as ImageIcon } from 'lucide-react'

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

interface Environment {
  id?: string;
  data: ThemeConfig;
  createdAt?: string;
  updatedAt?: string;
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
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [cdnUrl, setCdnUrl] = useState<string>('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showImageUploadDialog, setShowImageUploadDialog] = useState<boolean>(false)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [currentEnvironment, setCurrentEnvironment] = useState<Environment | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get S3 configuration function
  const getS3Config = async () => {
    try {
      if (!window.api || typeof window.api.getS3Config !== 'function') {
        console.error('window.api.getS3Config function is not defined.');

        // Get information from localStorage (alternative method)
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
        throw new Error('Failed to get S3 configuration');
      }

      return config;
    } catch (error) {
      console.error('S3 configuration error:', error);
      toast({
        title: 'S3 Configuration Error',
        description: 'An error occurred while getting settings. Using default values.'
      });

      // Return default values on error
      return {
        cdnUrl: ''
      };
    }
  };

  // Fetch environments from API
  const fetchEnvironments = async () => {
    try {
      const response = await fetch('/v1/studio/environments');
      if (!response.ok) {
        throw new Error('Failed to fetch environments');
      }

      const data = await response.json();
      setEnvironments(data);

      // Set current environment if available
      if (data.length > 0) {
        const currentEnv = data[0];
        setCurrentEnvironment(currentEnv);
        setTheme(currentEnv.theme);
        setEnvironmentName(currentEnv.name);

        // Update preview styles after setting the theme
        setPreviewStyle({
          backgroundColor: currentEnv.theme.colors.background,
          color: currentEnv.theme.colors.text,
          borderColor: currentEnv.theme.colors.border,
          borderWidth: '1px',
          borderStyle: 'solid',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          height: '600px',
          overflow: 'hidden'
        });

        setButtonStyle({
          backgroundColor: currentEnv.theme.colors.primary,
          color: currentEnv.theme.colors.buttonText,
          border: 'none',
          padding: '0.5rem 1.5rem',
          borderRadius: '0.25rem',
          cursor: 'pointer',
          fontWeight: '500'
        });
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
    const loadCdnUrl = async () => {
      try {
        const config = await getS3Config();
        if (config && config.cdnUrl) {
          setCdnUrl(config.cdnUrl);
        } else {
          console.log('CDN URL is not set. Using default image.');
        }
      } catch (error) {
        console.error('CDN URL loading error:', error);
      }
    };

    loadCdnUrl();
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
        setPreviewImage(e.target?.result as string)
      }
      reader.readAsDataURL(file)
      setSelectedFile(file)

      // Update theme with the new image
      updateThemeProperty('backgroundImage', URL.createObjectURL(file))

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

      // Create environment object to save
      const environment: Environment = {
        name: environmentName,
        theme: {
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

      // Save environment to API
      const response = await fetch('/v1/studio/environments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(environment)
      });

      if (!response.ok) {
        throw new Error('Failed to save environment settings');
      }

      // Get the saved environment data with ID
      const savedEnvironment = await response.json();

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
                    style={{
                      backgroundImage: `url("${theme.backgroundImage}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'brightness(0.7)'
                    }}
                  >
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

            {previewImage && (
              <div className="relative">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-md"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 bg-white/80 hover:bg-white"
                  onClick={() => {
                    setPreviewImage(null);
                    setSelectedFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

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
                  // Update theme with selected file
                  updateThemeProperty('backgroundImage', URL.createObjectURL(selectedFile));
                  setShowImageUploadDialog(false);
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
