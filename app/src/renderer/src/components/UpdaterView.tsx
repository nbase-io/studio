import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle } from '@/components/ui/alert-dialog'
import UpdateService, { UpdateInfo, UpdateProgress } from '@/lib/updateService'

interface UpdaterViewProps {
  updateUrl: string;
  onUpdateComplete?: () => void;
  onClose?: () => void;
}

export function UpdaterView({
  updateUrl,
  onUpdateComplete,
  onClose
}: UpdaterViewProps): JSX.Element {
  const [updateService] = useState(() => new UpdateService(updateUrl));
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>({
    downloaded: 0,
    total: 0,
    percent: 0,
    bytesPerSecond: 0,
    remaining: 0
  });
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 앱 시작 시 자동 업데이트 확인
  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async (): Promise<void> => {
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const result = await updateService.checkForUpdates();
      setHasUpdate(result.hasUpdate);
      setUpdateInfo(result.updateInfo);

      if (result.hasUpdate && result.updateInfo?.mandatory) {
        // 필수 업데이트인 경우 자동으로 다운로드 시작
        startDownload();
      } else if (result.hasUpdate) {
        // 선택적 업데이트인 경우 사용자에게 알림
        setShowDialog(true);
      }
    } catch (error) {
      setErrorMessage('업데이트 확인 중 오류가 발생했습니다.');
      console.error('업데이트 확인 오류:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const startDownload = async (): Promise<void> => {
    setIsDownloading(true);
    setErrorMessage(null);

    try {
      const path = await updateService.downloadUpdate((progress) => {
        setUpdateProgress(progress);
      });

      if (path) {
        setDownloadedPath(path);
      } else {
        setErrorMessage('업데이트 다운로드에 실패했습니다.');
      }
    } catch (error) {
      setErrorMessage('업데이트 다운로드 중 오류가 발생했습니다.');
      console.error('다운로드 오류:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const cancelDownload = (): void => {
    updateService.cancelDownload();
    setIsDownloading(false);
  };

  const installUpdate = async (): Promise<void> => {
    if (!downloadedPath) {
      setErrorMessage('설치할 업데이트 파일이 없습니다.');
      return;
    }

    setIsInstalling(true);
    setErrorMessage(null);

    try {
      const success = await updateService.installUpdate(downloadedPath);
      if (success) {
        if (onUpdateComplete) {
          onUpdateComplete();
        }
      } else {
        setErrorMessage('업데이트 설치에 실패했습니다.');
      }
    } catch (error) {
      setErrorMessage('업데이트 설치 중 오류가 발생했습니다.');
      console.error('설치 오류:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity) return '계산 중...';

    if (seconds < 60) {
      return `${Math.round(seconds)}초`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}분 ${Math.round(seconds % 60)}초`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}시간 ${minutes}분`;
    }
  };

  if (isChecking) {
    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full flex flex-col items-center justify-center">
          <div className="text-center p-8">
            <h2 className="text-xl font-semibold mb-4">업데이트 확인 중...</h2>
            <Progress value={100} className="h-2 w-64" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isDownloading) {
    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full">
          <div
            className="w-full h-[480px] bg-cover bg-center border-b flex flex-col items-center justify-center"
            style={{
              backgroundImage: updateInfo?.bannerImage ? `url(${updateInfo.bannerImage})` : 'none',
              backgroundColor: !updateInfo?.bannerImage ? '#f3f4f6' : undefined
            }}
          >
            <div className="bg-black bg-opacity-50 text-white p-6 rounded-md">
              <h2 className="text-2xl font-bold mb-2">업데이트 다운로드 중</h2>
              <p className="mb-4">버전 {updateInfo?.version}</p>
              <ul className="list-disc list-inside mb-4">
                {updateInfo?.releaseNotes?.slice(0, 3).map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="p-4 bg-white flex flex-col justify-between h-[120px]">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{formatBytes(updateProgress.downloaded)} / {formatBytes(updateProgress.total)}</span>
                <span>남은 시간: {formatTime(updateProgress.remaining)}</span>
              </div>
              <Progress value={updateProgress.percent} className="h-2" />
              <div className="flex justify-between text-xs text-gray-500">
                <span>다운로드 속도: {formatBytes(updateProgress.bytesPerSecond)}/s</span>
                <span>{updateProgress.percent}%</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={cancelDownload}
                disabled={updateInfo?.mandatory}
                className="mr-2"
              >
                {updateInfo?.mandatory ? '필수 업데이트' : '취소'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (downloadedPath) {
    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full">
          <div
            className="w-full h-[480px] bg-cover bg-center border-b flex flex-col items-center justify-center"
            style={{
              backgroundImage: updateInfo?.bannerImage ? `url(${updateInfo.bannerImage})` : 'none',
              backgroundColor: !updateInfo?.bannerImage ? '#f3f4f6' : undefined
            }}
          >
            <div className="bg-black bg-opacity-50 text-white p-6 rounded-md text-center">
              <h2 className="text-2xl font-bold mb-2">업데이트 준비 완료</h2>
              <p className="mb-4">버전 {updateInfo?.version}으로 업데이트할 준비가 되었습니다.</p>
              <p>앱을 재시작해야 합니다.</p>
            </div>
          </div>
          <div className="p-4 bg-white flex items-center justify-between h-[120px]">
            <p className="text-gray-600">
              지금 업데이트를 설치하고 앱을 재시작하시겠습니까?
            </p>
            <Button
              variant="default"
              onClick={installUpdate}
              disabled={isInstalling}
              className="h-12 px-6 text-base font-semibold"
            >
              {isInstalling ? '설치 중...' : '지금 설치하기'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full flex flex-col items-center justify-center">
          <div className="text-center p-8">
            <h2 className="text-xl font-semibold text-red-500 mb-4">오류 발생</h2>
            <p className="mb-6">{errorMessage}</p>
            <div className="flex justify-center space-x-4">
              <Button variant="outline" onClick={onClose}>닫기</Button>
              <Button variant="default" onClick={checkForUpdates}>다시 시도</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>새 업데이트가 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {updateInfo && (
                <div className="mt-2">
                  <p className="font-semibold">버전 {updateInfo.version}</p>
                  <p className="text-sm text-gray-500">출시일: {updateInfo.releaseDate}</p>

                  <div className="mt-4">
                    <p className="font-medium mb-2">업데이트 내용:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {updateInfo.releaseNotes.map((note, index) => (
                        <li key={index} className="text-sm">{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>나중에</AlertDialogCancel>
            <AlertDialogAction onClick={startDownload}>업데이트</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full">
          <div
            className="w-full h-[480px] bg-cover bg-center border-b flex flex-col items-center justify-center"
            style={{ backgroundColor: '#f3f4f6' }}
          >
            <div className="text-center p-8">
              <h2 className="text-2xl font-bold mb-4">최신 버전을 사용 중입니다</h2>
              <p className="text-gray-600">현재 버전: {updateService['currentVersion']}</p>
            </div>
          </div>
          <div className="p-4 bg-white flex items-center justify-between h-[120px]">
            <Button
              variant="outline"
              onClick={onClose}
            >
              닫기
            </Button>
            <Button
              variant="default"
              onClick={checkForUpdates}
              className="h-12 px-6 text-base font-semibold"
            >
              업데이트 확인
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
