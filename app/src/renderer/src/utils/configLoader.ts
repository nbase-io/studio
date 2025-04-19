/**
 * studio.ini 파일에서 설정값을 가져오는 유틸리티 함수
 */

interface StudioIniValues {
  PROJECT_ID: string
  BETA: number
  isBeta: boolean
}

/**
 * studio.ini 파일에서 PROJECT_ID와 BETA 값을 가져옴
 * @returns Promise<StudioIniValues> studio.ini 설정값
 */
export async function getStudioIniValues(): Promise<StudioIniValues> {
  try {
    return await window.api.getStudioIniValues();
  } catch (error) {
    console.error('studio.ini 파일을 읽는 중 오류 발생:', error);
    // 기본값 반환
    return {
      PROJECT_ID: 'default',
      BETA: 0,
      isBeta: false
    };
  }
}

/**
 * studio.ini에서 PROJECT_ID 값 가져오기
 * @returns Promise<string> PROJECT_ID 값
 */
export async function getProjectId(): Promise<string> {
  const values = await getStudioIniValues();
  return values.PROJECT_ID;
}

/**
 * studio.ini에서 BETA 값 가져오기
 * @returns Promise<boolean> BETA 값 (boolean으로 변환)
 */
export async function isBetaMode(): Promise<boolean> {
  const values = await getStudioIniValues();
  return values.isBeta;
}
