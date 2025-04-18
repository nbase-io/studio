import { contextBridge, ipcRenderer, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 설정 저장 함수
  saveSettings: (settings: Record<string, unknown>): Promise<any> => {
    console.log('Preload: saveSettings called with:', {
      type: typeof settings,
      keys: Object.keys(settings),
      regionValue: settings.region
    });
    return ipcRenderer.invoke('save-settings', settings)
  },

  // 설정 로드 함수
  loadSettings: (): Promise<any> => {
    return ipcRenderer.invoke('load-settings')
  },

  // 앱 버전 가져오기
  getAppVersion: (): Promise<any> => {
    return ipcRenderer.invoke('get-app-version')
  },

  // 앱 종료 함수
  quitApp: (): void => {
    console.log('Sending quit-app event to main process');
    // 여러 번 보내서 확실하게 처리
    ipcRenderer.send('quit-app');
    setTimeout(() => ipcRenderer.send('quit-app'), 100);

    // 백업 방법 - process.exit 호출 (remote 모듈이 활성화된 경우)
    try {
      const remote = require('@electron/remote');
      if (remote) {
        setTimeout(() => {
          console.log('Fallback: Using remote to exit app');
          remote.app.exit(0);
        }, 200);
      }
    } catch (e) {
      console.log('Remote module not available for fallback exit');
    }
  },

  // 앱 강제 종료 함수
  forceQuit: (): void => {
    console.log('Sending force-quit event to main process');
    ipcRenderer.send('force-quit');
  },

  // shell API 추가
  shell: {
    openExternal: (url: string) => shell.openExternal(url)
  },

  // S3 설정 가져오기
  getS3Config: (): Promise<any> => ipcRenderer.invoke('get-s3-config'),

  // S3 파일 목록 가져오기
  listS3Files: (params: { bucket: string; prefix?: string }): Promise<any> => {
    return ipcRenderer.invoke('list-s3-files', params)
  },

  // S3 파일 업로드
  uploadFileToS3: (params: any): Promise<any> => ipcRenderer.invoke('upload-file-to-s3', params),

  // 업로드 취소
  cancelUpload: (): Promise<any> => ipcRenderer.invoke('cancel-upload'),

  // 파일을 버전에 추가 (임시 구현 - 나중에 실제 데이터베이스 연동으로 변경 필요)
  addFileToVersion: (params: { versionId: string; fileName: string; fileUrl: string; fileSize: number }): Promise<any> => {
    console.log('파일을 버전에 추가:', params);
    // 실제 구현에서는 데이터베이스에 파일 정보를 저장해야 함
    // 현재는 성공 응답만 반환
    return Promise.resolve({ success: true });
  },

  // S3 파일 삭제
  deleteFileFromS3: (params: any): Promise<any> => ipcRenderer.invoke('delete-file-from-s3', params),

  // S3 파일 이름 변경
  renameFileInS3: (params: { bucket: string; oldKey: string; newKey: string }): Promise<any> => {
    return ipcRenderer.invoke('rename-file-in-s3', params)
  },

  // 파일 저장 위치 선택 대화상자 열기
  selectSaveLocation: (params: { defaultPath?: string }): Promise<string | null> => {
    return ipcRenderer.invoke('select-save-location', params)
  },

  // S3 파일 다운로드
  downloadFileFromS3: (params: { bucket: string; key: string; destination: string }): Promise<any> => {
    return ipcRenderer.invoke('download-file-from-s3', params)
  },

  // 임시 파일 생성 (파일 업로드용)
  saveTempFile: (params: { buffer: ArrayBuffer; fileName: string }): Promise<any> => {
    console.log('Invoking save-temp-file with params:', { fileName: params.fileName, bufferSize: params.buffer.byteLength });
    return ipcRenderer.invoke('save-temp-file', params)
  },

  // 빈 임시 파일 생성 (대용량 파일용)
  createTempFile: (params: { fileName: string; totalSize: number }): Promise<any> => {
    console.log('Invoking create-temp-file:', params);
    return ipcRenderer.invoke('create-temp-file', params)
  },

  // 임시 파일에 데이터 추가
  appendToTempFile: (params: { filePath: string; buffer: ArrayBuffer; offset: number }): Promise<any> => {
    console.log('Invoking append-to-temp-file:', { filePath: params.filePath, bufferSize: params.buffer.byteLength, offset: params.offset });
    return ipcRenderer.invoke('append-to-temp-file', params)
  },

  // 임시 파일 삭제
  deleteTempFile: (params: { filePath: string }): Promise<any> => {
    return ipcRenderer.invoke('delete-temp-file', params)
  },

  // 파일 선택 대화상자 열기
  selectFile: (options?: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: Array<
      | 'openFile'
      | 'openDirectory'
      | 'multiSelections'
      | 'showHiddenFiles'
      | 'createDirectory'
      | 'promptToCreate'
      | 'noResolveAliases'
      | 'treatPackageAsDirectory'
      | 'dontAddToRecent'
    >;
    message?: string;
  }): Promise<string[]> => {
    return ipcRenderer.invoke('select-file', options)
  },

  // 개발자 도구 열기
  openDevTools: (): void => {
    ipcRenderer.send('open-dev-tools')
  },

  // 이벤트 리스너 관리
  on: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['upload-progress', 'upload-cancelled', 'update-status'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
    }
    return null;
  },

  off: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['upload-progress', 'upload-cancelled', 'update-status'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.removeListener(channel, (event, ...args) => func(event, ...args));
    }
    return null;
  },

  // 업데이트 체크 요청
  checkForUpdates: (): Promise<void> => {
    return ipcRenderer.invoke('check-for-updates');
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
