import { useState } from 'react'
import Versions from '@/components/Versions'
import Settings from '@/components/Settings'
import DesignEditor from '@/components/DesignEditor'

function App(): JSX.Element {
  const [activePage, setActivePage] = useState<'versions' | 'settings' | 'design'>('versions')

  const renderContent = () => {
    switch (activePage) {
      case 'versions':
        return <Versions />
      case 'settings':
        return <Settings />
      case 'design':
        return <DesignEditor />
      default:
        return <Versions />
    }
  }

  return (
    <div className="h-screen w-full flex bg-background">
      {/* 왼쪽 사이드바 - 아이콘만 표시 */}
      <div className="w-14 h-full bg-[#1e1e2d] flex flex-col items-center pt-4">
        {/* 아이콘 버튼 - 빌드 */}
        <button
          className={`w-10 h-10 mb-3 rounded flex items-center justify-center transition-colors ${
            activePage === 'versions' ? 'bg-blue-600' : 'bg-transparent hover:bg-[#2e2e3d]'
          }`}
          onClick={() => setActivePage('versions')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </button>

        {/* 런처 아이콘 버튼 */}
        <button
          className={`w-10 h-10 mb-3 rounded flex items-center justify-center transition-colors ${
            activePage === 'design' ? 'bg-blue-600' : 'bg-transparent hover:bg-[#2e2e3d]'
          }`}
          onClick={() => setActivePage('design')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <path d="M9 3v18" />
            <path d="M14 8h5" />
            <path d="M14 12h5" />
            <path d="M14 16h5" />
          </svg>
        </button>

        {/* 아이콘 버튼 - TV/설정 */}
        <button
          className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${
            activePage === 'settings' ? 'bg-blue-600' : 'bg-transparent hover:bg-[#2e2e3d]'
          }`}
          onClick={() => setActivePage('settings')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
          </svg>
        </button>
      </div>

      {/* 오른쪽 콘텐츠 영역 */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  )
}

export default App
