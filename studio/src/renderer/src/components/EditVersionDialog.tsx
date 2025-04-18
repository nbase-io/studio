import { ChangeEvent, DragEvent } from 'react';
import React from 'react';
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
import { UploadCloud, FilePlus, File, X, Loader2, Download, Trash } from 'lucide-react';
import { Version, VersionFile } from '@/lib/api';
import { showGlobalError } from './ErrorDialog';

interface EditVersionDialogProps {
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  selectedVersion: Version | null;
  setSelectedVersion: (version: Version | null) => void;
  editFormErrors: Record<string, string>;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  uploadProgress: Record<string, number>;
  isSubmitting: boolean;
  isUploading: boolean;
  filesToDelete: VersionFile[];
  setFilesToDelete: React.Dispatch<React.SetStateAction<VersionFile[]>>;
  handleUpdateVersion: () => Promise<void>;
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  handleRemoveFile: (index: number) => void;
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  formatFileSize: (bytes: number | undefined) => string;
  toast: any;
  cancelUpload?: () => void;
}

export default function EditVersionDialog({
  showDialog,
  setShowDialog,
  selectedVersion,
  setSelectedVersion,
  editFormErrors,
  uploadedFiles,
  setUploadedFiles,
  uploadProgress,
  isSubmitting,
  isUploading,
  setFilesToDelete,
  handleUpdateVersion,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleRemoveFile,
  handleFileSelect,
  formatFileSize,
  toast,
  cancelUpload
}: EditVersionDialogProps) {

  const handleOpenChange = (open: boolean) => {
    if (!open && isUploading) {
      if (cancelUpload) {
        cancelUpload();
        toast({
          title: "Upload Canceled",
          description: "File upload has been canceled.",
          variant: "destructive"
        });
      } else {
        if (window.confirm("Upload is in progress. Are you sure you want to cancel?")) {
          setShowDialog(false);
          toast({
            title: "Upload Canceled",
            description: "File upload has been canceled.",
            variant: "destructive"
          });
        } else {
          return;
        }
      }
    }

    setShowDialog(open);
  };
  const cdnUrl = JSON.parse(localStorage.getItem('settings') || '{}').cdnUrl || '';

  return (
    <Dialog open={showDialog} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Edit Version</DialogTitle>
          <DialogDescription className="text-xs">
            Modify version information
          </DialogDescription>
        </DialogHeader>
        {selectedVersion && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-version" className="text-xs mb-1 block">
                  Code
                </Label>
                <Input
                  id="edit-version"
                  placeholder="1.0.1"
                  className="text-xs h-8 w-full"
                  value={selectedVersion.versionCode}
                  onChange={(e) => setSelectedVersion({ ...selectedVersion, versionCode: e.target.value })}
                />
                {editFormErrors.versionCode && (
                  <div className="text-xs text-red-500 mt-1">
                    {editFormErrors.versionCode}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="edit-name" className="text-xs mb-1 block">
                  Name
                </Label>
                <Input
                  id="edit-name"
                  placeholder="Release name"
                  className="text-xs h-8 w-full"
                  value={selectedVersion.versionName}
                  onChange={(e) => setSelectedVersion({ ...selectedVersion, versionName: e.target.value })}
                />
                {editFormErrors.versionName && (
                  <div className="text-xs text-red-500 mt-1">
                    {editFormErrors.versionName}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="edit-status" className="text-xs mb-1 block">
                  Status
                </Label>
                <Select
                  value={selectedVersion.status}
                  onValueChange={(value) => setSelectedVersion({ ...selectedVersion, status: value as any })}
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
                {editFormErrors.status && (
                  <div className="text-xs text-red-500 mt-1">
                    {editFormErrors.status}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Textarea
                id="edit-changeLog"
                placeholder="Version ChangeLog"
                className="h-20 text-xs w-full"
                value={selectedVersion.changeLog || ''}
                onChange={(e) => setSelectedVersion({ ...selectedVersion, changeLog: e.target.value })}
              />
              {editFormErrors.changeLog && (
                <div className="text-xs text-red-500 mt-1">
                  {editFormErrors.changeLog}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs mb-1 block">Files</Label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center mb-4 transition-colors duration-200"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <UploadCloud className="mx-auto h-6 w-6 text-gray-400" />
                <div className="mt-2">
                  <label htmlFor="edit-file-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100">
                    <FilePlus className="h-3 w-3 mr-1" />
                    Select Files
                  </label>
                  <input
                    id="edit-file-upload"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Or drop files here
                  </p>
                </div>
              </div>

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

              {selectedVersion.files && selectedVersion.files.files && selectedVersion.files.files.length > 0 ? (
                <div className="mb-4">
                  <div className="text-xs font-medium mb-2">
                    Current Files ({selectedVersion.files?.totalCount || selectedVersion.files.files.length})
                    {selectedVersion.files?.totalSize ? ` (Total ${formatFileSize(selectedVersion.files?.totalSize)})` : ''}
                  </div>
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    {selectedVersion.files.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0">
                        <div className="flex items-center space-x-2 flex-1">
                          <File className="h-3 w-3 text-blue-500" />
                          <div className="text-xs truncate" title={file.name}>
                            {file.name || file.fileName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatFileSize(file.size || file.fileSize || 0)}
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            className="text-blue-500 text-xs hover:text-blue-700"
                            onClick={() => {
                              if (file.download_url) {
                                window.open(file.download_url, '_blank');
                              } else {
                                showGlobalError('Download Failed', 'Download link is not available.');
                              }
                            }}
                            disabled={!file.download_url}
                            title="Download file"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                          <button
                            className="text-red-500 text-xs hover:text-red-700"
                            onClick={() => {
                              if (!file.id) return;

                              setFilesToDelete(prev => [...prev, file]);

                              setSelectedVersion({
                                ...selectedVersion,
                                files: {
                                  ...selectedVersion.files!,
                                  totalCount: (selectedVersion.files?.totalCount || 0) - 1,
                                  totalSize: (selectedVersion.files?.totalSize || 0) - (file.size || file.fileSize || 0),
                                  files: selectedVersion.files!.files.filter(f => f.id !== file.id)
                                }
                              });

                              toast({
                                title: "Pending Deletion",
                                description: `${file.name || file.fileName} has been added to the deletion list. It will be permanently deleted when saved.`
                              });
                            }}
                            title="Delete file"
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="text-xs font-medium mb-2">Current Files</div>
                  <div className="p-4 text-center border rounded-md">
                    <div className="text-xs text-gray-500">No files registered.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (isUploading && cancelUpload) {
                cancelUpload();
                toast({
                  title: "Upload Canceled",
                  description: "File upload has been canceled.",
                  variant: "destructive"
                });
              }
              setShowDialog(false);
              setUploadedFiles([]);
            }}
            disabled={isSubmitting && !isUploading}
            className="text-xs h-8"
          >
            {isUploading ? 'Cancel Upload' : 'Cancel'}
          </Button>
          <Button
            onClick={handleUpdateVersion}
            disabled={isSubmitting || isUploading}
            className="text-xs h-8"
          >
            {isSubmitting || isUploading ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {isUploading ? 'Uploading...' : 'Updating...'}
              </>
            ) : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
