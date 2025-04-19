import * as fs from 'fs'
import * as path from 'path'

/**
 * studio.ini 파일에서 특정 키의 값을 가져오는 함수
 * @param filePath ini 파일 경로
 * @param key 가져올 키 이름
 * @returns 키에 해당하는 값 또는 null
 */
function getIniValue(filePath: string, key: string): string | null {
  try {
    // 파일이 존재하는지 확인
    if (!fs.existsSync(filePath)) {
      console.error(`파일이 존재하지 않습니다: ${filePath}`)
      return null
    }

    // 파일 내용 읽기
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    // 키=값 형식으로 파싱
    for (const line of lines) {
      const trimmed = line.trim()

      // 빈 줄이나 주석은 건너뛰기
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue
      }

      const [currentKey, value] = trimmed.split('=')

      if (currentKey && currentKey.trim() === key && value !== undefined) {
        return value.trim()
      }
    }

    console.error(`키를 찾을 수 없습니다: ${key}`)
    return null
  } catch (error) {
    console.error(`오류 발생:`, error)
    return null
  }
}

/**
 * 메인 함수 - studio.ini 파일에서 PROJECT_ID와 BETA 값을 읽어오기
 */
function main(): void {
  // 현재 디렉토리를 기준으로 상대 경로 계산
  const appRootPath = path.join(__dirname, '../../../..')
  const iniPath = path.join(appRootPath, 'app/studio.ini')

  console.log(`studio.ini 파일 경로: ${iniPath}`)

  // PROJECT_ID 값 가져오기
  const projectId = getIniValue(iniPath, 'PROJECT_ID')
  console.log(`PROJECT_ID: ${projectId || 'Not Found'}`)

  // BETA 값 가져오기
  const beta = getIniValue(iniPath, 'BETA')
  console.log(`BETA: ${beta || 'Not Found'}`)
  console.log(`isBeta: ${beta === '1' ? 'true' : 'false'}`)
}

// 직접 실행되었을 때만 main 함수 호출
if (require.main === module) {
  main()
}

export { getIniValue }
