import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Download progress status type definition
interface DownloadProgress {
  percent: number
  transferredBytes: number
  totalBytes: number
  bytesPerSecond: number
  remaining: number
  isResumed?: boolean
}

// Extract progress status type definition
interface ExtractProgress {
  percent: number
  extracted: number
  total: number
}

// Download initialization result type definition
interface InitializeDownloadResult {
  success: boolean
  error?: string
  isAlreadyRunning?: boolean
  canResume?: boolean
  filePath?: string
  downloadedBytes?: number
  totalBytes?: number
  reason?: string
}

// Resume check result type definition
interface ResumeCheckResult {
  canResume: boolean
  filePath: string
  downloadedBytes: number
  totalBytes: number
  reason?: string
}

// Download event type definition
interface DownloadEvent {
  eventType: 'start' | 'progress' | 'complete' | 'cancel' | 'error'
  timestamp: number
  fileUrl?: string
  fileSize?: number
  progress?: number
  bytesPerSecond?: number
  averageSpeed?: number
  elapsedTime?: number
  targetFolder?: string
  error?: string
}

// Download initialization (to prevent duplicate downloads)
const api = {
  initializeDownload: (fileUrl: string, shouldCleanup: boolean): Promise<InitializeDownloadResult> => {
    return ipcRenderer.invoke('initialize-download', fileUrl, shouldCleanup)
  },

  downloadAndExtract: (fileUrl: string, targetFolder: string): Promise<string> => {
    return ipcRenderer.invoke('download-and-extract', fileUrl, targetFolder)
  },

  cancelDownload: (): Promise<boolean> => {
    return ipcRenderer.invoke('cancel-download')
  },

  checkResumeAvailable: (fileUrl: string): Promise<ResumeCheckResult> => {
    return ipcRenderer.invoke('check-resume-available', fileUrl)
  },

  sendDownloadEvent: (event: DownloadEvent): Promise<void> => {
    return ipcRenderer.invoke('send-download-event', event)
  },

  // Second instance detection event listener
  onSecondInstanceDetected: (callback: () => void): () => void => {
    const listener = (): void => callback()
    ipcRenderer.on('second-instance-detected', listener)
    return (): void => {
      ipcRenderer.removeListener('second-instance-detected', listener)
    }
  },

  onDownloadProgress: (callback: (progress: DownloadProgress) => void): () => void => {
    const listener = (_event: IpcRendererEvent, progress: DownloadProgress): void => callback(progress)
    ipcRenderer.on('download-progress', listener)
    return (): void => {
      ipcRenderer.removeListener('download-progress', listener)
    }
  },

  onExtractProgress: (callback: (progress: ExtractProgress) => void): () => void => {
    const listener = (_event: IpcRendererEvent, progress: ExtractProgress): void => callback(progress)
    ipcRenderer.on('extract-progress', listener)
    return (): void => {
      ipcRenderer.removeListener('extract-progress', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
