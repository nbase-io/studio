import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

type UpdateStatus = {
  status: 'checking' | 'downloading' | 'no-update' | 'error';
  progress?: number;
  error?: string;
};

export const UpdateNotification: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    // 업데이트 상태 이벤트 리스너 등록
    const handleUpdateStatus = (_: any, status: UpdateStatus) => {
      console.log('Update status received:', status);
      setUpdateStatus(status);

      // 오류가 발생하거나 다운로드 중일 때 대화 상자 표시
      if (status.status === 'error' || status.status === 'downloading') {
        setShowDialog(true);
      }
    };

    window.api.on('update-status', handleUpdateStatus);

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      window.api.off('update-status', handleUpdateStatus);
    };
  }, []);

  // 수동으로 업데이트 체크 요청
  const checkForUpdates = () => {
    window.api.checkForUpdates();
    setUpdateStatus({ status: 'checking' });
  };

  if (!updateStatus) return null;

  return (
    <>
      {/* 다운로드 진행 상태나 오류를 보여주는 대화 상자 */}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {updateStatus.status === 'downloading'
                ? 'Downloading Update'
                : updateStatus.status === 'error'
                  ? 'Update Error'
                  : 'Update Status'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {updateStatus.status === 'downloading' && (
                <div className="space-y-4">
                  <p>Downloading the latest version of the application...</p>
                  <Progress value={updateStatus.progress || 0} className="h-2" />
                  <p className="text-sm text-right">{Math.round(updateStatus.progress || 0)}%</p>
                </div>
              )}

              {updateStatus.status === 'error' && (
                <p>An error occurred while checking for updates: {updateStatus.error}</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {updateStatus.status === 'error' && (
              <AlertDialogAction onClick={checkForUpdates}>Try Again</AlertDialogAction>
            )}
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UpdateNotification;
