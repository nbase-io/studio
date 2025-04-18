
import { X } from "lucide-react"
import { Toast } from "./use-toast"

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

export function ToastComponent({ toast, onClose }: ToastProps) {
  const { id, title, description, type = 'default' } = toast

  const getTypeClasses = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-500 text-green-700'
      case 'error':
      case 'destructive':
        return 'bg-red-50 border-red-500 text-red-700'
      case 'warning':
        return 'bg-yellow-50 border-yellow-500 text-yellow-700'
      default:
        return 'bg-white border-gray-200 text-gray-700'
    }
  }

  return (
    <div className={`rounded-md border p-4 shadow-md ${getTypeClasses()}`}>
      <div className="flex justify-between items-start">
        <div>
          {title && <div className="font-semibold mb-1">{title}</div>}
          {description && <div className="text-sm">{description}</div>}
        </div>
        <button
          className="text-gray-500 hover:text-gray-700"
          onClick={() => onClose(id)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <ToastComponent key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}
