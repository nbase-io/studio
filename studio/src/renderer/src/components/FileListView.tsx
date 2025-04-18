import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  File,
  Loader2,
  ChevronUp,
  ChevronDown,
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
import { cn } from '@/lib/utils';
import { S3Object } from './FolderTreeView';
import { Checkbox } from './ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Sortable field types
type SortField = 'name' | 'size' | 'lastModified';
type SortDirection = 'asc' | 'desc';

// Checkbox component
const SmallCheckbox = React.forwardRef<
  React.ElementRef<typeof Checkbox>,
  React.ComponentPropsWithoutRef<typeof Checkbox>
>((props, ref) => (
  <Checkbox
    ref={ref}
    className="h-4 w-4 bg-white"
    {...props}
  />
));

// Checkbox container wrapper (Component for stopping click events and styling)
const CheckboxContainer: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}> = ({ children, className, onClick }) => (
  <div
    className={cn("flex items-center checkbox-container", className)}
    onClick={(e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick && onClick(e);
    }}
  >
    {children}
  </div>
);

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
  // ===== State Management =====
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [checkedFiles, setCheckedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // ===== Utility Functions =====
  // File size format
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

  // Date format
  const formatDate = (date?: Date): string => {
    if (!date) return '-';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Filename format
  const getFileName = (key: string) => {
    return key.split('/').pop() || key;
  };

  // File extension extraction
  const getFileExtension = (filename: string): string => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  };

  // File type color
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

  // File icon based on extension
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

  // Folder icon (improved with more noticeable color and size)
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

  // ===== State Related Functions =====
  // Check if file is selected
  const isFileSelected = (file: S3Object): boolean => {
    return selectedFiles.some(f => f.key === file.key);
  };

  // Check checkbox state
  const isFileChecked = (key: string): boolean => {
    return checkedFiles.includes(key);
  };

  // Check if all files are selected
  const filteredFiles = files.filter(file => file.key !== '/');
  const isAllSelected = filteredFiles.length > 0 && selectedFiles.length === filteredFiles.length;
  const isPartiallySelected = !isAllSelected && selectedFiles.length > 0;

  // ===== Event Handlers =====
  // Change sort field
  const handleHeaderClick = (column: SortField) => {
    if (sortField === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(column);
      setSortDirection('asc');
    }
  };

  // Toggle checkbox
  const toggleFileChecked = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (isFileChecked(key)) {
      setCheckedFiles(checkedFiles.filter(k => k !== key));
    } else {
      setCheckedFiles([...checkedFiles, key]);
    }
  };

  // Checkbox change handler
  const handleCheckboxChange = (file: S3Object, checked: boolean) => {
    onSelectFile(file, checked);
  };

  // Toggle select all files
  const toggleSelectAllFiles = (checked: boolean) => {
    console.log('Changing overall selection state:', checked, 'Selectable files count:', sortedFilesWithFoldersFirst.filter(item => item.key !== '/').length);
    console.log('Currently selected files count:', selectedFiles.length);

    // Target all files/folders except root folder
    const itemsToSelect = sortedFilesWithFoldersFirst.filter(item => item.key !== '/');

    // If all files are not selected or if some are selected, deselect all
    if (!checked || isPartiallySelected) {
      console.log('Deselecting all files');
      selectedFiles.forEach(file => {
        onSelectFile(file, false);
      });
    } else {
      // If nothing is selected, select all
      console.log('Selecting all files');
      itemsToSelect.forEach(file => {
        if (!selectedFiles.some(f => f.key === file.key)) {
          onSelectFile(file, true);
        }
      });
    }
  };

  // File click handler
  const handleFileClick = (file: S3Object, event: React.MouseEvent<HTMLDivElement>) => {
    // Stop event processing if checkbox is clicked
    if ((event.target as HTMLElement).closest('.checkbox-container')) {
      return;
    }

    // Only call onFileClick if the filename area was clicked
    const nameElement = (event.target as HTMLElement).closest('.file-name-cell');
    if (!nameElement) {
      return;
    }

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
  };

  // Navigate to parent folder
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

  // ===== Drag-related Functions =====
  // Start drag
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

  // During drag
  const handleDragOver = (index: number) => {
    if (isDragging && dragStartIndex !== null) {
      setDragEndIndex(index);
    }
  };

  // End drag
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

  // Mouse event listeners
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

  // Reset selection when folder changes
  useEffect(() => {
    // Reset all selected files when folder path changes
    if (selectedFiles.length > 0) {
      console.log('Resetting file selection state due to folder change');
      selectedFiles.forEach(file => {
        onSelectFile(file, false);
      });
    }
  }, [currentPath]);

  // ===== Data Processing =====
  // Sort files
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

  // Convert folders to S3Objects
  const folderObjects: S3Object[] = folders.map(folder => {
    const folderName = folder.split('/').filter(part => part.trim() !== '').pop() || folder;
    return {
      key: folder,
      displayName: folderName,
      type: 'folder',
      children: []
    };
  });

  // Sorted file list
  const sortedFiles = [...files].sort(sortFiles);

  // Sort folders (always by name)
  const sortedFolders = [...folderObjects].sort((a, b) => {
    const nameA = a.displayName || a.key.split('/').filter(part => part.trim() !== '').pop() || a.key;
    const nameB = b.displayName || b.key.split('/').filter(part => part.trim() !== '').pop() || b.key;
    return nameA.localeCompare(nameB);
  });

  // Combine files and folders (folders first)
  const sortedFilesWithFoldersFirst = [...sortedFolders, ...sortedFiles];

  // ===== Rendering =====
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
                <CheckboxContainer className="checkbox-container">
                  <Checkbox
                    checked={isAllSelected || isPartiallySelected}
                    onCheckedChange={(checked) => toggleSelectAllFiles(!!checked)}
                    className="h-4 w-4"
                    data-state={isAllSelected || isPartiallySelected ? "checked" : "unchecked"}
                  />
                </CheckboxContainer>
              </th>
              <th
                className="w-1/2 px-1 py-1 text-left cursor-pointer"
                onClick={() => handleHeaderClick('name')}
              >
                <div className="flex items-center">
                  <span className="text-xs">Name</span>
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
                  <span className="text-xs">Size</span>
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
                  <span className="text-xs">Modified</span>
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
            {/* Navigate to parent folder */}
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
              if(item.key === '/') return null;
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
                    <CheckboxContainer className="checkbox-container">
                      <SmallCheckbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleCheckboxChange(item, !!checked)}
                      />
                    </CheckboxContainer>
                  </td>
                  <td className="px-1 py-1 overflow-hidden text-ellipsis whitespace-nowrap file-name-cell">
                    <div className="flex items-center">
                      {item.type === 'folder' ? (
                        <div className="flex-shrink-0 mr-2">
                          {getFolderIcon(isSelected, 'sm')}
                        </div>
                      ) : (
                        <div className="flex-shrink-0 mr-2">
                          {React.cloneElement(getFileIcon(item.key), { className: `h-4 w-4` })}
                        </div>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs truncate block">{fileName}</span>
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
                  <td className="px-1 py-1 text-xs whitespace-nowrap overflow-hidden text-ellipsis">
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
    // Grid view
    return (
      <div className="w-full h-full p-2 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* Navigate to parent folder */}
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
            if(item.key === '/') return null;
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
                <div className="relative w-full flex flex-col items-center">
                  <CheckboxContainer className="absolute top-0 left-0 z-10 checkbox-container">
                    <SmallCheckbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleCheckboxChange(item, !!checked)}
                    />
                  </CheckboxContainer>
                  <div className="flex-shrink-0 mb-2 relative file-name-cell">
                    {item.type === 'folder' ? (
                      getFolderIcon(isSelected, 'lg')
                    ) : (
                      React.cloneElement(getFileIcon(item.key), { className: `h-12 w-12` })
                    )}
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="mt-1 text-center text-xs truncate w-full max-w-[90px] file-name-cell">{fileName}</span>
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
              </div>
            );
          })}
        </div>
      </div>
    );
  }
};

export default FileListView;
