import React from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// 파일/폴더 인터페이스 정의
export interface S3Object {
  key: string;
  displayName?: string;
  size?: number;
  lastModified?: Date;
  type: 'file' | 'folder';
  children?: S3Object[];
}

interface FolderTreeViewProps {
  objects: S3Object[];
  selectedFolder: string | null;
  expandedFolders: string[];
  onSelectFolder: (key: string) => void;
  onToggleFolder: (key: string) => void;
}

// 트리 노드 컴포넌트
const TreeNode: React.FC<{
  node: S3Object;
  level: number;
  selectedFolder: string | null;
  onSelectFolder: (key: string) => void;
  expandedFolders: string[];
  onToggleFolder: (key: string) => void;
}> = ({ node, level, selectedFolder, onSelectFolder, expandedFolders, onToggleFolder }) => {
  const isExpanded = expandedFolders.includes(node.key);
  const isSelected = selectedFolder === node.key;

  // displayName이 있으면 사용하고, 없으면 key에서 마지막 부분만 추출
  const displayName = node.displayName || node.key.split('/').filter(part => part.trim() !== '').pop() || node.key;

  // 폴더인 경우 TreeNode 렌더링
  if (node.type === 'folder') {
    return (
      <div className="select-none bg-white white:bg-gray-900">
        <div
          className={cn(
            'flex items-center py-1 px-2 rounded-md cursor-pointer transition-colors duration-150',
            'hover:bg-blue-50 white:hover:bg-gray-800',
            isSelected ? 'bg-blue-50 text-blue-600 font-medium white:bg-blue-950 white:text-blue-400' : 'bg-white white:bg-gray-900'
          )}
          onClick={() => onSelectFolder(node.key)}
          style={{ paddingLeft: `${(level * 8) + 4}px` }}
        >
          <span
            className="mr-1 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFolder(node.key);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-500 white:text-gray-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-500 white:text-gray-400" />
            )}
          </span>
          <Folder className={cn(
            "h-3.5 w-3.5 mr-1.5",
            isSelected ? "text-blue-500 white:text-blue-400" : "text-yellow-500 white:text-yellow-400"
          )} />
          <span className="text-xs tracking-tighter truncate w-full">{displayName}</span>
        </div>

        {isExpanded && node.children && node.children.map((child) => (
          <TreeNode
            key={child.key}
            node={child}
            level={level + 1}
            selectedFolder={selectedFolder}
            onSelectFolder={onSelectFolder}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
          />
        ))}
      </div>
    );
  }

  return null; // 파일은 트리에서 표시하지 않음
};

// 폴더 트리 뷰 컴포넌트
const FolderTreeView: React.FC<FolderTreeViewProps> = ({
  objects,
  selectedFolder,
  expandedFolders,
  onSelectFolder,
  onToggleFolder
}) => {
  return (
    <div className="h-full bg-white white:bg-gray-900 border-r border-gray-200 white:border-gray-800">
      <div className="py-2 px-3 border-b border-gray-200 white:border-gray-800 bg-white white:bg-gray-900">
        <h3 className="text-xs font-medium text-gray-700 white:text-gray-300">File Browser</h3>
      </div>
      <ScrollArea className="h-[calc(100%-40px)] w-full bg-white white:bg-gray-900">
        <div className="p-2 bg-white white:bg-gray-900">
          {objects.map((rootNode) => (
            <TreeNode
              key={rootNode.key}
              node={rootNode}
              level={0}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FolderTreeView;
