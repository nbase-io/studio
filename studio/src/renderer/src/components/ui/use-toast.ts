// 간단한 Toast 기능 구현 (실제로는 더 복잡한 ToastProvider가 필요)
import { useState, useEffect } from 'react'

export interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

export function toast(props: ToastProps) {
  // 실제 구현에서는 더 복잡한 토스트 시스템이 필요합니다.
  // 여기서는 콘솔에 메시지만 출력하도록 간단히 구현합니다.
  console.log(`Toast (${props.type || 'info'}): ${props.message}`)
}

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([])

  const addToast = (props: ToastProps) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { ...props, id }])

    if (props.duration !== Infinity) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, props.duration || 3000)
    }

    toast(props)
  }

  return { toasts, toast: addToast }
}
