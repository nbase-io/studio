import React, { useState } from 'react';
import { FolderDown, RefreshCw, Upload, List, Grid, Download, Clock, Gauge, FolderPlus,  FolderUp, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FileToolbarProps {
  currentPath: string;
  uploading: boolean;
  uploadProgress: number;
  selectedFile: any | null;
  selectedFiles?: any[];
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  onNavigateUp: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onDelete: () => void;
  onRename?: (file: any) => void;
  onDownload?: (file: any) => void;
  onCreateFolder?: () => void;
}

// 다운로드 상태 인터페이스
interface DownloadStatus {
  id: string;
  name: string;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  size: number;
  speed: number; // bytes per second
  timeRemaining: number; // seconds
  errorMessage?: string;
}

const FileToolbar: React.FC<FileToolbarProps> = ({
  currentPath,
  uploading,
  uploadProgress,
  selectedFile,
  selectedFiles = [],
  viewMode,
  onViewModeChange,
  onNavigateUp,
  onRefresh,
  onUpload,
  onDelete,
  onRename,
  onDownload,
  onCreateFolder
}) => {
  // 다운로드 다이얼로그 상태
  const [downloadDialogOpen, setDownloadDialogOpen] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null);

  // 다운로드 핸들러
  const handleDownload = () => {
    // 다중 선택된 파일이 있으면 첫 번째 파일 다운로드 (실제로는 다중 다운로드 구현 필요)
    const fileToDownload = selectedFiles.length > 0 ? selectedFiles[0] : selectedFile;

    if (!fileToDownload || !onDownload) return;

    // 다이얼로그 열기
    setDownloadDialogOpen(true);
    setIsDownloading(true);

    // 초기 다운로드 상태 설정
    setDownloadStatus({
      id: Math.random().toString(36).substring(2, 11),
      name: fileToDownload.key.split('/').pop(),
      progress: 0,
      status: 'downloading',
      size: fileToDownload.size || 0,
      speed: 0,
      timeRemaining: 0
    });

    // 실제 다운로드 시작 (이 예제에서는 시뮬레이션)
    simulateDownload();

    // 실제 구현에서는 이 부분에서 onDownload 콜백 호출
    if (onDownload) {
      onDownload(fileToDownload);
    }
  };

  // 다운로드 시뮬레이션 함수 (실제 구현에서는 제거하고 실제 다운로드 로직으로 대체)
  const simulateDownload = () => {
    let progress = 0;
    let speed = Math.random() * 500000 + 500000; // 500KB ~ 1MB/s

    const interval = setInterval(() => {
      progress += Math.random() * 5;

      if (progress > 100) {
        progress = 100;
        clearInterval(interval);

        setTimeout(() => {
          setDownloadStatus(prev => {
            if (!prev) return null;
            return {
              ...prev,
              progress: 100,
              status: 'completed',
              speed: 0,
              timeRemaining: 0
            };
          });
          setIsDownloading(false);
        }, 500);

        return;
      }

      // 속도는 시간이 지남에 따라 약간 변동
      speed = Math.max(100000, speed + (Math.random() * 100000 - 50000));

      // 남은 시간 계산
      const size = downloadStatus?.size || 1;
      const downloaded = size * (progress / 100);
      const remaining = size - downloaded;
      const timeRemaining = remaining / speed;

      setDownloadStatus(prev => {
        if (!prev) return null;
        return {
          ...prev,
          progress,
          speed,
          timeRemaining
        };
      });
    }, 500);
  };

  // 다운로드 취소 핸들러
  const handleCancelDownload = () => {
    setIsDownloading(false);
    setDownloadDialogOpen(false);
    setDownloadStatus(null);
  };

  // 다운로드 다이얼로그 닫기 핸들러
  const handleCloseDownloadDialog = () => {
    if (isDownloading) {
      // 다운로드 중일 때는 확인 후 닫기
      if (window.confirm('Download is in progress. Are you sure you want to cancel?')) {
        handleCancelDownload();
      }
    } else {
      setDownloadDialogOpen(false);
      setDownloadStatus(null);
    }
  };

  // 시간 포맷 함수
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity) return '--:--';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 속도 포맷 함수
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond.toFixed(1)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
  };

  return (
    <div className="bg-white white:bg-gray-900 border-b border-gray-200 white:border-gray-800">
      <div className="p-2 flex justify-between items-center bg-white white:bg-gray-900">
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 hover:bg-blue-50 white:hover:bg-gray-800"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2 text-blue-500 white:text-blue-400" />
            <span className="text-xs">Refresh</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-blue-50 white:hover:bg-gray-800"
            onClick={onNavigateUp}
            title="Parent Folder"
          >
            <FolderUp className="h-3.5 w-3.5 text-blue-500 white:text-blue-400" />
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-blue-50 white:hover:bg-gray-800"
            onClick={() => onViewModeChange('list')}
            title="List View"
          >
            <List className={cn("h-3.5 w-3.5", viewMode === 'list' ? 'text-blue-600' : 'text-gray-500')} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-blue-50 white:hover:bg-gray-800"
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
          >
            <Grid className={cn("h-3.5 w-3.5", viewMode === 'grid' ? 'text-blue-600' : 'text-gray-500')} />
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 bg-blue-500 hover:bg-blue-600 text-white"
            onClick={onUpload}
            disabled={uploading}
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            <span className="text-xs">Upload</span>
          </Button>

          {/* 새폴더 생성 버튼 */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 white:text-blue-400"
            onClick={onCreateFolder}
            disabled={!onCreateFolder}
          >
            <FolderPlus className="h-3.5 w-3.5 mr-1" />
            <span className="text-[8px]">New</span>
          </Button>

          {/* 이름 변경 버튼 */}
          <Button
            variant="outline"
            size="icon"
            onClick={onRename}
            disabled={!selectedFile && selectedFiles.length === 0}
            title="Rename"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {/* 다운로드 버튼 */}
          <Button
            variant="outline"
            size="icon"
            onClick={onDownload}
            disabled={!selectedFile && selectedFiles.length === 0}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* 삭제 버튼 */}
          <Button
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={!selectedFile && selectedFiles.length === 0}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="p-2 bg-white white:bg-gray-900 border-b">
          <div className="flex items-center">
            <div className="w-full bg-gray-100 white:bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="ml-2 text-xs font-medium text-gray-700 white:text-gray-300">{uploadProgress}%</span>
          </div>
        </div>
      )}

      {/* 다운로드 다이얼로그 */}
      <Dialog open={downloadDialogOpen} onOpenChange={handleCloseDownloadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Downloading File</DialogTitle>
            <DialogDescription>
              {isDownloading
                ? "File is being downloaded. Please don't close this dialog."
                : "Download completed successfully."}
            </DialogDescription>
          </DialogHeader>

          {downloadStatus && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">{downloadStatus.name}</h3>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{Math.round(downloadStatus.progress)}%</span>
                    <span>{(downloadStatus.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>

                  <Progress value={downloadStatus.progress} className="h-2" />

                  <div className="flex justify-between text-xs">
                    <div className="flex items-center text-gray-500">
                      <Gauge className="h-3 w-3 mr-1" />
                      <span>{formatSpeed(downloadStatus.speed)}</span>
                    </div>

                    <div className="flex items-center text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>
                        {downloadStatus.status === 'downloading'
                          ? `${formatTime(downloadStatus.timeRemaining)} remaining`
                          : downloadStatus.status === 'completed'
                            ? 'Completed'
                            : 'Error'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              {isDownloading && (
                <Button variant="outline" onClick={handleCancelDownload}>
                  Cancel Download
                </Button>
              )}
            </div>
            <Button
              type="button"
              disabled={isDownloading}
              onClick={handleCloseDownloadDialog}
            >
              {isDownloading ? "Downloading..." : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileToolbar;
