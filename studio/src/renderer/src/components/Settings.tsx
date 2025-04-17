import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, AlertCircle, Save } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '../main' // 설정 컨텍스트 훅 가져오기

interface TestResult {
  success: boolean;
  message: string;
  details: string[];
  files?: Array<{ key: string; size: number; lastModified: Date }>;
  folders?: string[];
  error?: string;
}

function Settings(): JSX.Element {
  // 글로벌 설정 컨텍스트 사용
  const { settings: globalSettings, loading: globalLoading, saveSettings: saveGlobalSettings } = useSettings();

  // 로컬 상태 - 수정 중인 설정을 위한 상태
  const [settings, setSettings] = useState({
    accessKey: '',
    secretKey: '',
    region: 'ap-northeast-2',
    s3Bucket: '',
    projectId: '',
    apiKey: '',
    serverUrl: 'http://localhost:4000',
    cdnUrl: '',
    endpointUrl: ''
  })

  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const { toast } = useToast()

  // 테스트 결과 다이얼로그 상태
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // 글로벌 설정이 로드되면 로컬 상태에 적용
  useEffect(() => {
    if (!globalLoading && globalSettings) {
      setSettings({
        accessKey: globalSettings.accessKey || '',
        secretKey: globalSettings.secretKey || '',
        region: globalSettings.region || 'ap-northeast-2',
        s3Bucket: globalSettings.s3Bucket || '',
        projectId: globalSettings.projectId || '',
        apiKey: globalSettings.apiKey || '',
        serverUrl: globalSettings.serverUrl || 'http://localhost:4000',
        cdnUrl: globalSettings.cdnUrl || '',
        endpointUrl: globalSettings.endpointUrl || ''
      });
    }
  }, [globalSettings, globalLoading]);

  const handleInputChange = (key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // 설정 저장 함수
  const saveSettings = async () => {
    try {
      setLoading(true)

      // 글로벌 설정 저장
      const success = await saveGlobalSettings(settings);

      if (!success) {
        throw new Error('설정 저장 중 오류가 발생했습니다')
      }

      toast({
        title: '설정 저장 완료',
        description: '환경 설정이 성공적으로 저장되었습니다.',
      })
    } catch (error: any) {
      console.error('설정 저장 오류:', error)
      toast({
        title: '설정 저장 실패',
        description: error.message || '알 수 없는 오류가 발생했습니다',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // 저장된 설정 불러오기
  const loadSettings = async () => {
    try {
      setLoading(true)
      setLoadFailed(false)

      if (!window.api || !window.api.loadSettings) {
        setLoadFailed(true)
        return
      }

      const savedSettings = await window.api.loadSettings()

      if (savedSettings) {
        setSettings(prev => ({
          ...prev,
          ...savedSettings
        }))
      } else {
        setLoadFailed(true)
      }
    } catch (error: any) {
      setLoadFailed(true)
      console.error('설정 로드 오류:', error)
    } finally {
      setLoading(false)
    }
  }

  // 컴포넌트 마운트 시 설정 로드
  useEffect(() => {
    loadSettings()
  }, [])

  const testS3Connection = async () => {
    try {
      setTestingConnection(true)

      // 테스트 결과 초기화
      setTestResult(null)

      if (!window.api || !window.api.listS3Files) {
        throw new Error('S3 API를 사용할 수 없습니다')
      }

      if (!settings.s3Bucket) {
        throw new Error('S3 버킷 이름을 입력해주세요')
      }

      // 설정을 먼저 저장
      console.log('S3 테스트 전 설정 저장...')
      if (window.api.saveSettings) {
        await window.api.saveSettings(settings)
      }

      const details: string[] = [
        `리전: ${settings.region}`,
        `버킷: ${settings.s3Bucket}`,
        `액세스 키 ID: ${settings.accessKey.slice(0, 5)}...${settings.accessKey.slice(-3)}`,
      ];

      // S3 연결 테스트 (루트 디렉토리 목록 가져오기)
      const result = await window.api.listS3Files({
        bucket: settings.s3Bucket,
        prefix: ''
      })

      if (result.error) {
        throw new Error(`S3 연결 실패: ${result.error}`)
      }

      // 성공 메시지 표시
      const filesCount = result.files?.length || 0
      const foldersCount = result.folders?.length || 0

      // 테스트 결과 저장
      setTestResult({
        success: true,
        message: `버킷 '${settings.s3Bucket}'에 성공적으로 연결되었습니다.`,
        details: [
          ...details,
          `폴더 수: ${foldersCount}개`,
          `파일 수: ${filesCount}개`,
          `테스트 시간: ${new Date().toLocaleString()}`
        ],
        files: result.files,
        folders: result.folders
      })

      // 결과 다이얼로그 표시
      setShowResultDialog(true)

      toast({
        title: 'S3 연결 성공',
        description: `버킷 '${settings.s3Bucket}'에 연결되었습니다. ${foldersCount}개 폴더, ${filesCount}개 파일 확인됨.`,
      })
    } catch (error: any) {
      console.error('S3 연결 테스트 오류:', error)

      // 기본 연결 정보
      const details: string[] = [
        `리전: ${settings.region}`,
        `버킷: ${settings.s3Bucket}`,
        `액세스 키 ID: ${settings.accessKey ? settings.accessKey.slice(0, 5) + '...' + settings.accessKey.slice(-3) : '설정되지 않음'}`,
      ];

      // 실패 결과 저장
      setTestResult({
        success: false,
        message: 'S3 연결에 실패했습니다.',
        details: [
          ...details,
          `오류 메시지: ${error.message || '알 수 없는 오류'}`,
          `테스트 시간: ${new Date().toLocaleString()}`
        ],
        error: error.message || '알 수 없는 오류'
      })

      // 결과 다이얼로그 표시
      setShowResultDialog(true)

      toast({
        title: 'S3 연결 실패',
        description: error.message || '알 수 없는 오류가 발생했습니다',
        variant: 'destructive'
      })
    } finally {
      setTestingConnection(false)
    }
  }

  // 파일 크기 포맷 함수
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  return (
    <div className="container mx-auto p-4 text-xs h-full">
      <h1 className="text-xl font-bold mb-2">Settings</h1>
      <p className="text-xs text-gray-500 mb-4">Configure your GamePot studio settings</p>

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="flex flex-col space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">API Configuration</CardTitle>
              <CardDescription className="text-xs">Configure API access for build management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="projectId" className="text-xs">Project ID</Label>
                  <Input
                    id="projectId"
                    value={settings.projectId}
                    onChange={(e) => handleInputChange('projectId', e.target.value)}
                    placeholder="your-project-id"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="apiKey" className="text-xs">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => handleInputChange('apiKey', e.target.value)}
                    placeholder="your-api-key"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="serverUrl" className="text-xs">Server URL</Label>
                  <Input
                    id="serverUrl"
                    value={settings.serverUrl}
                    onChange={(e) => handleInputChange('serverUrl', e.target.value)}
                    placeholder="http://localhost:4000"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cdnUrl" className="text-xs">CDN URL</Label>
                  <Input
                    id="cdnUrl"
                    value={settings.cdnUrl}
                    onChange={(e) => handleInputChange('cdnUrl', e.target.value)}
                    placeholder="https://cdn.yourdomain.com"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">S3 Configuration</CardTitle>
              <CardDescription className="text-xs">Configure credentials to access S3 buckets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="accessKey" className="text-xs">Access Key ID</Label>
                  <Input
                    id="accessKey"
                    value={settings.accessKey}
                    onChange={(e) => handleInputChange('accessKey', e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="secretKey" className="text-xs">Secret Access Key</Label>
                  <Input
                    id="secretKey"
                    type="password"
                    value={settings.secretKey}
                    onChange={(e) => handleInputChange('secretKey', e.target.value)}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="region" className="text-xs">Region</Label>
                  <Input
                    id="region"
                    value={settings.region}
                    onChange={(e) => handleInputChange('region', e.target.value)}
                    placeholder="ap-northeast-2"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="s3Bucket" className="text-xs">Bucket Name</Label>
                  <Input
                    id="s3Bucket"
                    value={settings.s3Bucket}
                    onChange={(e) => handleInputChange('s3Bucket', e.target.value)}
                    placeholder="my-game-launcher-bucket"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endpointUrl" className="text-xs">Endpoint URL (Optional)</Label>
                  <Input
                    id="endpointUrl"
                    value={settings.endpointUrl}
                    onChange={(e) => handleInputChange('endpointUrl', e.target.value)}
                    placeholder="https://s3.ap-northeast-2.amazonaws.com"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                onClick={testS3Connection}
                variant="outline"
                className="flex-1 h-8 text-xs"
                disabled={testingConnection || !settings.s3Bucket}
              >
                {testingConnection && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Test S3 Connection
              </Button>
            </CardFooter>
          </Card>

          <div className="flex justify-end space-x-3 mt-4">
            <Button
              onClick={saveSettings}
              className="h-10 px-6"
              disabled={loading}
              size="default"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* S3 연결 테스트 결과 다이얼로그 */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {testResult?.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  <span>S3 연결 테스트 성공</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span>S3 연결 테스트 실패</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {testResult?.message}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 테스트 상세 정보 */}
            <div className="bg-gray-50 rounded-md p-3 text-xs">
              <h4 className="font-medium mb-2">연결 정보</h4>
              <div className="space-y-1">
                {testResult?.details.map((detail, index) => (
                  <div key={index} className="text-gray-700">{detail}</div>
                ))}
              </div>
            </div>

            {/* 파일 및 폴더 목록 (성공한 경우에만) */}
            {testResult?.success && testResult.folders && testResult.folders.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-xs">버킷 내 폴더</h4>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1">
                    {testResult.folders.map((folder, idx) => (
                      <div key={idx} className="text-xs flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 mr-1">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        {folder}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {testResult?.success && testResult.files && testResult.files.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-xs">버킷 내 파일</h4>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1">
                    {testResult.files.map((file, idx) => (
                      <div key={idx} className="text-xs flex items-center justify-between">
                        <div className="flex items-center truncate">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 mr-1">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                          </svg>
                          <span className="truncate">{file.key}</span>
                        </div>
                        <span className="text-gray-500 ml-2">{formatFileSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)} className="h-8 text-xs">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Settings
