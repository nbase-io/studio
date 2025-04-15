import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import BuildsList from './BuildsList'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlusCircle, Upload, File, Check, X, RefreshCw } from 'lucide-react'
import { apiService, Build } from '@/lib/api'

function Builds(): JSX.Element {
  const [versions] = useState(window.electron.process.versions)
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list')
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Selected build and version management screen state
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null)
  const [showVersionManagement, setShowVersionManagement] = useState(false)

  // ... existing code ...

  return (
    <div className="container mx-auto p-6">
      {/* Inspector Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => (window.api as any).openDevTools()}
        className="fixed bottom-4 left-4 z-50 bg-white shadow-md h-8 text-xs px-3"
      >
        Open Inspector
      </Button>

      {/* Debug Panel Toggle Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDebugPanel}
        className="fixed bottom-4 right-4 z-50 bg-white shadow-md h-8 text-xs px-3"
      >
        {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
      </Button>

      {/* Debug Panel */}
      <DebugPanel />

      {/* Current view - either build list or version management */}
      {showVersionManagement && selectedBuild ? (
        <VersionManagement buildId={selectedBuild} />
      ) : (
        <div>
          {/* Header with title and actions */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold">Builds</h1>
                <span className="text-lg text-gray-400">•</span>
                <h1 className="text-xl font-semibold text-blue-600">New Build</h1>
              </div>
              <p className="text-xs text-gray-500">Manage and deploy game builds</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadBuilds}
                className="text-xs flex items-center gap-1 h-7"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
              <Button
                onClick={() => setIsDialogOpen(true)}
                size="sm"
                className="text-xs flex items-center gap-1 h-7"
              >
                <PlusCircle className="h-3 w-3" />
                New Build
              </Button>
            </div>
          </div>

          {/* Build List with onBuildSelect prop */}
          <BuildsList onBuildSelect={handleBuildSelect} />
        </div>
      )}

      {/* Add Build Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Build</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* ... existing code ... */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleAddBuild}>
              {setupFile && uploadProgress < 100 && !isUploading
                ? 'Upload & Add Build'
                : isUploading
                ? 'Uploading...'
                : 'Add Build'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ... rest of the dialogs and code ... */}
    </div>
  )
}

export default Builds
