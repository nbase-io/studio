import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Download, Trash2, MoreHorizontal, Copy, Edit, Smartphone, Monitor, Tv, Apple, Globe, Gamepad } from 'lucide-react'
import { apiService, Build } from '@/lib/api'

// 플랫폼에 따른 아이콘 반환 함수
const getPlatformIcon = (platform?: string) => {
  switch (platform?.toLowerCase()) {
    case 'android':
      return <Smartphone className="w-4 h-4 mr-1" />;
    case 'ios':
      return <Apple className="w-4 h-4 mr-1" />;
    case 'windows':
      return <Monitor className="w-4 h-4 mr-1" />;
    case 'mac':
      return <Apple className="w-4 h-4 mr-1" />;
    case 'web':
      return <Globe className="w-4 h-4 mr-1" />;
    case 'xbox':
    case 'playstation4':
    case 'playstation5':
    case 'steam':
      return <Gamepad className="w-4 h-4 mr-1" />;
    default:
      return <Globe className="w-4 h-4 mr-1" />;
  }
};

// 첫 글자만 대문자로 변환하는 함수
const capitalizeFirstLetter = (str?: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

interface BuildsListProps {
  onBuildSelect?: (buildId: string) => void;
  onEditBuild?: (build: Build) => void;
}

function BuildsList({ onBuildSelect, onEditBuild }: BuildsListProps): JSX.Element {
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false)
  const [buildToDelete, setBuildToDelete] = useState<string | null>(null)

  const loadBuilds = async () => {
    setLoading(true)
    setError(null)

    try {
      // 서버에서 빌드 가져오기
      const data = await apiService.getBuilds()
      setBuilds(data)
    } catch (err) {
      setError('Failed to load builds. Please check your API settings.')
      console.error('Error loading builds:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBuilds()
  }, [])

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // 이벤트 버블링 방지
    setBuildToDelete(id)
    setShowDeleteDialog(true)
  }

  const handleEditClick = (build: Build, e: React.MouseEvent) => {
    e.stopPropagation() // 이벤트 버블링 방지
    if (onEditBuild) {
      onEditBuild(build)
    }
  }

  const confirmDelete = async () => {
    if (!buildToDelete) return

    try {
      await apiService.deleteBuild(buildToDelete)
      setBuilds(builds.filter(build => build.id !== buildToDelete))
      setShowDeleteDialog(false)
      setBuildToDelete(null)
    } catch (err) {
      console.error('Error deleting build:', err)
      setError('Failed to delete build. Please try again.')
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'None'
    const date = new Date(dateString)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`
  }

  const getStatusBadge = (status?: string) => {
    if (status === 'release') {
      return <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-sm uppercase font-medium">STABLE</span>
    } else if (status === 'development') {
      return <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-sm uppercase font-medium">DEVELOPMENT</span>
    } else if (status === 'testing') {
      return <span className="bg-gray-100 text-gray-800 text-[10px] px-2 py-0.5 rounded-sm uppercase font-medium">TESTING</span>
    } else if (status === 'deprecated') {
      return <span className="bg-gray-100 text-gray-800 text-[10px] px-2 py-0.5 rounded-sm uppercase font-medium">DEPRECATED</span>
    }
  }

  const handleDownload = (e: React.MouseEvent, downloadUrl?: string) => {
    e.stopPropagation() // 이벤트 버블링 방지
    if (downloadUrl) {
      window.open(downloadUrl, '_blank')
    } else {
      alert('Download URL is not available for this build')
    }
  }

  const handleBuildClick = (buildId?: string) => {
    if (buildId && onBuildSelect) {
      onBuildSelect(buildId)
    }
  }

  return (
    <div className="w-full p-4">
      {loading ? (
        <div className="text-center py-8 text-xs text-gray-500">Loading builds...</div>
      ) : error ? (
        <div className="text-center py-8 text-xs text-red-500">{error}</div>
      ) : !Array.isArray(builds) ? (
        <div className="text-center py-8 text-xs text-red-500">
          An error occurred while loading builds. Please refresh the page.
        </div>
      ) : builds.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-500">
          No builds found. Create a new build to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {builds.map((build, index) => (
            <Card
              key={build.id}
              className="bg-white text-gray-800 border border-gray-200 overflow-hidden rounded-md hover:bg-gray-50 transition-colors shadow-md"
            >
              <div className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3
                    className="font-semibold text-gray-900 text-md cursor-pointer hover:text-blue-600"
                    onClick={() => handleBuildClick(build.id)}
                  >
                    {index + 1}. {build.name}
                  </h3>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-gray-800 p-0 h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(build, e);
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center">
                    {getPlatformIcon(build.platform)}
                    <span className="text-gray-700 font-medium text-xs">{capitalizeFirstLetter(build.platform)}</span>
                  </div>
                  {getStatusBadge(build.status)}
                </div>

                <Button
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 flex items-center justify-center h-10 mb-3 rounded-md"
                  onClick={(e) => handleDownload(e, build.download_url)}
                  disabled={!build.download_url}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>

                <div className="text-gray-700 text-sm font-medium text-center mb-3">
                  {build.size || '0 MB'}
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-gray-500 mb-1">Version</div>
                    <div className="text-gray-800">
                      {formatDate(build.updatedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">ID</div>
                    <div className="flex items-center">
                      <span className="text-blue-500 mr-1 truncate overflow-hidden">{build.id || "None"}</span>
                      {build.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(build.id || '');
                          }}
                        >
                          <Copy className="h-3 w-3 text-blue-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this build? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BuildsList
