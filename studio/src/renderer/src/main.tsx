import './assets/main.css'

import React, { createContext, useContext, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// window.api 타입 정의
declare global {
  interface Window {
    api: {
      loadSettings: () => Promise<Record<string, unknown>>;
      saveSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      getS3Config: () => Promise<{ bucket: string; region: string; accessKeyId: string; secretAccessKey: string }>;
      listS3Files: (params: { bucket: string; prefix?: string }) => Promise<{
        files: Array<{ key: string; size: number; lastModified: Date }>;
        folders: string[];
        error?: string;
      }>;
      uploadFileToS3: (params: {
        filePath: string;
        bucket: string;
        key: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        region?: string;
      }) => Promise<{
        success: boolean;
        location?: string;
        error?: string;
      }>;
      deleteFileFromS3: (params: { bucket: string; key: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      selectFile: (options?: {
        title?: string;
        defaultPath?: string;
        buttonLabel?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: Array<string>;
      }) => Promise<string[]>;
      openDevTools: () => void;
      saveTempFile: (params: { buffer: ArrayBuffer; fileName: string }) => Promise<string>;
      deleteTempFile: (params: { filePath: string }) => Promise<{ success: boolean; error?: string }>;
      on: (channel: string, listener: (...args: any[]) => void) => any;
      off: (channel: string, listener: (...args: any[]) => void) => any;
      checkForUpdates: () => Promise<void>;
      quitApp: () => void;
      forceQuit: () => void;
    }
  }
}

// 설정 컨텍스트 타입 정의
interface Settings {
  accessKey: string;
  secretKey: string;
  region: string;
  s3Bucket: string;
  projectId: string;
  apiKey: string;
  serverUrl: string;
  cdnUrl: string;
  [key: string]: unknown; // 인덱스 시그니처 추가
}

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  loadFailed: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (newSettings: Settings) => Promise<boolean>;
}

// 기본 설정 값
const defaultSettings: Settings = {
  accessKey: '',
  secretKey: '',
  region: 'ap-northeast-2',
  s3Bucket: '',
  projectId: '',
  apiKey: '',
  serverUrl: 'https://plugin.gamepot.ntruss.com',
  cdnUrl: ''
}

// 설정 컨텍스트 생성
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 설정 공급자 컴포넌트
function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // 설정 로드 함수
  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);

      if (!window.api || !window.api.loadSettings) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const savedSettings = await window.api.loadSettings();

      if (savedSettings) {
        setSettings(prev => ({
          ...prev,
          ...savedSettings as Settings
        }));
      } else {
        setLoadFailed(true);
      }
    } catch (error: any) {
      setLoadFailed(true);
      console.error('설정 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 설정 저장 함수
  const saveSettings = async (newSettings: Settings): Promise<boolean> => {
    try {
      if (!window.api || !window.api.saveSettings) {
        console.error('saveSettings: window.api or saveSettings function is not available');
        return false;
      }

      console.log('main.tsx: Saving settings with region:', newSettings.region);
      setSettings(newSettings);

      // 명시적인 타입 변환을 사용하여 Record<string, unknown> 타입으로 변환
      const settingsRecord: Record<string, unknown> = { ...newSettings };
      const result = await window.api.saveSettings(settingsRecord);

      if (!result.success) {
        console.error('Settings save failed:', result.error);
      }

      return result.success;
    } catch (error: any) {
      console.error('설정 저장 오류:', error);
      return false;
    }
  };

  // 앱 시작 시 즉시 설정 로드
  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, loadFailed, loadSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// 설정 컨텍스트 사용 훅
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// 앱을 SettingsProvider로 감싸서 렌더링
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
)
