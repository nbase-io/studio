import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { File, Download } from 'lucide-react';
import { Version } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ViewFilesDialogProps {
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  selectedVersion: Version | null;
  formatFileSize: (bytes: number | undefined) => string;
}

export default function ViewFilesDialog({
  showDialog,
  setShowDialog,
  selectedVersion,
  formatFileSize
}: ViewFilesDialogProps) {
  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Version Files</DialogTitle>
          <DialogDescription className="text-xs">
            {selectedVersion?.versionCode && (
              <>Files for version <span className="font-medium">{selectedVersion.versionCode}</span></>
            )}
          </DialogDescription>
        </DialogHeader>

        {selectedVersion?.files?.files && selectedVersion.files.files.length > 0 ? (
          <div className="py-4">
            <div className="flex justify-between mb-2 text-xs">
              <div className="font-medium">
                {selectedVersion.files.totalCount} files
              </div>
              <div className="text-gray-500">
                Total size: {formatFileSize(selectedVersion.files.totalSize)}
              </div>
            </div>

            <ScrollArea className="h-72 border rounded-md">
              <div className="p-1">
                {selectedVersion.files.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md"
                  >
                    <div className="flex items-center space-x-2 flex-1">
                      <File className="h-4 w-4 text-blue-500" />
                      <div className="text-xs flex-1 truncate" title={file.name || file.fileName}>
                        {file.name || file.fileName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatFileSize(file.size || file.fileSize || 0)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        if (file.download_url) {
                          window.open(file.download_url, '_blank');
                        }
                      }}
                      disabled={!file.download_url}
                      title="Download file"
                    >
                      <Download className="h-4 w-4 text-blue-500" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="py-4 text-center">
            <div className="text-sm text-gray-500">
              No files available for this version
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDialog(false)} className="text-xs h-8">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
