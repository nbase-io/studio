
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { Version } from '@/lib/api';

interface DeleteVersionDialogProps {
  showDialog: boolean;
  setShowDialog: (show: boolean) => void;
  selectedVersion: Version | null;
  isSubmitting: boolean;
  handleDeleteVersion: () => Promise<void>;
}

export default function DeleteVersionDialog({
  showDialog,
  setShowDialog,
  selectedVersion,
  isSubmitting,
  handleDeleteVersion
}: DeleteVersionDialogProps) {
  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Delete Version</DialogTitle>
          <DialogDescription className="text-xs">
            Are you sure you want to delete this version? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {selectedVersion && (
          <div className="py-4">
            <Alert variant="destructive" className="mb-4">
              <AlertDescription className="text-xs">
                Version <span className="font-bold">{selectedVersion.versionCode}</span> will be deleted.
              </AlertDescription>
            </Alert>
            <div className="text-xs text-gray-600">
              Name: <span className="font-medium">{selectedVersion.versionName}</span>
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Status: <span className="font-medium">{selectedVersion.status}</span>
            </div>
            {selectedVersion.files && (
              <div className="text-xs text-gray-600 mt-1">
                Files: <span className="font-medium">{selectedVersion.files.totalCount} files</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowDialog(false)}
            disabled={isSubmitting}
            className="text-xs h-8"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteVersion}
            disabled={isSubmitting}
            className="text-xs h-8"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Deleting...
              </>
            ) : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
