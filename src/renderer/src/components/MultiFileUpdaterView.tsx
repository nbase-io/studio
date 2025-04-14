import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Checkbox,
  CheckboxChecked,
  CheckboxItem
} from '@/components/ui/checkbox'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import UpdateService, {
  UpdateInfo,
  UpdateProgress,
  UpdateFile,
  DownloadedFile
} from '@/lib/updateService'

interface MultiFileUpdaterViewProps {
  updateUrl: string;
  onUpdateComplete?: () => void;
  onClose?: () => void;
}

export function MultiFileUpdaterView({
  updateUrl,
  onUpdateComplete,
  onClose
}: MultiFileUpdaterViewProps): JSX.Element {
  const [updateService] = useState(() => new UpdateService(updateUrl));
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 파일별 진행 상황
  const [fileProgresses, setFileProgresses] = useState<Record<string, UpdateProgress>>({});
  // 선택된 선택적 파일
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  // 다운로드 완료된 파일
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFile[]>([]);
  // 전체 진행 현황
  const [overallProgress, setOverallProgress] = useState(0);

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

      if (result.hasUpdate) {
        // 필수 파일 ID 자동 선택
        if (result.updateInfo) {
          const requiredFileIds = result.updateInfo.files
            .filter(file => file.required)
            .map(file => file.id);
          setSelectedFiles(requiredFileIds);
        }

        // 필수 업데이트인 경우 자동으로 다운로드 시작
        if (result.updateInfo?.mandatory) {
          startDownload();
        } else {
          // 선택적 업데이트인 경우 사용자에게 알림
          setShowDialog(true);
        }
      }
    } catch (error) {
      setErrorMessage('업데이트 확인 중 오류가 발생했습니다.');
      console.error('업데이트 확인 오류:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleFileSelection = (fileId: string, isSelected: boolean): void => {
    if (isSelected) {
      setSelectedFiles(prev => [...prev, fileId]);
    } else {
      setSelectedFiles(prev => prev.filter(id => id !== fileId));
    }
  };

  const startDownload = async (): Promise<void> => {
    if (!updateInfo) return;

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      // 초기 진행 상황 설정
      const initialProgresses: Record<string, UpdateProgress> = {};
      updateInfo.files.forEach(file => {
        initialProgresses[file.id] = {
          fileId: file.id,
          fileName: file.name,
          downloaded: 0,
          total: file.size,
          percent: 0,
          bytesPerSecond: 0,
          remaining: 0
        };
      });
      setFileProgresses(initialProgresses);

      // 선택된 파일만 다운로드 (필수 파일은 자동 포함)
      const downloaded = await updateService.downloadSelectedUpdates(
        selectedFiles,
        (progress) => {
          if (progress.fileId) {
            // 파일별 진행 상황 업데이트
            setFileProgresses(prev => ({
              ...prev,
              [progress.fileId]: progress
            }));

            // 전체 진행 상황 업데이트
            if (progress.overall !== undefined) {
              setOverallProgress(progress.overall);
            }
          }
        }
      );

      if (downloaded && downloaded.length > 0) {
        setDownloadedFiles(downloaded);
        processDownloadedFiles(downloaded);
      } else {
        setErrorMessage('업데이트 다운로드에 실패했습니다.');
        setIsDownloading(false);
      }
    } catch (error) {
      setErrorMessage('업데이트 다운로드 중 오류가 발생했습니다.');
      console.error('다운로드 오류:', error);
      setIsDownloading(false);
    }
  };

  const processDownloadedFiles = async (files: DownloadedFile[]): Promise<void> => {
    if (!updateInfo) return;

    setIsDownloading(false);
    setIsProcessing(true);

    try {
      for (const file of files) {
        const fileInfo = updateInfo.files.find(f => f.id === file.fileId);
        if (!fileInfo) continue;

        // 파일 유형에 따라 처리
        if (fileInfo.type === 'core') {
          // 코어 파일은 마지막에 설치
          continue;
        }

        // 리소스/컨텐츠 파일 처리
        // IPC를 통해 메인 프로세스의 파일 처리 요청
        // 실제 구현 시에는 IPC 통신 코드 추가
        console.log(`파일 처리 중: ${fileInfo.name} (${fileInfo.type})`);

        // 진행 상황 업데이트
        setFileProgresses(prev => ({
          ...prev,
          [file.fileId]: {
            ...prev[file.fileId],
            percent: 100,
            downloaded: prev[file.fileId].total
          }
        }));
      }

      setIsProcessing(false);

      // 코어 업데이트가 있는지 확인
      const hasCoreUpdate = files.some(file => {
        const fileInfo = updateInfo.files.find(f => f.id === file.fileId);
        return fileInfo && fileInfo.type === 'core';
      });

      if (hasCoreUpdate) {
        setIsInstalling(true);
      } else if (onUpdateComplete) {
        // 코어 업데이트가 없으면 완료 처리
        onUpdateComplete();
      }
    } catch (error) {
      setErrorMessage('업데이트 처리 중 오류가 발생했습니다.');
      console.error('처리 오류:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelDownload = (): void => {
    updateService.cancelDownload();
    setIsDownloading(false);
  };

  const installCoreUpdate = async (): Promise<void> => {
    if (!updateInfo || downloadedFiles.length === 0) return;

    try {
      // 코어 업데이트 파일 찾기
      const coreFile = downloadedFiles.find(file => {
        const fileInfo = updateInfo.files.find(f => f.id === file.fileId);
        return fileInfo && fileInfo.type === 'core';
      });

      if (!coreFile) {
        setErrorMessage('설치할 코어 업데이트 파일을 찾을 수 없습니다.');
        return;
      }

      // IPC를 통해 메인 프로세스에 설치 요청
      // 실제 구현 시에는 IPC 통신 코드 추가
      console.log(`코어 업데이트 설치 중: ${coreFile.filePath}`);

      // 설치 성공 시
      if (onUpdateComplete) {
        onUpdateComplete();
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

  const getFileTypeText = (type: string): string => {
    switch (type) {
      case 'core': return '핵심 파일';
      case 'resource': return '리소스';
      case 'content': return '컨텐츠';
      default: return '기타';
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

  if (isDownloading || isProcessing) {
    const isAllFilesDownloaded = isProcessing || downloadedFiles.length > 0;

    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full flex flex-col">
          <div
            className="w-full h-[200px] bg-cover bg-center border-b flex flex-col items-center justify-center"
            style={{
              backgroundImage: updateInfo?.bannerImage ? `url(${updateInfo.bannerImage})` : 'none',
              backgroundColor: !updateInfo?.bannerImage ? '#f3f4f6' : undefined
            }}
          >
            <div className="bg-black bg-opacity-50 text-white p-6 rounded-md">
              <h2 className="text-2xl font-bold mb-2">
                {isProcessing ? '업데이트 처리 중' : '업데이트 다운로드 중'}
              </h2>
              <p className="mb-2">버전 {updateInfo?.version}</p>
              <p>전체 진행 상황: {overallProgress}%</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>전체 진행 상황</span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2 mb-4" />
            </div>

            <Accordion type="single" collapsible defaultValue="files" className="w-full">
              <AccordionItem value="files">
                <AccordionTrigger>파일 진행 상황</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {updateInfo?.files.filter(file =>
                      selectedFiles.includes(file.id) || file.required
                    ).map(file => {
                      const progress = fileProgresses[file.id] || {
                        percent: 0,
                        downloaded: 0,
                        total: file.size,
                        remaining: 0,
                        bytesPerSecond: 0
                      };

                      const isDownloaded = downloadedFiles.some(df => df.fileId === file.id);

                      return (
                        <div key={file.id} className="border rounded-md p-3">
                          <div className="flex justify-between mb-1">
                            <div className="font-medium">{file.name}</div>
                            <div className="text-xs text-gray-500">
                              {getFileTypeText(file.type)}
                              {file.required && <span className="ml-1 text-red-500">(필수)</span>}
                            </div>
                          </div>

                          <div className="mb-2">
                            <Progress
                              value={isProcessing && isDownloaded ? 100 : progress.percent}
                              className="h-1.5"
                            />
                          </div>

                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{formatBytes(progress.downloaded)} / {formatBytes(file.size)}</span>
                            <span>
                              {isDownloaded ? '완료' : isProcessing ? '처리 중...' :
                                `남은 시간: ${formatTime(progress.remaining)}`
                              }
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="p-4 bg-white border-t">
            {!isAllFilesDownloaded && !isProcessing && (
              <Button
                variant="outline"
                onClick={cancelDownload}
                disabled={updateInfo?.mandatory}
                className="w-full"
              >
                {updateInfo?.mandatory ? '필수 업데이트입니다' : '취소'}
              </Button>
            )}

            {isProcessing && (
              <div className="text-center text-sm text-gray-600">
                업데이트 파일 처리 중입니다. 잠시만 기다려주세요...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isInstalling) {
    return (
      <Card className="w-[800px] h-[600px] border rounded-md shadow-md mx-auto overflow-hidden">
        <CardContent className="p-0 h-full flex flex-col">
          <div
            className="w-full h-[400px] bg-cover bg-center border-b flex flex-col items-center justify-center"
            style={{
              backgroundImage: updateInfo?.bannerImage ? `url(${updateInfo.bannerImage})` : 'none',
              backgroundColor: !updateInfo?.bannerImage ? '#f3f4f6' : undefined
            }}
          >
            <div className="bg-black bg-opacity-50 text-white p-6 rounded-md text-center">
              <h2 className="text-2xl font-bold mb-4">업데이트 준비 완료</h2>
              <p className="mb-4">버전 {updateInfo?.version}으로 업데이트할 준비가 되었습니다.</p>
              <p>앱을 재시작해야 합니다.</p>
            </div>
          </div>

          <div className="p-6 bg-white flex items-center justify-between flex-1">
            <p className="text-gray-600">
              지금 업데이트를 설치하고 앱을 재시작하시겠습니까?
            </p>
            <Button
              variant="default"
              onClick={installCoreUpdate}
              className="h-12 px-6 text-base font-semibold"
            >
              지금 설치하기
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
        <AlertDialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>새 업데이트가 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {updateInfo && (
                <div className="mt-2">
                  <p className="font-semibold">버전 {updateInfo.version}</p>
                  <p className="text-sm text-gray-500">출시일: {updateInfo.releaseDate}</p>

                  <div className="mt-4">
                    <p className="font-medium mb-2">업데이트 내용:</p>
                    <ul className="list-disc list-inside space-y-1 mb-4">
                      {updateInfo.releaseNotes.map((note, index) => (
                        <li key={index} className="text-sm">{note}</li>
                      ))}
                    </ul>

                    <div className="mt-4 mb-2 font-medium">다운로드할 파일 선택:</div>
                    <div className="overflow-y-auto max-h-64 space-y-2 border rounded-md p-2">
                      {updateInfo.files.map(file => {
                        const isRequired = file.required;
                        const isSelected = selectedFiles.includes(file.id);

                        return (
                          <div key={file.id} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded-md">
                            <Checkbox
                              id={`file-${file.id}`}
                              checked={isSelected}
                              disabled={isRequired}
                              onCheckedChange={(checked) => handleFileSelection(file.id, !!checked)}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={`file-${file.id}`}
                                className="flex flex-col cursor-pointer"
                              >
                                <span className="font-medium">{file.name}</span>
                                <span className="text-xs text-gray-500 flex justify-between">
                                  <span>{file.description}</span>
                                  <span className="ml-4">{formatBytes(file.size)}</span>
                                </span>
                              </label>
                            </div>
                            <div className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                              {getFileTypeText(file.type)}
                              {isRequired && <span className="ml-1 text-red-500">(필수)</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 text-right text-sm text-gray-500">
                      총 다운로드 크기: {formatBytes(
                        updateInfo.files
                          .filter(file => file.required || selectedFiles.includes(file.id))
                          .reduce((total, file) => total + file.size, 0)
                      )}
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>나중에</AlertDialogCancel>
            <AlertDialogAction
              onClick={startDownload}
              disabled={selectedFiles.length === 0}
            >
              업데이트
            </AlertDialogAction>
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
              <h2 className="text-2xl font-bold mb-4">
                {hasUpdate ? '새 업데이트가 있습니다' : '최신 버전을 사용 중입니다'}
              </h2>
              <p className="text-gray-600">현재 버전: {updateService['currentVersion']}</p>
              {hasUpdate && updateInfo && (
                <div className="mt-4">
                  <p className="text-gray-600">새 버전: {updateInfo.version}</p>
                  <p className="text-gray-500 text-sm">출시일: {updateInfo.releaseDate}</p>
                </div>
              )}
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
              onClick={hasUpdate ? () => setShowDialog(true) : checkForUpdates}
              className="h-12 px-6 text-base font-semibold"
            >
              {hasUpdate ? '업데이트 보기' : '업데이트 확인'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
