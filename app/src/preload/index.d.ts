import { ElectronAPI } from '@electron-toolkit/preload'

// 프로젝트 정보 인터페이스 정의
interface ProjectInfo {
  projectId: string
  version: string
  theme: {
    backgroundColor: string
    fontColor: string
    logoUrl: string
  }
}

// studio.ini 설정 값 인터페이스 정의
interface StudioIniValues {
  PROJECT_ID: string
  BETA: number
  isBeta: boolean
}

// 메인 프로세스 로그 인터페이스 정의
interface MainProcessLog {
  type: 'log' | 'error' | 'warn' | 'info'
  message: string
}

// 환경 설정 관련 인터페이스 정의
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

// API 인터페이스 정의
interface ApiInterface {
  // 다운로드 관련 API
  initializeDownload: (fileUrl: string, shouldCleanup: boolean) => Promise<any>
  downloadAndExtract: (fileUrl: string, targetFolder: string) => Promise<string>
  cancelDownload: () => Promise<boolean>
  checkResumeAvailable: (fileUrl: string) => Promise<any>
  sendDownloadEvent: (event: any) => Promise<void>
  onSecondInstanceDetected: (callback: () => void) => () => void
  onDownloadProgress: (callback: (progress: any) => void) => () => void
  onExtractProgress: (callback: (progress: any) => void) => () => void

  // 프로젝트 정보 API
  getProjectInfo: () => Promise<ProjectInfo>

  // studio.ini 설정값 API
  getStudioIniValues: () => Promise<StudioIniValues>

  // 환경 설정 API
  getEnvironments: () => Promise<Environment[]>

  // 메인 프로세스 로그 API
  onMainProcessLog: (callback: (log: MainProcessLog) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ApiInterface
  }
}
