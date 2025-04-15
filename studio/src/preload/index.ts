import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 설정 저장 함수
  saveSettings: (settings: string): Promise<any> => {
    return ipcRenderer.invoke('save-settings', settings)
  },

  // 설정 불러오기 함수
  loadSettings: (): Promise<string | null> => {
    return ipcRenderer.invoke('load-settings')
  },

  // S3 파일 업로드 함수
  uploadFileToS3: (filePath: string, bucket: string, key: string): Promise<any> => {
    return ipcRenderer.invoke('upload-to-s3', { filePath, bucket, key })
  },

  // 파일 선택 대화상자 열기
  selectFile: (options?: any): Promise<string[]> => {
    return ipcRenderer.invoke('select-file', options)
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
