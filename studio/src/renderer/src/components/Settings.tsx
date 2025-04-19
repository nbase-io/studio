import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertCircle, Save, ChevronDown, ChevronUp } from 'lucide-react'
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

// 글로벌 Settings 타입과 호환성을 위한 타입 정의
type Settings = {
  projectId: string;
  apiKey: string;
  accessKey: string;
  secretKey: string;
  region: string;
  s3Bucket: string;
  serverUrl: string;
  endpointUrl: string;
  cdnUrl: string;
  [key: string]: any;
}

// 로컬 앱 설정 타입
interface AppSettings {
  projectId: string;
  apiKey: string;
  // S3 설정 필드
  accessKey: string;
  secretKey: string;
  region: string;
  s3Bucket: string;
  serverUrl: string; // serverUrl 필드 추가 (Settings 타입 호환을 위해)
  endpointUrl: string;
  cdnUrl: string;
  [key: string]: any; // 다른 필드도 허용
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

  // S3 설정 표시 여부
  const [showS3Settings, setShowS3Settings] = useState(false);

  // 로컬 상태 - 수정 중인 설정을 위한 상태 (기본값 설정)
  const [settings, setSettings] = useState<Settings>({
    projectId: '',
    apiKey: '',
    accessKey: '',
    secretKey: '',
    region: 'ap-northeast-2',
    s3Bucket: '',
    serverUrl: '',
    endpointUrl: '',
    cdnUrl: ''
  });

  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const { toast } = useToast()

  // Builds 접속 오류 다이얼로그 상태
  const [showBuildsErrorDialog, setShowBuildsErrorDialog] = useState(false)
  const [buildsError, setBuildsError] = useState<string>("")

  // 글로벌 설정이 로드되면 로컬 상태에 적용
  useEffect(() => {
    if (!globalLoading && globalSettings) {
      // 모든 필드에 기본값을 설정하여 undefined 방지
      setSettings({
        projectId: String(globalSettings.projectId || ''),
        apiKey: String(globalSettings.apiKey || ''),
        accessKey: String(globalSettings.accessKey || ''),
        secretKey: String(globalSettings.secretKey || ''),
        region: String(globalSettings.region || 'ap-northeast-2'),
        s3Bucket: String(globalSettings.s3Bucket || ''),
        serverUrl: String(globalSettings.serverUrl || ''),
        endpointUrl: String(globalSettings.endpointUrl || ''),
        cdnUrl: String(globalSettings.cdnUrl || '')
      });

      // S3 설정 정보가 있으면 S3 설정 섹션 표시
      setShowS3Settings(true);
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

  // 설정 저장 함수
  const saveSettings = async () => {
    try {
      setLoading(true)

      const settingsToSave: AppSettings = {
        ...settings,
      };

      // 글로벌 설정 저장
      const success = await saveGlobalSettings(settingsToSave);

      if (!success) {
        throw new Error('설정 저장 중 오류가 발생했습니다')
      }

      // 설정 변경 이벤트 발생
      window.dispatchEvent(new CustomEvent('settings-updated', { detail: settingsToSave }));

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

      // 1. 저장된 설정 로드
      const savedSettings = await window.api.loadSettings()

      if (savedSettings) {
        // 모든 필드에 기본값을 설정하여 undefined 방지
        setSettings({
          projectId: String(savedSettings.projectId || ''),
          apiKey: String(savedSettings.apiKey || ''),
          accessKey: String(savedSettings.accessKey || ''),
          secretKey: String(savedSettings.secretKey || ''),
          region: String(savedSettings.region || 'ap-northeast-2'),
          s3Bucket: String(savedSettings.s3Bucket || ''),
          serverUrl: String(savedSettings.serverUrl || ''),
          endpointUrl: String(savedSettings.endpointUrl || ''),
          cdnUrl: String(savedSettings.cdnUrl || '')
        });

        // S3 설정 정보가 있으면 S3 설정 섹션 표시
        if (
          savedSettings.accessKey ||
          savedSettings.secretKey ||
          savedSettings.region ||
          savedSettings.s3Bucket
        ) {
          setShowS3Settings(true);
        }
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

  return (
    <div className="container mx-auto p-4 text-sm h-full">
      <h1 className="text-base font-bold mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-4">Configure your GamePot studio settings</p>

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="flex flex-col space-y-6">
          {/* 통합된 설정 카드 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">API Configuration</CardTitle>
              <CardDescription className="text-xs">Configure API access for plugin management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
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

              {/* S3 설정 토글 버튼 */}
              <div className="mt-6 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowS3Settings(!showS3Settings)}
                  className="flex w-full items-center justify-between text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  <span>S3 Storage Options</span>
                  {showS3Settings ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* S3 설정 폼 (토글 상태에 따라 표시/숨김) */}
              {showS3Settings && (
                <div className="mt-2 rounded-md bg-gray-50 p-3 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="accessKey" className="text-xs">Access Key</Label>
                      <Input
                        id="accessKey"
                        value={settings.accessKey}
                        onChange={(e) => handleInputChange('accessKey', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="secretKey" className="text-xs">Secret Key</Label>
                      <Input
                        id="secretKey"
                        value={settings.secretKey}
                        onChange={(e) => handleInputChange('secretKey', e.target.value)}
                        className="h-8 text-xs"
                        type="password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="region" className="text-xs">Region</Label>
                      <Input
                        id="region"
                        value={settings.region}
                        onChange={(e) => handleInputChange('region', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="e.g. ap-northeast-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="s3Bucket" className="text-xs">S3 Bucket Name</Label>
                      <Input
                        id="s3Bucket"
                        value={settings.s3Bucket}
                        onChange={(e) => handleInputChange('s3Bucket', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Label htmlFor="endpointUrl" className="text-xs">S3 Endpoint URL (Optional)</Label>
                      <Input
                        id="endpointUrl"
                        value={settings.endpointUrl}
                        onChange={(e) => handleInputChange('endpointUrl', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="e.g. https://s3.ap-northeast-2.amazonaws.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">For custom S3-compatible storage or specific region endpoint.</p>
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Label htmlFor="cdnUrl" className="text-xs">CDN</Label>
                      <Input
                        id="cdnUrl"
                        value={settings.cdnUrl}
                        onChange={(e) => handleInputChange('cdnUrl', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="e.g. https://cdn.example.com"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Content delivery network URL for asset loading.</p>
                    </div>
                  </div>
                </div>
              )}

            </CardContent>
            <CardFooter className="flex justify-end">
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
            </CardFooter>
          </Card>
        </div>
      </ScrollArea>

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
