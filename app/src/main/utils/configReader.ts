import fs from 'fs'
import path from 'path'
import { Logger } from './logger'

// 로그 인스턴스 가져오기
const logger = Logger.getInstance()

interface Config {
  PROJECT_ID: string
  BETA: number
  API_KEY?: string  // API 키 (선택적)
}

/**
 * studio.ini 파일에서 설정값을 읽어옵니다.
 * @returns Config 객체
 */
export function readConfig(): Config {
  try {
    // 애플리케이션 루트 경로
    const appPath = path.join(__dirname, '../../')
    const iniPath = path.join(appPath, 'studio.ini')

    // studio.ini 파일이 없는 경우 app 디렉토리 내에서 검색
    console.log('iniPath', iniPath)
    let configPath = fs.existsSync(iniPath)
      ? iniPath
      : path.join(appPath, './studio.ini')

    // 파일 존재 확인
    if (!fs.existsSync(configPath)) {
      logger.error('Config', 'studio.ini 파일을 찾을 수 없습니다', { searchPath: configPath })
      throw new Error('studio.ini 파일을 찾을 수 없습니다')
    }

    // 파일 내용 읽기
    const fileContent = fs.readFileSync(configPath, 'utf-8')
    const lines = fileContent.split('\n')

    // 설정값 파싱
    const config: Partial<Config> = {}

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith(';')) {
        continue // 주석 및 빈 줄 무시
      }

      const [key, value] = trimmedLine.split('=')
      if (key && value !== undefined) {
        const trimmedKey = key.trim()
        const trimmedValue = value.trim()

        // BETA 값은 숫자로 변환
        if (trimmedKey === 'BETA') {
          config[trimmedKey as keyof Config] = parseInt(trimmedValue, 10) as any
        } else {
          config[trimmedKey as keyof Config] = trimmedValue as any
        }
      }
    }

    logger.info('Config', 'studio.ini 파일 로드 완료', { path: configPath })

    // 필수 설정값 확인
    if (!config.PROJECT_ID) {
      logger.error('Config', 'PROJECT_ID 설정을 찾을 수 없습니다')
      throw new Error('PROJECT_ID 설정을 찾을 수 없습니다')
    }

    return config as Config
  } catch (error) {
    logger.error('Config', 'studio.ini 파일 로드 실패', { error })
    throw error
  }
}

// 단일 설정값 가져오기
export function getConfigValue<K extends keyof Config>(key: K): Config[K] {
  const config = readConfig()
  return config[key]
}
