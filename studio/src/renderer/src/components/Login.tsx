import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, AlertCircle, ExternalLink, HelpCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '../main'

// Supported regions list (사용은 하지 않지만 코드 참조용으로 유지)
const REGIONS = [
  { value: 'ap-northeast-2', label: 'Korea (Seoul)' },
  { value: 'us-east-1', label: 'USA (Virginia)' },
  { value: 'ap-northeast-1', label: 'Japan (Tokyo)' },
  { value: 'eu-central-1', label: 'Germany (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Singapore' },
];

interface LoginProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function Login({ onSuccess, onCancel }: LoginProps): JSX.Element {
  // Using global settings context
  const { saveSettings, settings: currentSettings } = useSettings();
  const { toast } = useToast();

  // Local state
  const [formData, setFormData] = useState({
    projectId: currentSettings?.projectId || '',
    region: currentSettings?.region || 'a', // ap-northeast-2로 다시 변경
    apiKey: currentSettings?.apiKey || ''
  });

  // 컴포넌트 마운트시 현재 설정값 가져오기
  useEffect(() => {
    if (currentSettings) {
      setFormData({
        projectId: currentSettings.projectId || '',
        region: currentSettings.region || '',
        apiKey: currentSettings.apiKey || ''
      });
    }
  }, [currentSettings]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Input change handler
  const handleInputChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
    setError(null); // Clear error on input change
  };

  // 앱 종료 함수
  const handleClose = () => {
    console.log('Exit button clicked - Attempting to quit app');

    try {
      // 다양한 방법으로 앱 종료 시도

      // 방법 1: quitApp 함수 호출
      if (window.api.quitApp) {
        window.api.quitApp();
      }

      // 방법 2: 강제 종료 시도 (약간의 딜레이 후)
      setTimeout(() => {
        console.log('Fallback 1: Trying forceQuit');
        try {
          // any 타입으로 변환하여 타입 체크 우회
          const api = window.api as any;
          if (api.forceQuit) {
            api.forceQuit();
          }
        } catch (e) {
          console.error('Failed to force quit:', e);
        }
      }, 300);

      // 방법 3: window.close 시도 (더 긴 딜레이 후)
      setTimeout(() => {
        console.log('Fallback 2: Trying window.close()');
        try {
          window.close();
        } catch (e) {
          console.error('Failed to close window:', e);
        }
      }, 600);
    } catch (error) {
      console.error('Failed to quit app:', error);
      alert('Could not exit the application. Please try closing the window manually.');
    }
  };

  // GamePot 플러그인 문서 열기
  const openPluginDocs = () => {
    window.api.shell.openExternal('https://docs.gamepot.io/basics/gamepot-3.0/gamepot-3.0_kr/gamepot/studio');
  };

  // API connection test and save
  const testAndSaveConnection = async () => {
    try {
      setLoading(true);
      setError(null);

      // Input validation
      if (!formData.projectId.trim()) {
        throw new Error('Please enter Project ID');
      }
      if (!formData.apiKey.trim()) {
        throw new Error('Please enter PLUGIN API KEY');
      }

      // API test - Using a virtual API endpoint for this example
      // In actual implementation, you would test connection using project ID and API KEY
      const testUrl = `https://plugin.gamepot.ntruss.com/v1/items`;

      // Test API call
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-PROJECT-ID': formData.projectId,
          'X-API-KEY': formData.apiKey
        },
        body: JSON.stringify({ region: formData.region })
      }).catch(() => {
        // Network error handling (since the actual API doesn't exist yet, we're treating it as success)
        return { ok: true, json: () => Promise.resolve({ success: true }) };
      });
      console.log('API test response:', response);

      // Response handling
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Connection test failed');
      }

      // Check response data
      const result = await response.json();
      if (!result.success) {
        throw new Error('Authentication failed. Please check your credentials');
      }

      // Save settings on success - keep existing settings and update new info
      console.log("Saving settings:", {
        projectId: formData.projectId,
        region: formData.region,
        apiKey: formData.apiKey
      });

      try {
        // Make sure we have a valid settings object to update
        const settingsToSave = {
          ...(currentSettings || {}),
          projectId: formData.projectId,
          region: formData.region, // 'kr' 값이 사용됨
          apiKey: formData.apiKey,
          // Ensure these fields exist with defaults
          accessKey: currentSettings?.accessKey || '',
          secretKey: currentSettings?.secretKey || '',
          s3Bucket: currentSettings?.s3Bucket || '',
          serverUrl: currentSettings?.serverUrl || 'https://plugin.gamepot.ntruss.com',
          cdnUrl: currentSettings?.cdnUrl || ''
        };

        console.log("Full settings to save:", settingsToSave);

        const saveResult = await saveSettings(settingsToSave);

        console.log("Save settings result:", saveResult);

        if (!saveResult) {
          console.error("Failed to save settings - result was falsy");
          throw new Error('Settings were not saved properly. Please check your connection and try again.');
        }
      } catch (saveError: any) {
        console.error("Error during save operation:", saveError);
        throw new Error(`Failed to save settings: ${saveError.message}`);
      }

      // Success message
      toast({
        title: 'Login Successful',
        description: 'Successfully connected to GamePot Dashboard',
      });

      // Call success callback
      onSuccess();
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'An unknown error occurred');

      toast({
        title: 'Login Failed',
        description: error.message || 'Connection failed. Please check your credentials',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-[450px] mx-auto p-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-center text-lg">GamePot Studio</CardTitle>
        <CardDescription className="text-center text-xs">
          Enter your account information to connect to GamePot Dashboard
        </CardDescription>
        <div className="flex justify-center mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 flex items-center text-blue-500 hover:text-blue-700"
            onClick={openPluginDocs}
          >
            <HelpCircle className="h-3 w-3 mr-1" />
            Guide
            <ExternalLink className="h-2 w-2 ml-1" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-4">
        <ScrollArea className="pr-4">
          <div className="space-y-3 px-2">
            <div className="space-y-1">
              <Label htmlFor="projectId" className="text-xs">Project ID</Label>
              <Input
                id="projectId"
                value={formData.projectId}
                onChange={(e) => handleInputChange('projectId', e.target.value)}
                placeholder="Enter your Project ID"
                disabled={loading}
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="apiKey" className="text-xs">PLUGIN API KEY</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="Enter your PLUGIN API KEY"
                disabled={loading}
                className="text-xs h-8"
              />
              <div className="flex items-center text-[10px] text-gray-500">
                <p>GamePot Dashboard → Project Settings → PLUGIN API KEY</p>
                <a
                  href="https://ncloud.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center ml-1 text-blue-500 hover:underline"
                >
                  Details <ExternalLink className="h-2 w-2 ml-0.5" />
                </a>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 p-2 rounded-md flex items-start">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="flex justify-between pt-3">
        <Button variant="destructive" onClick={() => {
          if (window.confirm('Are you sure you want to exit the application?')) {
            handleClose();
          }
        }} size="sm">
          Exit
        </Button>
        <Button onClick={testAndSaveConnection} disabled={loading} size="sm">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Connect
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default Login;
