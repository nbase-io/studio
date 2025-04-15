// 간단한 Toast 기능 구현 (실제로는 더 복잡한 ToastProvider가 필요)
import { useState, useEffect, useCallback } from 'react'

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'destructive'

export interface Toast {
  id: string
  title?: string
  description?: string
  type?: ToastType
  duration?: number
}

interface ToastOptions {
  title?: string
  description?: string
  type?: ToastType
  duration?: number
  variant?: 'default' | 'destructive'
}

interface UseToastReturn {
  toasts: Toast[]
  toast: (options: ToastOptions) => void
  dismiss: (id: string) => void
  dismissAll: () => void
}

export const useToast = (): UseToastReturn => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(
    ({ title, description, type = 'default', duration = 5000 }: ToastOptions) => {
      const id = Math.random().toString(36).substring(2, 9)
      const newToast: Toast = {
        id,
        title,
        description,
        type,
        duration,
      }

      setToasts((prevToasts) => [...prevToasts, newToast])

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id)
        }, duration)
      }

      return id
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  return {
    toasts,
    toast,
    dismiss,
    dismissAll,
  }
}

export default useToast
