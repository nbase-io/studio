import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import S3Upload from './S3Upload'
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
import { PlusCircle, Upload, File, Check, X } from 'lucide-react'

function Versions(): JSX.Element {
  const [versions] = useState(window.electron.process.versions)
  const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list')
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // Selected build and version management screen state
  const [selectedBuild, setSelectedBuild] = useState<number | null>(null)
  const [showVersionManagement, setShowVersionManagement] = useState(false)

  // File upload state
  const [setupFile, setSetupFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // New build information
  const [newBuild, setNewBuild] = useState({
    name: '',
    platform: 'Windows',
    stability: 'NOT STABLE',
    size: '0 MB',
    version: 'None',
    downloadedBuild: 'None',
    releaseDate: new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/(\d+)\/(\d+)\/(\d+), (\d+:\d+:\d+)/, '$2/$1/$3 $4'),
    buildId: Math.random().toString(16).substring(2, 10)
  })

  // Build list data
  const [builds, setBuilds] = useState([
    {
      id: 1,
      name: 'My daily build',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '928.71 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '11/04/2022 08:25:36',
      buildId: '23d6c63d',
      hasSetupFile: true
    },
    {
      id: 2,
      name: 'Weekly build',
      platform: 'Windows',
      stability: 'STABLE',
      size: '915.32 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '10/04/2022 15:12:21',
      buildId: 'a5b2c71e'
    },
    {
      id: 3,
      name: 'Dev branch',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '932.18 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '09/04/2022 22:45:12',
      buildId: 'f4e3d2c1'
    },
    {
      id: 4,
      name: 'Feature test',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '940.26 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '08/04/2022 14:32:58',
      buildId: 'b9a8c7d6'
    },
    {
      id: 5,
      name: 'Version 2.0',
      platform: 'Windows',
      stability: 'STABLE',
      size: '922.47 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '07/04/2022 09:17:35',
      buildId: 'e5f4g3h2'
    },
    {
      id: 6,
      name: 'UI improvement',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '935.89 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '06/04/2022 16:48:53',
      buildId: 'j7k6l5m4'
    },
    {
      id: 7,
      name: 'Bug fix',
      platform: 'Windows',
      stability: 'STABLE',
      size: '919.14 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '05/04/2022 11:29:47',
      buildId: 'n3o2p1q0'
    },
    {
      id: 8,
      name: 'Performance',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '930.52 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '04/04/2022 18:05:23',
      buildId: 'r9s8t7u6'
    },
    {
      id: 9,
      name: 'Alpha release',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '941.33 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '03/04/2022 20:41:39',
      buildId: 'v5w4x3y2'
    },
    {
      id: 10,
      name: 'Beta version',
      platform: 'Windows',
      stability: 'STABLE',
      size: '925.68 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: '02/04/2022 13:14:27',
      buildId: 'z1a2b3c4'
    }
  ])

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingBuild, setEditingBuild] = useState<typeof builds[0] | null>(null)

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      setSetupFile(file)

      // Auto-update size field based on file size
      const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2)
      setNewBuild({...newBuild, size: `${fileSizeInMB} MB`})
    }
  }

  // Simulate file upload
  const simulateFileUpload = () => {
    if (!setupFile) return

    setIsUploading(true)
    setUploadProgress(0)

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsUploading(false)
          return 100
        }
        return prev + 5
      })
    }, 200)
  }

  // Reset file upload state
  const resetFileUpload = () => {
    setSetupFile(null)
    setUploadProgress(0)
    setIsUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Add new build function
  const handleAddBuild = () => {
    // Start file upload if not started yet
    if (setupFile && uploadProgress < 100 && !isUploading) {
      simulateFileUpload()
      return
    }

    // Wait for upload to complete
    if (isUploading) return

    const newId = builds.length > 0 ? Math.max(...builds.map(b => b.id)) + 1 : 1
    setBuilds([...builds, {
      ...newBuild,
      id: newId,
      hasSetupFile: setupFile !== null && uploadProgress === 100
    }])

    setIsDialogOpen(false)

    // Reset input fields
    setNewBuild({
      name: '',
      platform: 'Windows',
      stability: 'NOT STABLE',
      size: '0 MB',
      version: 'None',
      downloadedBuild: 'None',
      releaseDate: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(/(\d+)\/(\d+)\/(\d+), (\d+:\d+:\d+)/, '$2/$1/$3 $4'),
      buildId: Math.random().toString(16).substring(2, 10)
    })

    // Reset file upload state
    resetFileUpload()
  }

  // Dialog close handler
  const handleDialogClose = () => {
    if (!isUploading) {
      setIsDialogOpen(false)
      resetFileUpload()
    }
  }

  // Build selection function
  const handleBuildSelect = (buildId: number) => {
    setSelectedBuild(buildId)
    setShowVersionManagement(true)
  }

  // Go back from version management screen
  const handleBackToBuildList = () => {
    setShowVersionManagement(false)
    setSelectedBuild(null)
  }

  // Handle edit button click
  const handleEditClick = (build: typeof builds[0], e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingBuild(build)
    setIsEditDialogOpen(true)
  }

  // Handle build update
  const handleUpdateBuild = () => {
    if (!editingBuild) return

    setBuilds(builds.map(build =>
      build.id === editingBuild.id ? editingBuild : build
    ))
    setIsEditDialogOpen(false)
    setEditingBuild(null)
  }

  // Version Management component
  const VersionManagement = ({ buildId }: { buildId: number }) => {
    const build = builds.find(b => b.id === buildId)

    if (!build) return <div>Build not found.</div>

    // Sample version data
    const versions = [
      { version: '1.0.0', date: '2022-11-04', status: 'stable', notes: 'Initial version' },
      { version: '1.0.1', date: '2022-11-05', status: 'stable', notes: 'Bug fixes' },
      { version: '1.1.0', date: '2022-11-10', status: 'beta', notes: 'New features added' },
      { version: '1.2.0', date: '2022-11-15', status: 'alpha', notes: 'Performance improvements' }
    ]

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToBuildList}
            className="mr-2"
          >
            ← Back
          </Button>
          <h2 className="text-lg font-semibold">{build.name} Version Management</h2>
        </div>

        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-sm font-medium">Build ID: {build.buildId}</div>
                <div className="text-xs text-gray-500">Platform: {build.platform}</div>
              </div>
              <Button size="sm">
                <PlusCircle className="h-4 w-4 mr-1" />
                Add New Version
              </Button>
            </div>

            <div className="border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Version</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Release Notes</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-medium">{version.version}</td>
                      <td className="p-2">{version.date}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-medium
                          ${version.status === 'stable' ? 'bg-green-100 text-green-700' :
                            version.status === 'beta' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'}`}>
                          {version.status}
                        </span>
                      </td>
                      <td className="p-2">{version.notes}</td>
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 h-full">
      {showVersionManagement && selectedBuild ? (
        <VersionManagement buildId={selectedBuild} />
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-xl font-bold">Builds</h1>
              <p className="text-muted-foreground mt-0.5 text-xs">Build management and downloads</p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'list' && (
                <Button
                  size="sm"
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Add
                </Button>
              )}
              <Button
                size="sm"
                variant={activeTab === 'list' ? 'default' : 'outline'}
                onClick={() => setActiveTab('list')}
              >
                Build List
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'upload' ? 'default' : 'outline'}
                onClick={() => setActiveTab('upload')}
              >
                File Upload
              </Button>
            </div>
          </div>

          {activeTab === 'list' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {builds.map((build) => (
                <Card key={build.id} className="overflow-hidden w-full h-64 cursor-pointer hover:border-blue-400 transition-colors" onClick={() => handleBuildSelect(build.id)}>
                  <CardContent className="p-0 h-full flex flex-col">
                    <div className="p-3 border-b">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold">{build.id}. {build.name}</h3>
                        <button
                          className="text-lg hover:bg-gray-100 rounded-full h-8 w-8 flex items-center justify-center"
                          onClick={(e) => handleEditClick(build, e)}
                        >
                          ...
                        </button>
                      </div>

                      <div className="flex items-center mt-1">
                        <div className="flex items-center mr-3">
                          <div className="w-4 h-4 mr-1.5 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                              <path fill="#00adef" d="M0 2.3l6.5-.9v6.3L0 7.7zm7.2-1L16 0v7.7l-8.8.1zm0 14.4l8.8-1.2V7.9l-8.8.1zm-7.2-1L6.5 16V8.4l-6.5.1z"/>
                            </svg>
                          </div>
                          <span className="text-xs">{build.platform}</span>
                        </div>
                        <div className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] uppercase font-medium">
                          {build.stability}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 flex flex-col flex-1">
                      <Button
                        className="w-full mb-2 bg-blue-500 hover:bg-blue-600 flex items-center justify-center gap-2 text-xs py-1.5"
                        onClick={(e) => e.stopPropagation()} // Prevent bubbling
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                      </Button>
                      <div className="text-xs text-center mb-2">{build.size}</div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-gray-500">Version</div>
                          <div>{build.version}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Downloaded Build</div>
                          <div>{build.downloadedBuild}</div>
                        </div>

                        <div>
                          <div className="text-gray-500">Version</div>
                          <div>{build.releaseDate}</div>
                        </div>
                        <div>
                          <div className="text-gray-500">Latest Build</div>
                          <div className="flex items-center">
                            <span className="text-blue-500">{build.buildId}</span>
                            <button
                              className="ml-1 text-gray-400 hover:text-gray-600"
                              onClick={(e) => e.stopPropagation()} // Prevent bubbling
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <S3Upload />
          )}

          {/* Add New Build Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Build</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Build Name</Label>
                  <Input
                    id="name"
                    value={newBuild.name}
                    onChange={(e) => setNewBuild({...newBuild, name: e.target.value})}
                    placeholder="Enter build name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="platform">Platform</Label>
                    <select
                      id="platform"
                      className="h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={newBuild.platform}
                      onChange={(e) => setNewBuild({...newBuild, platform: e.target.value})}
                    >
                      <option value="Windows">Windows</option>
                      <option value="macOS">macOS</option>
                      <option value="Linux">Linux</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="stability">Stability</Label>
                    <select
                      id="stability"
                      className="h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={newBuild.stability}
                      onChange={(e) => setNewBuild({...newBuild, stability: e.target.value})}
                    >
                      <option value="STABLE">STABLE</option>
                      <option value="NOT STABLE">NOT STABLE</option>
                    </select>
                  </div>
                </div>

                {/* Setup File Upload Section */}
                <div className="grid gap-2">
                  <Label htmlFor="setup-file">Setup File</Label>
                  <div className="border rounded-md p-3">
                    <input
                      type="file"
                      id="setup-file"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".exe,.dmg,.pkg,.deb,.rpm"
                    />

                    {!setupFile ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <div
                          className="w-full h-20 border-2 border-dashed rounded-md flex items-center justify-center cursor-pointer hover:border-blue-400 mb-2"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="flex flex-col items-center">
                            <Upload className="h-6 w-6 text-gray-400 mb-1" />
                            <span className="text-xs text-gray-500">Drag and drop your setup file here or click to browse</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">Supported formats: .exe, .dmg, .pkg, .deb, .rpm</span>
                      </div>
                    ) : (
                      <div className="py-2">
                        <div className="flex items-center mb-2">
                          <File className="h-4 w-4 mr-2 text-blue-500" />
                          <span className="text-sm font-medium flex-grow truncate">{setupFile.name}</span>
                          <button
                            className="ml-2 text-gray-400 hover:text-red-500"
                            onClick={resetFileUpload}
                            disabled={isUploading}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                          <div
                            className={`h-2 rounded-full ${uploadProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span>{Math.round((setupFile.size / (1024 * 1024)) * 100) / 100} MB</span>
                          <span className="flex items-center">
                            {uploadProgress === 100 ? (
                              <>
                                <Check className="h-3 w-3 text-green-500 mr-1" />
                                <span className="text-green-500">Upload complete</span>
                              </>
                            ) : (
                              `${uploadProgress}%`
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="size">Size</Label>
                  <Input
                    id="size"
                    value={newBuild.size}
                    onChange={(e) => setNewBuild({...newBuild, size: e.target.value})}
                    placeholder="Enter size (e.g., 900 MB)"
                    disabled={setupFile !== null}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" disabled={isUploading}>Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAddBuild}
                  disabled={newBuild.name === '' || (setupFile !== null && uploadProgress < 100 && !isUploading)}
                >
                  {setupFile && uploadProgress < 100 && !isUploading ? 'Upload File' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Build Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Build</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Build Name</Label>
                  <Input
                    id="edit-name"
                    value={editingBuild?.name || ''}
                    onChange={(e) => setEditingBuild(prev => prev ? {...prev, name: e.target.value} : null)}
                    placeholder="Enter build name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-platform">Platform</Label>
                    <select
                      id="edit-platform"
                      className="h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={editingBuild?.platform || 'Windows'}
                      onChange={(e) => setEditingBuild(prev => prev ? {...prev, platform: e.target.value} : null)}
                    >
                      <option value="Windows">Windows</option>
                      <option value="macOS">macOS</option>
                      <option value="Linux">Linux</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stability">Stability</Label>
                    <select
                      id="edit-stability"
                      className="h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={editingBuild?.stability || 'NOT STABLE'}
                      onChange={(e) => setEditingBuild(prev => prev ? {...prev, stability: e.target.value} : null)}
                    >
                      <option value="STABLE">STABLE</option>
                      <option value="NOT STABLE">NOT STABLE</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-size">Size</Label>
                  <Input
                    id="edit-size"
                    value={editingBuild?.size || ''}
                    onChange={(e) => setEditingBuild(prev => prev ? {...prev, size: e.target.value} : null)}
                    placeholder="Enter size (e.g., 900 MB)"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-version">Version</Label>
                  <Input
                    id="edit-version"
                    value={editingBuild?.version || ''}
                    onChange={(e) => setEditingBuild(prev => prev ? {...prev, version: e.target.value} : null)}
                    placeholder="Enter version"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleUpdateBuild}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="text-[10px] text-muted-foreground mt-3">
            System info: Electron v{versions.electron} | Chromium v{versions.chrome} | Node v{versions.node}
          </div>
        </>
      )}
    </div>
  )
}

export default Versions
