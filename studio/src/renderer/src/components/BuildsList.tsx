import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Download, MoreHorizontal, Copy, Edit, Trash, Smartphone, Monitor, Tv, Apple, Globe, Gamepad } from 'lucide-react'
import { apiService } from '@/lib/api'
import { Build } from '@/lib/api'

// Build 인터페이스에 md5_hash 추가
interface BuildWithHash extends Build {
  md5_hash?: string;
}

interface ServerStatus {
  connected: boolean;
  message: string;
}

// Function to return icon based on platform
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

// Function to capitalize first letter
const capitalizeFirstLetter = (str?: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

interface BuildsListProps {
  items: BuildWithHash[]
  loading: boolean
  error: string | null
  onBuildSelect: (buildId: string) => void
  onSelect: (buildId: string) => void
  onEdit: (build: BuildWithHash) => void
  onDelete: (buildId: string) => void
  serverStatus: ServerStatus
}

const BuildsList: React.FC<BuildsListProps> = ({
  items,
  loading,
  error,
  onBuildSelect,
  onEdit,
  onDelete
}) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false)
  const [buildToDelete, setBuildToDelete] = useState<string | null>(null)

  const handleEditClick = (build: BuildWithHash, e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(build)
  }

  const handleBuildClick = (build: BuildWithHash) => {
    if (build.id) {
      onBuildSelect(build.id)
    }
  }

  const handleDeleteClick = (buildId: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation()
    if (buildId) {
      setBuildToDelete(buildId)
      setShowDeleteDialog(true)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!buildToDelete) return

    try {
      await apiService.deleteBuild(buildToDelete)
      // 삭제 후 부모 컴포넌트에 알림
      onDelete(buildToDelete)
      setShowDeleteDialog(false)
      setBuildToDelete(null)
    } catch (err) {
      console.error('Failed to delete build:', err)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'None'
    const date = new Date(dateString)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  const handleDownload = (e: React.MouseEvent, downloadUrl?: string) => {
    e.stopPropagation()
    if (downloadUrl) {
      window.open(downloadUrl, '_blank')
    } else {
      alert('Download URL is not available for this build')
    }
  }

  if (loading) {
    return <div></div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <div className="w-full p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((build) => (
          <Card
            key={build.id}
            className="bg-white text-gray-800 border border-gray-200 overflow-hidden rounded-md hover:bg-gray-50 transition-colors shadow-sm"
          >
            <div className="p-3">
              <div className="flex justify-between items-center mb-2">
                <h3
                  className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-blue-600 truncate"
                  onClick={() => handleBuildClick(build)}
                >
                  {build.name}
                </h3>
                <div className="flex space-x-1">

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-gray-800 p-0 h-5 w-5"
                    onClick={(e) => handleEditClick(build, e)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2 border-b border-gray-100 pb-2">
                <div className="flex items-center">
                  {getPlatformIcon(build.platform)}
                  <span className="text-gray-700 font-medium text-xs">{capitalizeFirstLetter(build.platform)}</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${getStatusBadge(build.status)}`}>{capitalizeFirstLetter(build.status)}</span>
              </div>

              <Button
                className="w-full"
                size="sm"
                onClick={(e) => handleDownload(e, build.download_url)}
                disabled={!build.download_url}
              >
                <Download className="h-2.5 w-2.5 mr-0.5" />
                Download
              </Button>

              <div className="text-gray-700 text-xs font-medium text-center mb-2">
                {/* {build.size ? `${build.size} MB` : '0 MB'} */}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-500 mb-1 text-[10px]">Version</div>
                  <div className="text-gray-800 text-[10px]">
                    {build.version || "None"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1 text-[10px]">Updated</div>
                  <div className="text-gray-800 text-[10px] truncate">
                    {build.updatedAt ? new Date(build.updatedAt).toLocaleDateString() : "None"}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>빌드 삭제 확인</DialogTitle>
            <DialogDescription>
              이 빌드를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default BuildsList
