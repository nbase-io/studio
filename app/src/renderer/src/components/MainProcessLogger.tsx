import { useEffect, useState } from 'react'

interface MainProcessLog {
  type: 'log' | 'error' | 'warn' | 'info'
  message: string
  timestamp: string
}

/**
 * 메인 프로세스의 로그를 화면에 표시하는 컴포넌트
 */
export default function MainProcessLogger(): JSX.Element {
  const [logs, setLogs] = useState<MainProcessLog[]>([])
  const maxLogs = 1000 // 최대 로그 수 제한

  useEffect(() => {
    // 페이지 로드 시 로그 컴포넌트 활성화 메시지
    setLogs([
      {
        type: 'info',
        message: '메인 프로세스 로그 모니터링 시작',
        timestamp: new Date().toISOString()
      }
    ])

    // 메인 프로세스 로그 수신 이벤트 리스너 등록
    const unsubscribe = window.api.onMainProcessLog((log) => {
      setLogs((prevLogs) => {
        // 현재 시간 추가
        const newLog = {
          ...log,
          timestamp: new Date().toISOString()
        }

        // 최대 개수 제한
        const updatedLogs = [newLog, ...prevLogs]
        if (updatedLogs.length > maxLogs) {
          return updatedLogs.slice(0, maxLogs)
        }
        return updatedLogs
      })

      // 콘솔에 출력 (렌더러 콘솔에서도 확인 가능하도록)
      switch (log.type) {
        case 'error':
          console.error('[Main]', log.message)
          break
        case 'warn':
          console.warn('[Main]', log.message)
          break
        case 'info':
          console.info('[Main]', log.message)
          break
        default:
          console.log('[Main]', log.message)
      }
    })

    // 컴포넌트 언마운트 시 이벤트 리스너 해제
    return () => {
      unsubscribe()
    }
  }, [])

  // 로그가 없는 경우
  if (logs.length === 0) {
    return <div>로그가 없습니다.</div>
  }

  return (
    <div className="main-process-logger">
      <h3>메인 프로세스 로그</h3>
      <div className="log-container" style={{ maxHeight: '300px', overflowY: 'auto', padding: '8px', border: '1px solid #ccc' }}>
        {logs.map((log, index) => {
          // 로그 타입에 따른 스타일 설정
          let style = {}
          switch (log.type) {
            case 'error':
              style = { color: 'red' }
              break
            case 'warn':
              style = { color: 'orange' }
              break
            case 'info':
              style = { color: 'blue' }
              break
            default:
              style = { color: 'black' }
          }

          // 시간 포맷팅
          const time = new Date(log.timestamp).toLocaleTimeString()

          return (
            <div key={index} style={{ ...style, marginBottom: '4px', fontFamily: 'monospace' }}>
              <span style={{ opacity: 0.7 }}>[{time}]</span> {log.message}
            </div>
          )
        })}
      </div>
    </div>
  )
}
