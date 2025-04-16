import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  File,
  Loader2,
  ChevronUp,
  ChevronDown,
  Circle,
  ArrowUp,
  FileText,
  Image,
  Music,
  Video,
  Code,
  FileType,
  Archive,
  Table,
  PenTool,
  FolderOpen
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { S3Object } from './FolderTreeView';
import { Button } from '@/components/ui/button';
import { Checkbox } from './ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// 정렬 가능한 필드 타입
type SortField = 'name' | 'size' | 'lastModified';
type SortDirection = 'asc' | 'desc';

// 체크박스 컴포넌트
const SmallCheckbox = React.forwardRef<
  React.ElementRef<typeof Checkbox>,
  React.ComponentPropsWithoutRef<typeof Checkbox>
>((props, ref) => (
  <Checkbox
    ref={ref}
    className="h-4 w-4"
    {...props}
  />
));

interface FileListViewProps {
  loading: boolean;
  currentPath: string;
  files: S3Object[];
  folders: string[];
  selectedFile: S3Object | null;
  selectedFiles: S3Object[];
  viewMode: 'list' | 'grid';
  onFileClick: (file: S3Object, event: React.MouseEvent<HTMLDivElement>) => void;
  onFolderClick: (folder: string) => void;
  onClearSelection?: () => void;
  onFileDoubleClick: (file: S3Object) => void;
  onSelectFile: (file: S3Object, selected: boolean) => void;
}

const FileListView: React.FC<FileListViewProps> = ({
  loading,
  currentPath,
  files,
  folders,
  selectedFile,
  selectedFiles,
  viewMode,
  onFileClick,
  onFolderClick,
  onClearSelection = () => {},
  onFileDoubleClick,
  onSelectFile
}) => {
  // ===== 상태 관리 =====
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // ===== 유틸리티 함수 =====
  // 파일 크기 포맷
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

  // 날짜 포맷
  const formatDate = (date?: Date): string => {
    if (!date) return '-';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 파일명 포맷
  const getFileName = (key: string) => {
    return key.split('/').pop() || key;
  };

  // 파일 확장자 추출
  const getFileExtension = (filename: string): string => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  };

  // 파일 타입별 색상
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

  // 파일 확장자에 따른 아이콘
  const getFileIcon = (filename: string) => {
    const ext = getFileExtension(filename).toLowerCase();
    const color = getFileIconColor(filename);

    switch (ext) {
      case 'pdf':
        return <FileType className={`${color}`} />;
      case 'doc': case 'docx': case 'txt': case 'rtf':
        return <FileText className={`${color}`} />;
      case 'xls': case 'xlsx': case 'csv':
        return <Table className={`${color}`} />;
      case 'ppt': case 'pptx':
        return <PenTool className={`${color}`} />;
      case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg': case 'webp':
        return <Image className={`${color}`} />;
      case 'mp3': case 'wav': case 'ogg': case 'flac':
        return <Music className={`${color}`} />;
      case 'mp4': case 'avi': case 'mov': case 'webm': case 'mkv':
        return <Video className={`${color}`} />;
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
        return <Archive className={`${color}`} />;
      case 'js': case 'ts': case 'jsx': case 'tsx': case 'html': case 'css': case 'py': case 'java': case 'c': case 'cpp': case 'php':
        return <Code className={`${color}`} />;
      default:
        return <File className={`${color}`} />;
    }
  };

  // 폴더 아이콘 (보다 눈에 띄는 색상과 크기로 개선)
  const getFolderIcon = (isSelected: boolean, size: 'sm' | 'lg' = 'sm') => {
    const iconProps = {
      className: cn(
        isSelected ? "text-blue-600" : "text-blue-500",
        size === 'sm' ? "ml-0 mr-1 h-4 w-4" : "h-12 w-12",
        "transition-colors"
      )
    };

    return isSelected ? <FolderOpen {...iconProps} /> : <Folder {...iconProps} />;
  };

  // ===== 상태 관련 함수 =====
  // 파일 선택 여부 확인
  const isFileSelected = (file: S3Object): boolean => {
    return selectedFiles.some(f => f.key === file.key);
  };

  // 체크박스 상태 확인
  const isFileChecked = (key: string): boolean => {
    return checkedFiles.includes(key);
  };

  // 모든 파일 선택 여부 확인
  const isAllSelected = files.length > 0 && selectedFiles.length === files.length;

  // ===== 이벤트 핸들러 =====
  // 정렬 필드 변경
  const handleHeaderClick = (column: SortField) => {
    if (sortField === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(column);
      setSortDirection('asc');
    }
  };

  // 체크박스 토글
  const toggleFileChecked = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (isFileChecked(key)) {
      setCheckedFiles(checkedFiles.filter(k => k !== key));
    } else {
      setCheckedFiles([...checkedFiles, key]);
    }
  };

  // 체크박스 변경 핸들러
  const handleCheckboxChange = (file: S3Object, checked: boolean) => {
    onSelectFile(file, checked);
  };

  // 모든 파일 선택/해제 토글
  const toggleSelectAllFiles = () => {
    if (isAllSelected) {
      // 모두 선택된 상태면 모두 해제
      selectedFiles.forEach(file => {
        onSelectFile(file, false);
      });
    } else {
      // 일부만 선택되었거나 아무것도 선택되지 않았으면 모두 선택
      files.forEach(file => {
        if (!selectedFiles.some(f => f.key === file.key)) {
          onSelectFile(file, true);
        }
      });
    }
  };

  // 파일 클릭 핸들러
  const handleFileClick = (file: S3Object, event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest('.checkbox-container')) {
      if (event.shiftKey && selectedFiles.length > 0) {
        const lastSelectedFile = selectedFiles[selectedFiles.length - 1];
        const lastSelectedIndex = sortedFilesWithFoldersFirst.findIndex(f => f.key === lastSelectedFile.key);
        const currentIndex = sortedFilesWithFoldersFirst.findIndex(f => f.key === file.key);

        if (lastSelectedIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastSelectedIndex, currentIndex);
          const end = Math.max(lastSelectedIndex, currentIndex);

          for (let i = start; i <= end; i++) {
            onSelectFile(sortedFilesWithFoldersFirst[i], true);
          }
          return;
        }
      }

      if (event.ctrlKey || event.metaKey) {
        const isSelected = selectedFiles.some(f => f.key === file.key);
        onSelectFile(file, !isSelected);
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        onFileClick(file, event);
      }
    }
  };

  // 상위 폴더로 이동
  const navigateToParentFolder = () => {
    if (currentPath === '/' || currentPath === '') return;

    const pathWithoutTrailingSlash = currentPath.endsWith('/')
      ? currentPath.slice(0, -1)
      : currentPath;

    const lastSlashIndex = pathWithoutTrailingSlash.lastIndexOf('/');

    if (lastSlashIndex <= 0) {
      onFolderClick('/');
    } else {
      const parentPath = pathWithoutTrailingSlash.substring(0, lastSlashIndex + 1);
      onFolderClick(parentPath);
    }
  };

  // ===== 드래그 관련 함수 =====
  // 드래그 시작
  const handleDragStart = (index: number, event: React.MouseEvent) => {
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
      onClearSelection();
    }

    setIsDragging(true);
    setDragStartIndex(index);
    setDragEndIndex(index);
    document.body.style.userSelect = 'none';

    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) {
      const file = sortedFilesWithFoldersFirst[index];
      onSelectFile(file, true);
    }
  };

  // 드래그 중
  const handleDragOver = (index: number) => {
    if (isDragging && dragStartIndex !== null) {
      setDragEndIndex(index);
    }
  };

  // 드래그 종료
  const handleDragEnd = () => {
    if (isDragging && dragStartIndex !== null && dragEndIndex !== null) {
      const start = Math.min(dragStartIndex, dragEndIndex);
      const end = Math.max(dragStartIndex, dragEndIndex);

      const filesToSelect = sortedFilesWithFoldersFirst.slice(start, end + 1);

      filesToSelect.forEach(file => {
        const isAlreadySelected = selectedFiles.some(f => f.key === file.key);
        onSelectFile(file, !isAlreadySelected);
      });
    }

    setIsDragging(false);
    setDragStartIndex(null);
    setDragEndIndex(null);
    document.body.style.userSelect = '';
  };

  // 마우스 이벤트 리스너
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    const handleMouseLeave = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDragging]);

  // ===== 데이터 처리 =====
  // 파일 정렬
  const sortFiles = (a: S3Object, b: S3Object): number => {
    let result = 0;

    switch (sortField) {
      case 'name':
        const nameA = a.key.split('/').pop() || '';
        const nameB = b.key.split('/').pop() || '';
        result = nameA.localeCompare(nameB);
        break;
      case 'size':
        result = (a.size || 0) - (b.size || 0);
        break;
      case 'lastModified':
        const dateA = a.lastModified ? a.lastModified.getTime() : 0;
        const dateB = b.lastModified ? b.lastModified.getTime() : 0;
        result = dateA - dateB;
        break;
    }

    return sortDirection === 'asc' ? result : -result;
  };

  // 폴더를 S3Object로 변환
  const folderObjects: S3Object[] = folders.map(folder => {
    const folderName = folder.split('/').filter(part => part.trim() !== '').pop() || folder;
    return {
      key: folder,
      displayName: folderName,
      type: 'folder',
      children: []
    };
  });

  // 정렬된 파일 목록
  const sortedFiles = [...files].sort(sortFiles);

  // 폴더 정렬 (항상 이름순)
  const sortedFolders = [...folderObjects].sort((a, b) => {
    const nameA = a.displayName || a.key.split('/').filter(part => part.trim() !== '').pop() || a.key;
    const nameB = b.displayName || b.key.split('/').filter(part => part.trim() !== '').pop() || b.key;
    return nameA.localeCompare(nameB);
  });

  // 파일과 폴더 결합 (폴더 먼저)
  const sortedFilesWithFoldersFirst = [...sortedFolders, ...sortedFiles];

  // ===== 렌더링 =====
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="w-full h-full overflow-auto">
        <table ref={tableRef} className="w-full min-w-full table-fixed border-collapse text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-12 px-1 py-1 text-left">
                <div className="flex items-center">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAllFiles}
                    className="checkbox-container"
                  />
                </div>
              </th>
              <th
                className="w-1/2 px-1 py-1 text-left cursor-pointer"
                onClick={() => handleHeaderClick('name')}
              >
                <div className="flex items-center">
                  <span className="text-xs">이름</span>
                  {sortField === 'name' && (
                    sortDirection === 'asc' ?
                    <ChevronUp className="ml-1 h-3 w-3" /> :
                    <ChevronDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
              <th
                className="w-1/4 px-1 py-1 text-left cursor-pointer"
                onClick={() => handleHeaderClick('size')}
              >
                <div className="flex items-center">
                  <span className="text-xs">크기</span>
                  {sortField === 'size' && (
                    sortDirection === 'asc' ?
                    <ChevronUp className="ml-1 h-3 w-3" /> :
                    <ChevronDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
              <th
                className="w-1/4 px-1 py-1 text-left cursor-pointer"
                onClick={() => handleHeaderClick('lastModified')}
              >
                <div className="flex items-center">
                  <span className="text-xs">수정일</span>
                  {sortField === 'lastModified' && (
                    sortDirection === 'asc' ?
                    <ChevronUp className="ml-1 h-3 w-3" /> :
                    <ChevronDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* 상위 폴더로 이동 */}
            {currentPath !== '/' && currentPath !== '' && (
              <tr
                className="hover:bg-gray-100 cursor-pointer"
                onClick={navigateToParentFolder}
              >
                <td className="px-1 py-1"></td>
                <td className="px-1 py-1" colSpan={3}>
                  <div className="flex items-center">
                    <ArrowUp className="mr-1 h-4 w-4 text-blue-500" />
                    <span className="text-xs">...</span>
                  </div>
                </td>
              </tr>
            )}
            {sortedFilesWithFoldersFirst.map((item, index) => {
              const isSelected = selectedFiles.some(f => f.key === item.key);
              const fileName = item.displayName || getFileName(item.key);
              const isInDragRange = isDragging && dragStartIndex !== null && dragEndIndex !== null &&
                ((index >= Math.min(dragStartIndex, dragEndIndex) && index <= Math.max(dragStartIndex, dragEndIndex)));

              return (
                <tr
                  key={item.key}
                  className={cn(
                    'hover:bg-gray-100',
                    isSelected && 'bg-blue-100',
                    isInDragRange && 'bg-blue-50'
                  )}
                  onClick={(e) => item.type === 'folder' ? onFolderClick(item.key) : handleFileClick(item, e)}
                  onDoubleClick={() => item.type === 'file' && onFileDoubleClick(item)}
                  onMouseDown={(e) => item.type === 'file' && handleDragStart(index, e)}
                  onMouseOver={() => isDragging && handleDragOver(index)}
                  style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
                >
                  <td className="px-1 py-1">
                    <div
                      className="flex items-center checkbox-container"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    >
                      <SmallCheckbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleCheckboxChange(item, !!checked)}
                      />
                    </div>
                  </td>
                  <td className="px-1 py-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    <div className="flex items-center">
                      {item.type === 'folder' ? (
                        getFolderIcon(isSelected, 'sm')
                      ) : (
                        React.cloneElement(getFileIcon(item.key), { className: `ml-0 mr-1 h-4 w-4` })
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs">{fileName}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{fileName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>
                  <td className="px-1 py-1 text-xs">
                    {item.type === 'file' ? formatFileSize(item.size) : '-'}
                  </td>
                  <td className="px-1 py-1 text-xs">
                    {item.lastModified ? formatDate(item.lastModified) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } else {
    // 그리드 뷰
    return (
      <div className="w-full h-full p-2 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* 상위 폴더로 이동 */}
          {currentPath !== '/' && currentPath !== '' && (
            <div
              key="parent-folder"
              className="flex flex-col items-center p-2 rounded cursor-pointer hover:bg-gray-100"
              onClick={navigateToParentFolder}
            >
              <div className="w-full flex justify-center">
                <ArrowUp className="h-12 w-12 text-blue-500" />
              </div>
              <span className="mt-1 text-center text-xs truncate w-full">...</span>
            </div>
          )}
          {sortedFilesWithFoldersFirst.map((item, index) => {
            const isSelected = selectedFiles.some(f => f.key === item.key);
            const fileName = item.displayName || getFileName(item.key);
            const isInDragRange = isDragging && dragStartIndex !== null && dragEndIndex !== null &&
              ((index >= Math.min(dragStartIndex, dragEndIndex) && index <= Math.max(dragStartIndex, dragEndIndex)));

            return (
              <div
                key={item.key}
                className={cn(
                  'flex flex-col items-center p-2 rounded cursor-pointer',
                  isSelected ? 'bg-blue-100' : 'hover:bg-gray-100',
                  isInDragRange && 'bg-blue-50'
                )}
                onClick={(e) => item.type === 'folder' ? onFolderClick(item.key) : handleFileClick(item, e)}
                onDoubleClick={() => item.type === 'file' && onFileDoubleClick(item)}
                onMouseDown={(e) => item.type === 'file' && handleDragStart(index, e)}
                onMouseOver={() => isDragging && handleDragOver(index)}
                style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
              >
                <div className="relative w-full flex justify-center">
                  <div
                    className="absolute top-0 left-0 checkbox-container"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                  >
                    <SmallCheckbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleCheckboxChange(item, !!checked)}
                    />
                  </div>
                  {item.type === 'folder' ? (
                    getFolderIcon(isSelected, 'lg')
                  ) : (
                    React.cloneElement(getFileIcon(item.key), { className: `h-12 w-12` })
                  )}
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="mt-1 text-center text-xs truncate w-full">{fileName}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{fileName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {item.type === 'file' && (
                  <span className="text-xs text-gray-500 mt-1">{formatFileSize(item.size)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
};

export default FileListView;
