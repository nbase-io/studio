import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, AlertCircle, Save, LogIn } from 'lucide-react'
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

// CSS로 스위치 컴포넌트 구현 (Radix UI를 사용하지 않는 간단한 버전)
const ToggleSwitch = ({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) => {
  return (
    <div className="flex items-center justify-between p-2 rounded-md">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`${
            checked ? 'translate-x-5' : 'translate-x-1'
          } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
        />
      </button>
    </div>
  );
};

function Settings(): JSX.Element {
  // 글로벌 설정 컨텍스트 사용
  const { settings: globalSettings, loading: globalLoading, saveSettings: saveGlobalSettings } = useSettings();

  // 로그인 화면 상태
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // 베타 환경 선택 상태 (기본값: false = 리얼 환경)
  const [isBetaEnv, setIsBetaEnv] = useState(false);

  // API 서버 주소 상수
  const API_URL_REAL = 'https://plugin.gamepot.ntruss.com';
  const API_URL_BETA = 'https://dev-plugin.gamepot.io';

  // 로컬 상태 - 수정 중인 설정을 위한 상태
  const [settings, setSettings] = useState({
    projectId: '',
    apiKey: '',
    accessKey: '',
    secretKey: '',
    region: '',
    s3Bucket: '',
    serverUrl: '',
    cdnUrl: '',
    endpointUrl: '',
  });

  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const { toast } = useToast()

  // 테스트 결과 다이얼로그 상태
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Builds 접속 오류 다이얼로그 상태
  const [showBuildsErrorDialog, setShowBuildsErrorDialog] = useState(false)
  const [buildsError, setBuildsError] = useState<string>("")

  // 환경 변경 시 서버 URL 자동 업데이트
  useEffect(() => {
    const serverUrl = isBetaEnv ? API_URL_BETA : API_URL_REAL;
    setSettings(prev => ({
      ...prev,
      serverUrl
    }));
  }, [isBetaEnv]);

  // 글로벌 설정이 로드되면 로컬 상태에 적용
  useEffect(() => {
    if (!globalLoading && globalSettings) {
      const storedServerUrl = globalSettings.serverUrl || API_URL_REAL;
      // 서버 URL로 베타 환경 여부 결정
      const isBeta = storedServerUrl === API_URL_BETA;
      setIsBetaEnv(isBeta);

      setSettings({
        accessKey: globalSettings.accessKey || '',
        secretKey: globalSettings.secretKey || '',
        region: globalSettings.region || 'ap-northeast-2',
        s3Bucket: globalSettings.s3Bucket || '',
        projectId: globalSettings.projectId || '',
        apiKey: globalSettings.apiKey || '',
        serverUrl: storedServerUrl,
        cdnUrl: globalSettings.cdnUrl || '',
        endpointUrl: typeof globalSettings.endpointUrl === 'string' ? globalSettings.endpointUrl : ''
      });
    }
  }, [globalSettings, globalLoading]);

  // Builds 접속 오류 이벤트 리스너
  useEffect(() => {
    const handleBuildsError = (event: CustomEvent<{error: string}>) => {
      setBuildsError(event.detail.error);
      setShowBuildsErrorDialog(true);
    };

    // 이벤트 리스너 등록
    window.addEventListener('builds-access-error', handleBuildsError as EventListener);

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      window.removeEventListener('builds-access-error', handleBuildsError as EventListener);
    };
  }, []);

  const handleInputChange = (key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // 환경 변경 핸들러
  const handleEnvironmentChange = (isChecked: boolean) => {
    setIsBetaEnv(isChecked);
    // 환경 변경 시 서버 URL도 자동 변경 (useEffect에서 처리)
  };

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
        // 서버 URL로 베타 환경 여부 결정
        const isBeta = savedSettings.serverUrl === API_URL_BETA;
        setIsBetaEnv(isBeta);

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
    <div className="container mx-auto p-4 text-sm h-full">
      <h1 className="text-base font-bold mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-4">Configure your GamePot studio settings</p>

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="flex flex-col space-y-6">
          {/* API 환경 설정 카드 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">환경 설정</CardTitle>
              <CardDescription className="text-xs">API 환경을 선택하세요.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleSwitch
                checked={isBetaEnv}
                onChange={handleEnvironmentChange}
                label={isBetaEnv ? "베타 환경" : "리얼 환경"}
                description={`현재 API 주소: ${settings.serverUrl}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">API Configuration</CardTitle>
              <CardDescription className="text-xs">Configure API access for build management.</CardDescription>

              {/* 로그인 버튼 추가 */}
              <div className="flex justify-end mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // 깔끔하게 이벤트만 발생시킴
                    const showLoginEvent = new CustomEvent('show-login-modal');
                    window.dispatchEvent(showLoginEvent);
                  }}
                  className="text-xs h-8"
                >

                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="projectId" className="text-xs">Project ID</Label>
                  <Input
                    id="projectId"
                    value={settings.projectId}
                    onChange={(e) => handleInputChange('projectId', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="apiKey" className="text-xs">PLUGIN API Key</Label>
                  <Input
                    id="apiKey"
                    value={settings.apiKey}
                    onChange={(e) => handleInputChange('apiKey', e.target.value)}
                    className="h-8 text-xs"
                    type="password"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="serverUrl" className="text-xs">서버 URL</Label>
                <Input
                  id="serverUrl"
                  value={settings.serverUrl}
                  onChange={(e) => handleInputChange('serverUrl', e.target.value)}
                  className="h-8 text-xs"
                  placeholder="https://plugin.gamepot.ntruss.com"
                  disabled={true} // 환경 스위치로 자동 설정되므로 직접 수정 불가
                />
                <p className="text-xs text-gray-500 mt-1">
                  * 환경 설정에 따라 자동으로 설정됩니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">S3 Configuration</CardTitle>
              <CardDescription className="text-xs">Configure credentials to access S3 buckets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                {testingConnection && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Test S3 Connection
              </Button>
            </CardFooter>
          </Card>

          <div className="flex justify-end space-x-3 mt-4">
            <Button
              onClick={saveSettings}
              className="h-9 px-4 text-xs"
              disabled={loading}
              size="sm"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="mr-1 h-4 w-4" />
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
            <div className="bg-gray-50 rounded-md p-3 text-sm">
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
                <h4 className="font-medium mb-2 text-sm">버킷 내 폴더</h4>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1">
                    {testResult.folders.map((folder, idx) => (
                      <div key={idx} className="text-xs flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 mr-1">
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
                <h4 className="font-medium mb-2 text-sm">버킷 내 파일</h4>
                <ScrollArea className="h-28 rounded-md border p-2">
                  <div className="space-y-1">
                    {testResult.files.map((file, idx) => (
                      <div key={idx} className="text-xs flex items-center justify-between">
                        <div className="flex items-center truncate">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 mr-1">
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
            <Button onClick={() => setShowResultDialog(false)} className="h-9 text-sm">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Builds 접속 오류 다이얼로그 */}
      <Dialog open={showBuildsErrorDialog} onOpenChange={setShowBuildsErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span>Builds 접속 오류</span>
            </DialogTitle>
            <DialogDescription>
              빌드 서비스에 접속하는 중 오류가 발생했습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 오류 상세 정보 */}
            <div className="bg-gray-50 rounded-md p-3 text-sm">
              <h4 className="font-medium mb-2">오류 정보</h4>
              <div className="space-y-1">
                <div className="text-gray-700">{buildsError}</div>
                <div className="text-gray-700">시간: {new Date().toLocaleString()}</div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowBuildsErrorDialog(false)} className="h-9 text-sm">
              닫기
            </Button>
            <Button
              onClick={() => {
                setShowBuildsErrorDialog(false);
                // 재시도 이벤트 발생
                window.dispatchEvent(new CustomEvent('retry-builds-access'));
              }}
              className="h-9 text-sm"
              variant="default"
            >
              재시도
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Settings
