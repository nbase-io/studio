import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function Settings(): JSX.Element {
  const [settings, setSettings] = useState({
    accessKey: '',
    secretKey: '',
    region: 'ap-northeast-2',
    bucketName: ''
  })

  const handleInputChange = (key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const saveSettings = () => {
    // 실제로는 여기에 API 호출이나 저장 로직이 들어갈 수 있습니다
    console.log('Settings saved:', settings)
    alert('설정이 저장되었습니다.')
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">환경 설정</h1>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>AWS S3 설정</CardTitle>
          <CardDescription>S3 버킷에 접근하기 위한 자격 증명 정보를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accessKey">액세스 키 ID</Label>
            <Input
              id="accessKey"
              value={settings.accessKey}
              onChange={(e) => handleInputChange('accessKey', e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretKey">시크릿 액세스 키</Label>
            <Input
              id="secretKey"
              type="password"
              value={settings.secretKey}
              onChange={(e) => handleInputChange('secretKey', e.target.value)}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">리전</Label>
            <Input
              id="region"
              value={settings.region}
              onChange={(e) => handleInputChange('region', e.target.value)}
              placeholder="ap-northeast-2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucketName">버킷 이름</Label>
            <Input
              id="bucketName"
              value={settings.bucketName}
              onChange={(e) => handleInputChange('bucketName', e.target.value)}
              placeholder="my-game-launcher-bucket"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={saveSettings} className="w-full">설정 저장</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default Settings
