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

// 프로젝트 정보 타입 정의
interface ProjectInfo {
  projectId: string
  version: string
  theme: {
    backgroundColor: string
    fontColor: string
    logoUrl: string
  }
}

// studio.ini에서 가져온 설정 값 타입 정의
interface StudioIniValues {
  PROJECT_ID: string
  BETA: number
  isBeta: boolean
}

interface MainProcessLog {
  type: 'log' | 'error' | 'warn' | 'info'
  message: string
}

// 환경 설정 인터페이스 정의
interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  buttonText: string
  border: string
}

interface ThemeConfig {
  colors: ThemeColors
  backgroundImage: string
  titleColor: string
}

interface Environment {
  id?: string
  data: ThemeConfig
  createdAt?: string
  updatedAt?: string
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
  },

  // 프로젝트 정보 API 추가
  getProjectInfo: (): Promise<ProjectInfo> => {
    return ipcRenderer.invoke('get-project-info')
  },

  // studio.ini 값 가져오기 API 추가
  getStudioIniValues: (): Promise<StudioIniValues> => {
    return ipcRenderer.invoke('get-studio-ini-values')
  },

  // 환경 설정 가져오기 API 추가
  getEnvironments: (): Promise<Environment[]> => {
    return ipcRenderer.invoke('get-environments')
  },

  // 메인 프로세스 로그 수신 API
  onMainProcessLog: (callback: (log: MainProcessLog) => void): () => void => {
    const listener = (_event: IpcRendererEvent, log: MainProcessLog): void => callback(log)
    ipcRenderer.on('main-process-log', listener)
    return (): void => {
      ipcRenderer.removeListener('main-process-log', listener)
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
