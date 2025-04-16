import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadCloud, FilePlus, File, X, Loader2 } from 'lucide-react';
import { Version } from '@/lib/api';

interface AddVersionDialogProps {
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  newVersion: Partial<Version>;
  setNewVersion: (version: Partial<Version>) => void;
  formErrors: Record<string, string>;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  uploadProgress: Record<string, number>;
  isSubmitting: boolean;
  isUploading: boolean;
  handleAddVersion: () => Promise<void>;
  handleUploadAllFiles: () => Promise<void>;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  handleRemoveFile: (index: number) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}

export default function AddVersionDialog({
  showDialog,
  setShowDialog,
  newVersion,
  setNewVersion,
  formErrors,
  uploadedFiles,
  setUploadedFiles,
  uploadProgress,
  isSubmitting,
  isUploading,
  handleAddVersion,
  handleUploadAllFiles,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleRemoveFile,
  handleFileSelect
}: AddVersionDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isVersionSaved, setIsVersionSaved] = useState<boolean>(false);

  // 저장 후 파일 업로드하고 다이얼로그 닫는 함수
  const handleSaveAndUpload = async () => {
    try {
      // 1. 버전 저장
      await handleAddVersion();

      // 2. 파일이 있을 경우 업로드
      // if (uploadedFiles.length <= 0) {
      //   setIsVersionSaved(true);
      // }

      // // 3. 다이얼로그 닫기
      setShowDialog(false);

    } catch (error) {
      console.error('버전 저장 또는 파일 업로드 중 오류:', error);
      setIsVersionSaved(false);
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Add New Version</DialogTitle>
          <DialogDescription className="text-xs">
            Add new version information and upload files.
          </DialogDescription>
        </DialogHeader>

        {/* 버전 정보 입력 폼 */}
        <div className="grid gap-4">
          {/* Code, Name, Status 한 줄로 표시 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="versionCode" className="text-xs mb-1 block">
                Code
              </Label>
              <Input
                id="versionCode"
                placeholder="1.0.1"
                className="text-xs h-8 w-full"
                value={newVersion.versionCode}
                onChange={(e) => setNewVersion({ ...newVersion, versionCode: e.target.value })}
              />
              {formErrors.versionCode && (
                <div className="text-xs text-red-500 mt-1">
                  {formErrors.versionCode}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="versionName" className="text-xs mb-1 block">
                Name
              </Label>
              <Input
                id="versionName"
                placeholder="First Release"
                className="text-xs h-8 w-full"
                value={newVersion.versionName}
                onChange={(e) => setNewVersion({ ...newVersion, versionName: e.target.value })}
              />
              {formErrors.versionName && (
                <div className="text-xs text-red-500 mt-1">
                  {formErrors.versionName}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="status" className="text-xs mb-1 block">
                Status
              </Label>
              <Select
                value={newVersion.status}
                onValueChange={(value) => setNewVersion({ ...newVersion, status: value as any })}
              >
                <SelectTrigger className="text-xs h-8 w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development" className="text-xs">Development</SelectItem>
                  <SelectItem value="draft" className="text-xs">Draft</SelectItem>
                  <SelectItem value="published" className="text-xs">Published</SelectItem>
                  <SelectItem value="archived" className="text-xs">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 파일 업로드 UI - 먼저 표시 */}
          <div className="col-span-3">
            <div
              className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center mb-4 transition-colors duration-200"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <UploadCloud className="mx-auto h-8 w-8 text-gray-400" />
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
                  onChange={handleFileSelect}
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
                          onClick={() => handleRemoveFile(index)}
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
          </div>

          {/* 설명 필드를 가장 아래로 이동 */}
          <div className="grid grid-cols-4 items-center gap-4 col-span-3">
            <Textarea
              id="changeLog"
              placeholder="Version ChangeLog"
              className="col-span-4 h-20 text-xs"
              value={newVersion.changeLog || ''}
              onChange={(e) => setNewVersion({ ...newVersion, changeLog: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDialog(false)} className="text-xs h-8">
            Cancel
          </Button>

          {!isVersionSaved ? (
            <Button
              type="submit"
              onClick={handleSaveAndUpload}
              disabled={isSubmitting || isUploading}
              className="text-xs h-8"
            >
              {isSubmitting || isUploading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Adding...'}
                </>
              ) : 'Add Version'}
            </Button>
          ) : (
            <Button
              onClick={handleUploadAllFiles}
              disabled={isUploading || uploadedFiles.length === 0}
              className="text-xs h-8"
            >
              {isUploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Upload Files ({uploadedFiles.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
