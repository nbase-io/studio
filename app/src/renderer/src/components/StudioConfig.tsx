import { useState, useEffect } from 'react'
import { getStudioIniValues } from '../utils/configLoader'

interface StudioIniValues {
  PROJECT_ID: string
  BETA: number
  isBeta: boolean
}

/**
 * studio.ini 설정값을 보여주는 컴포넌트
 */
export default function StudioConfig(): JSX.Element {
  const [config, setConfig] = useState<StudioIniValues | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        setLoading(true)
        const iniValues = await getStudioIniValues()
        setConfig(iniValues)
        setError(null)
      } catch (err) {
        console.error('설정 로드 실패:', err)
        setError('설정을 로드하는 중 오류가 발생했습니다.')
        setConfig(null)
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [])

  if (loading) {
    return <div>설정을 로드하는 중...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  if (!config) {
    return <div>설정을 찾을 수 없습니다.</div>
  }

  return (
    <div className="studio-config">
      <h2>Studio 설정</h2>
      <div className="config-item">
        <div className="config-label">Project ID:</div>
        <div className="config-value">{config.PROJECT_ID}</div>
      </div>
      <div className="config-item">
        <div className="config-label">Beta 모드:</div>
        <div className="config-value">{config.isBeta ? '활성화됨' : '비활성화됨'}</div>
      </div>
    </div>
  )
}
