// 환경 설정 인터페이스 추가
import { readConfig } from './configReader'

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  buttonText: string
  border: string
}

export interface ThemeConfig {
  colors: ThemeColors
  backgroundImage: string
  titleColor: string
}
export interface Environment {
  id?: string;
  data: ThemeConfig;
  createdAt?: string;
  updatedAt?: string;
}


export class ApiService {
  private baseUrl: string;
  private projectId: string;
  private apiKey: string;  // apiKey 필드 추가

  constructor() {
    // this.baseUrl = 'https://plugin.gamepot.ntruss.com';
    this.baseUrl = 'http://localhost:4040';
    this.projectId = 'default';
    this.apiKey = '';  // 기본값 초기화

    // ini 파일에서 설정 로드 시도
    this.loadSettings();
  }

  /**
   * studio.ini 파일에서 설정 로드
   */
  private loadSettings(): void {
    try {
      // import로 미리 가져온 readConfig 함수 사용
      const config = readConfig();

      // PROJECT_ID 설정
      if (config && config.PROJECT_ID) {
        this.projectId = config.PROJECT_ID;
        console.log(`[ApiService] PROJECT_ID를 설정했습니다: ${this.projectId}`);
      } else {
        console.warn('[ApiService] studio.ini에서 PROJECT_ID를 찾을 수 없습니다. 기본값을 사용합니다.');
      }

      // API_KEY가 있다면 설정 (선택적)
      if (config && config.API_KEY) {
        this.apiKey = config.API_KEY;
      }
    } catch (error) {
      console.error('[ApiService] studio.ini 파일 로드 실패:', error);
    }
  }

  /**
   * 요청 URL 생성
   */
  private getUrl(endpoint: string): string {
    return `${this.baseUrl}/v1/${endpoint}`;
  }

  /**
   * API 요청 헤더 생성
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PROJECT-ID': this.projectId
    };

    // API 키가 있으면 추가
    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Generic request method for API calls with timeout
   */
  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    timeoutMs: number = 10000 // 10초 타임아웃
  ): Promise<T> {
    const url = this.getUrl(endpoint);
    console.log(url)
    console.log(`API request: ${method} ${url}`);

    // 캐시 방지를 위한 헤더 추가
    const headers: HeadersInit = {
      ...this.getHeaders(),
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-PROJECT-ID': this.projectId,
    };

    const options: RequestInit = {
      method,
      headers,
      mode: 'cors',
      credentials: 'same-origin',
      cache: 'no-store', // 캐시 사용 안함
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      // 타임아웃을 위한 Promise.race 사용
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      const fetchPromise = fetch(url, options);
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      console.log(`API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error response: ${errorText}`);
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      // Handle both JSON and empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json() as T;
        console.log('API response data:', data);
        return data;
      }

      return {} as T;
    } catch (error) {
      console.error('API request failed:', {
        error,
        url,
        method,
        message: error instanceof Error ? error.message : String(error)
      });

      // CORS or network-related error details display
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('Network or CORS error occurred. Please check if the server is running and CORS settings are correct.');
        console.error(`Server URL: ${this.baseUrl}`);
        console.error('Current Origin:', window.location.origin);
      }

      throw error;
    }
  }

  /**
   * Fetch environments from API
   */
  async getEnvironments(): Promise<Environment[]> {
    try {
      const response = await this.request<Environment[] | { data: Environment[] }>('studio/environments');

      if (Array.isArray(response)) {
        return response;
      }
      console.log('response:', response);

      if (response && response.data) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('Error fetching environments:', error);
      return [];
    }
  }
}