import React, { useRef } from 'react';
import { UploadCloud, FilePlus, File, X, Download, Trash } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { VersionFile } from '@/lib/api';

interface FileUploaderProps {
  uploadedFiles: File[];
  uploadProgress: Record<string, number>;
  versionFiles?: VersionFile[];
  buildId?: string;
  versionId?: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileRemove: (index: number) => void;
  onFileDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onFileDownload?: (file: VersionFile) => void;
  onFileDelete?: (file: VersionFile) => void;
}

export default function FileUploader({
  uploadedFiles,
  uploadProgress,
  versionFiles,
  onFileSelect,
  onFileRemove,
  onFileDrop,
  onDragOver,
  onDragLeave,
  onFileDownload,
  onFileDelete
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div
        className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center mb-4 transition-colors duration-200"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onFileDrop}
      >
        <UploadCloud className="mx-auto h-6 w-6 text-gray-400" />
        <div className="mt-2">
          <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100">
            <FilePlus className="h-3 w-3 mr-1" />
            Select Files
          </label>
          <input
            id="file-upload"
            type="file"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={onFileSelect}
          />
          <p className="mt-1 text-xs text-gray-500">
            Or drop files here
          </p>
        </div>
      </div>

      {/* 선택된 파일 목록 */}
      {uploadedFiles.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium mb-2">Selected Files ({uploadedFiles.length})</div>
          <div className="max-h-40 overflow-y-auto border rounded-md">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                <div className="flex items-center space-x-2 flex-1">
                  <File className="h-3 w-3 text-blue-500" />
                  <div className="text-xs flex-1 truncate" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>

                {/* 업로드 진행률 */}
                {uploadProgress[file.name] && uploadProgress[file.name] > 0 ? (
                  <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5"
                      style={{ width: `${uploadProgress[file.name]}%` }}
                    ></div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onFileRemove(index)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 기존 파일 목록 - 삭제 기능 포함 */}
      {versionFiles && versionFiles.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium mb-2">Current Files ({versionFiles.length})</div>
          <div className="max-h-40 overflow-y-auto border rounded-md">
            {versionFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                <div className="flex items-center space-x-2 flex-1">
                  <File className="h-3 w-3 text-blue-500" />
                  <div className="text-xs flex-1 truncate" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  {onFileDownload && (
                    <button
                      type="button"
                      onClick={() => onFileDownload(file)}
                      className="text-blue-500 hover:text-blue-600"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  )}
                  {onFileDelete && (
                    <button
                      type="button"
                      onClick={() => onFileDelete(file)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
