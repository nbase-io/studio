/// <reference types="vite/client" />

interface Window {
  api: {
    shell: {
      openExternal: (url: string) => void;
    };
    loadSettings: () => Promise<Record<string, unknown>>;
    saveSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
    getAppVersion: () => Promise<{ version: string }>;
    quitApp: () => void;
    getS3Config: () => Promise<any>;
    listS3Files: (params: { bucket: string; prefix?: string }) => Promise<any>;
    uploadFileToS3: (params: any) => Promise<any>;
    cancelUpload: () => Promise<any>;
    addFileToVersion: (params: { versionId: string; fileName: string; fileUrl: string; fileSize: number }) => Promise<any>;
    deleteFileFromS3: (params: any) => Promise<any>;
    renameFileInS3: (params: { bucket: string; oldKey: string; newKey: string }) => Promise<any>;
    selectSaveLocation: (params: { defaultPath?: string }) => Promise<string | null>;
    downloadFileFromS3: (params: { bucket: string; key: string; destination: string }) => Promise<any>;
    saveTempFile: (params: { buffer: ArrayBuffer; fileName: string }) => Promise<any>;
    createTempFile: (params: { fileName: string; totalSize: number }) => Promise<any>;
    appendToTempFile: (params: { filePath: string; buffer: ArrayBuffer; offset: number }) => Promise<any>;
    deleteTempFile: (params: { filePath: string }) => Promise<any>;
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
    }) => Promise<string[]>;
    openDevTools: () => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
    off: (channel: string, func: (...args: any[]) => void) => void;
    checkForUpdates: () => Promise<void>;
  };
}
