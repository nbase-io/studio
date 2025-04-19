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
    // Register update status event listener
    const handleUpdateStatus = (_: any, status: UpdateStatus) => {
      console.log('Update status received:', status);
      setUpdateStatus(status);

      // Show dialog when error occurs or during download
      if (status.status === 'error' || status.status === 'downloading') {
        setShowDialog(true);
      }
    };

    window.api.on('update-status', handleUpdateStatus);

    // Remove listener when component unmounts
    return () => {
      window.api.off('update-status', handleUpdateStatus);
    };
  }, []);

  // Request manual update check
  const checkForUpdates = () => {
    window.api.checkForUpdates();
    setUpdateStatus({ status: 'checking' });
  };

  if (!updateStatus) return null;

  return (
    <>
      {/* Dialog showing download progress or error */}
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
