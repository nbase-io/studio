import React, { useState } from 'react'
import Builds from './components/Builds'
import Settings from './components/Settings'
import DesignEditor from './components/DesignEditor'
import FileManager from './components/FileManager'
import { ErrorDialogProvider, useErrorDialog, setErrorDialogFunction } from './components/ErrorDialog'

// ErrorDialog를 사용하는 내부 컴포넌트
function AppContent(): JSX.Element {
  const [activePage, setActivePage] = useState<string>('builds')
  const { showError } = useErrorDialog();

  // 전역 에러 함수 설정
  React.useEffect(() => {
    setErrorDialogFunction(showError);
    return () => setErrorDialogFunction(() => {});
  }, [showError]);

  const renderContent = () => {
    switch (activePage) {
      case 'builds':
        return <Builds />
      case 'settings':
        return <Settings />
      case 'design':
        return <DesignEditor />
      case 'files':
        return <FileManager />
      default:
        return <Builds />
    }
  }

  return (
    <div className="h-screen flex">
      {/* 왼쪽 사이드바 메뉴 */}
      <div className="w-16 border-r flex flex-col items-center py-4 bg-gray-50">
        <button
          className={`p-2 rounded-md flex items-center justify-center mb-4 ${
            activePage === 'builds' ? 'bg-gray-200' : ''
          }`}
          onClick={() => setActivePage('builds')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </button>
        <button
          className={`p-2 rounded-md flex items-center justify-center mb-4 ${
            activePage === 'design' ? 'bg-gray-200' : ''
          }`}
          onClick={() => setActivePage('design')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </button>
        <button
          className={`p-2 rounded-md flex items-center justify-center mb-4 ${
            activePage === 'files' ? 'bg-gray-200' : ''
          }`}
          onClick={() => setActivePage('files')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </button>
        <button
          className={`p-2 rounded-md flex items-center justify-center mb-4 ${
            activePage === 'settings' ? 'bg-gray-200' : ''
          }`}
          onClick={() => setActivePage('settings')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col">
        {renderContent()}
      </div>
    </div>
  )
}

// 루트 App 컴포넌트: ErrorDialogProvider로 래핑
function App(): JSX.Element {
  return (
    <ErrorDialogProvider>
      <AppContent />
    </ErrorDialogProvider>
  )
}

export default App
