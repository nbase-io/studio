import React from 'react';
import { Folder, File, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { S3Object } from './FolderTreeView';

interface FileListViewProps {
  loading: boolean;
  currentPath: string;
  files: S3Object[];
  folders: string[];
  selectedFile: S3Object | null;
  viewMode: 'list' | 'grid';
  onFileClick: (file: S3Object) => void;
  onFolderClick: (folder: string) => void;
}

const FileListView: React.FC<FileListViewProps> = ({
  loading,
  currentPath,
  files,
  folders,
  selectedFile,
  viewMode,
  onFileClick,
  onFolderClick
}) => {
  // 파일 크기 포맷 함수
  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined) return '-';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // 날짜 포맷 함수
  const formatDate = (date?: Date): string => {
    if (!date) return '-';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 파일 확장자 추출
  const getFileExtension = (filename: string): string => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  };

  // 파일 타입별 아이콘 색상
  const getFileIconColor = (filename: string): string => {
    const ext = getFileExtension(filename).toLowerCase();
    switch (ext) {
      case 'pdf': return 'text-red-500';
      case 'doc': case 'docx': return 'text-blue-600';
      case 'xls': case 'xlsx': return 'text-green-600';
      case 'ppt': case 'pptx': return 'text-orange-500';
      case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg': return 'text-pink-500';
      case 'mp3': case 'wav': case 'ogg': return 'text-purple-500';
      case 'mp4': case 'avi': case 'mov': return 'text-indigo-500';
      case 'zip': case 'rar': case '7z': return 'text-yellow-600';
      default: return 'text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 bg-white shadow-sm border-b p-3 flex items-center">
        <Folder className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
        <span className="text-xs font-medium tracking-tight">
          {currentPath || 'Root'}
        </span>
      </div>

      <div className="p-3">
        {files.length === 0 && folders.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">This folder is empty</p>
            <p className="text-xs text-gray-400 mt-2">Upload files or create new ones</p>
          </div>
        ) : (
          <>
            {viewMode === 'list' ? (
              <div className="space-y-1">
                {folders.map((folder) => {
                  // 폴더 이름만 추출 (경로의 마지막 부분)
                  const folderName = folder.split('/').filter(part => part.trim() !== '').pop() || folder;

                  return (
                    <Card
                      key={folder}
                      className="hover:bg-gray-50 cursor-pointer border border-gray-200 transition-all duration-150 hover:shadow-sm"
                      onClick={() => onFolderClick(folder)}
                    >
                      <CardContent className="p-2 flex items-center justify-between">
                        <div className="flex items-center min-w-0 flex-1 mr-2">
                          <Folder className="h-3.5 w-3.5 mr-1.5 text-blue-500 flex-shrink-0" />
                          <span className="text-xs tracking-tight truncate w-full">{folderName}</span>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">Folder</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {files.map((file) => (
                  <Card
                    key={file.key}
                    className={cn(
                      "cursor-pointer border border-gray-200 transition-all duration-150 hover:shadow-sm",
                      selectedFile?.key === file.key
                        ? "bg-blue-50 border-blue-200"
                        : "hover:bg-gray-50"
                    )}
                    onClick={() => onFileClick(file)}
                  >
                    <CardContent className="p-2 flex items-center justify-between">
                      <div className="flex items-center min-w-0 flex-1 mr-2">
                        <File className={cn("h-3.5 w-3.5 mr-1.5 flex-shrink-0", getFileIconColor(file.key))} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs tracking-tight truncate">{file.key.split('/').pop()}</div>
                          {file.lastModified && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {formatDate(file.lastModified)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium flex-shrink-0">
                        {formatFileSize(file.size)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {folders.map((folder) => {
                  // 폴더 이름만 추출 (경로의 마지막 부분)
                  const folderName = folder.split('/').filter(part => part.trim() !== '').pop() || folder;

                  return (
                    <Card
                      key={folder}
                      className="hover:bg-gray-50 cursor-pointer border border-gray-200 transition-all duration-150 hover:shadow-sm flex flex-col items-center p-2"
                      onClick={() => onFolderClick(folder)}
                    >
                      <Folder className="h-9 w-9 text-blue-500 mb-1 flex-shrink-0" />
                      <span className="text-[10px] text-center truncate w-full font-medium overflow-visible">{folderName}</span>
                    </Card>
                  );
                })}

                {files.map((file) => (
                  <Card
                    key={file.key}
                    className={cn(
                      "cursor-pointer border border-gray-200 transition-all duration-150 hover:shadow-sm flex flex-col items-center p-2",
                      selectedFile?.key === file.key
                        ? "bg-blue-50 border-blue-200"
                        : "hover:bg-gray-50"
                    )}
                    onClick={() => onFileClick(file)}
                  >
                    <File className={cn("h-9 w-9 mb-1", getFileIconColor(file.key))} />
                    <span className="text-[10px] text-center truncate w-full font-medium">{file.key.split('/').pop()}</span>
                    <span className="text-[9px] text-gray-500 mt-1">{formatFileSize(file.size)}</span>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FileListView;
