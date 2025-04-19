import axios from 'axios'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as ini from 'ini'
import { Logger } from './logger'

// 로그 인스턴스 가져오기
const logger = Logger.getInstance()

// API 응답 인터페이스 정의
export interface ProjectInfo {
  projectId: string
  version: string
  theme: {
    backgroundColor: string
    fontColor: string
    logoUrl: string
  }
}

// 기본 테마값 정의
const DEFAULT_PROJECT_INFO: ProjectInfo = {
  projectId: 'default-project',
  version: '1.0.0',
  theme: {
    backgroundColor: '#000000',
    fontColor: '#ffffff',
    logoUrl: ''
  }
}

/**
 * 프로젝트 정보를 API에서 가져오는 함수
 * @param projectId 프로젝트 ID (선택적)
 * @param isBeta 베타 서버 사용 여부 (선택적)
 */
export async function getProjectInfo(projectId?: string, isBeta?: boolean): Promise<ProjectInfo> {
  try {
    logger.info('API', '프로젝트 정보 가져오기 요청', { projectId, isBeta })

    // API URL 설정 (환경에 따라 다른 URL 사용)
    const apiBaseUrl = isBeta
      ? 'https://beta-api.example.com/api'
      : 'https://api.example.com/api'

    // 프로젝트 ID가 제공된 경우 URL에 추가
    const apiUrl = projectId
      ? `${apiBaseUrl}/project-info/${projectId}`
      : `${apiBaseUrl}/project-info`

    logger.debug('API', 'API 요청 URL', { url: apiUrl })

    const response = await axios.get<ProjectInfo>(apiUrl, {
      timeout: 5000 // 5초 타임아웃 설정
    })

    // 응답에서 필수 필드 검증 및 필드가 없는 경우 기본값으로 대체
    const data = response.data || {}
    const projectInfo: ProjectInfo = {
      projectId: data.projectId || projectId || DEFAULT_PROJECT_INFO.projectId,
      version: data.version || DEFAULT_PROJECT_INFO.version,
      theme: {
        backgroundColor: data.theme?.backgroundColor || DEFAULT_PROJECT_INFO.theme.backgroundColor,
        fontColor: data.theme?.fontColor || DEFAULT_PROJECT_INFO.theme.fontColor,
        logoUrl: data.theme?.logoUrl || DEFAULT_PROJECT_INFO.theme.logoUrl
      }
    }

    logger.info('API', '프로젝트 정보 가져오기 성공', { projectId: projectInfo.projectId })

    // 프로젝트 정보를 ini 파일로 저장
    saveProjectInfoToIni(projectInfo)

    return projectInfo
  } catch (error) {
    logger.error('API', '프로젝트 정보 가져오기 실패', { projectId, error })

    // 기본값에 제공된 프로젝트 ID 사용
    if (projectId) {
      return {
        ...DEFAULT_PROJECT_INFO,
        projectId
      }
    }

    return DEFAULT_PROJECT_INFO
  }
}

/**
 * 프로젝트 정보를 ini 파일로 저장하는 함수
 */
function saveProjectInfoToIni(projectInfo: ProjectInfo): void {
  try {
    const userDataPath = app.getPath('userData')
    const iniFilePath = path.join(userDataPath, 'project-info.ini')

    const iniContent = {
      project: {
        projectId: projectInfo.projectId,
        version: projectInfo.version
      }
    }

    // 디렉토리가 없는 경우 생성
    const dirPath = path.dirname(iniFilePath)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    const iniString = ini.stringify(iniContent)
    fs.writeFileSync(iniFilePath, iniString, 'utf-8')
    console.log('프로젝트 정보 ini 파일로 저장 완료:', iniFilePath)
  } catch (error) {
    console.error('프로젝트 정보 ini 파일로 저장 실패:', error)
    // 실패해도 앱은 계속 동작하도록 예외를 던지지 않음
  }
}
