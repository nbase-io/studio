/**
 * API client for communication with the build server
 */

/**
 * Build interface representing a game build
 */
export interface Build {
  id?: string;
  name: string;
  version: string;
  description?: string;
  size?: number;
  download_url?: string;
  status?: 'draft' | 'published' | 'archived' | 'development';
  createdAt?: string;
  updatedAt?: string;
  build_number?: number;
  platform?: string;
  build_path?: string;
  md5_hash?: string;
}

/**
 * Version file interface
 */
export interface VersionFile {
  id?: string;
  versionId?: string;
  name: string;
  size?: number;
  download_url: string;
  md5_hash?: string;
  createdAt?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  mimeType?: string;
  filePath?: string;
  originalName?: string;
}

/**
 * Version files collection interface - 서버에서 반환하는 형태에 맞게 정의
 */
export interface VersionFiles {
  totalCount: number;
  totalSize: number;
  files: VersionFile[];
}

/**
 * Version interface representing a build version
 */
export interface Version {
  id?: string;
  buildId: string;
  versionCode: string;
  versionName: string;
  description?: string;
  size?: number;
  download_url?: string;
  status?: 'draft' | 'published' | 'archived' | 'development';
  createdAt?: string;
  updatedAt?: string;
  build_number?: number;
  changeLog?: string;
  files?: VersionFiles;
}

import { showGlobalError } from '../components/ErrorDialog';

/**
 * API service for handling build-related operations
 */
export class ApiService {
  private baseUrl: string;
  private projectId: string;
  private apiKey: string;
  private cdnUrl: string;

  constructor() {
    // Default values, will be updated when loadSettings is called
    this.baseUrl = 'https://plugin.gamepot.ntruss.com';
    this.projectId = '';
    this.apiKey = '';
    this.cdnUrl = '';

    // Load settings when initialized
    this.loadSettings();
  }

  /**
   * Load API settings from localStorage
   */
  loadSettings(): void {
    const settingsStr = localStorage.getItem('settings');
    if (settingsStr) {
      try {
        const settings = JSON.parse(settingsStr);
        this.baseUrl = settings.serverUrl || this.baseUrl;
        this.projectId = settings.projectId || '';
        this.apiKey = settings.apiKey || '';
        this.cdnUrl = settings.cdnUrl || '';
        console.log('API settings loaded:', {
          serverUrl: this.baseUrl,
          cdnUrl: this.cdnUrl
        });
      } catch (error) {
        console.error('Failed to load API settings:', error);
      }
    }

    // Set default values if no settings
    if (!this.baseUrl) {
      this.baseUrl = 'https://plugin.gamepot.ntruss.com';
    }

    // Check URL format and modify
    if (!this.baseUrl.startsWith('http')) {
      this.baseUrl = `http://${this.baseUrl}`;
    }

    // Remove trailing slash if exists
    if (this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }

    // Format CDN URL if provided
    if (this.cdnUrl) {
      // Check URL format and modify
      if (!this.cdnUrl.startsWith('http')) {
        this.cdnUrl = `http://${this.cdnUrl}`;
      }

      // Remove trailing slash if exists
      if (this.cdnUrl.endsWith('/')) {
        this.cdnUrl = this.cdnUrl.slice(0, -1);
      }
    }
  }

  /**
   * Get CDN URL
   */
  getCdnUrl(): string {
    return this.cdnUrl;
  }

  /**
   * Set CDN URL
   */
  setCdnUrl(url: string): void {
    this.cdnUrl = url;
  }

  /**
   * Get request headers including auth credentials
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add authentication info only if available
    if (this.projectId) {
      headers['X-PROJECT-ID'] = this.projectId;
    }

    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Construct full URL to the API endpoint
   */
  private getUrl(endpoint: string): string {
    return `${this.baseUrl}/${endpoint}`;
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
    this.loadSettings(); // Reload settings to ensure we have the latest

    const url = this.getUrl(endpoint);
    console.log(`API request: ${method} ${url}`);

    // 캐시 방지를 위한 헤더 추가
    const headers: HeadersInit = {
      ...this.getHeaders(),
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-PROJECT-ID': this.projectId,
      'X-API-KEY': this.apiKey
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
   * Get a list of all builds
   */
  async getBuilds(): Promise<Build[]> {
    try {
      console.log('Fetching builds from API...');

      // 요청에 타임스탬프를 추가하여 캐시 방지
      const timestamp = new Date().getTime();
      const response = await this.request<Build[] | { totalCount: number; data: Build[] }>(`builds?_t=${timestamp}`);

      console.log('API response for builds:', response);

      // 응답이 직접 배열인지 확인
      if (Array.isArray(response)) {
        console.log(`직접 배열로 받은 빌드 ${response.length}개`);
        return response;
      }

      // 아니면 응답이 예상된 구조인지 확인
      if (!response || !response.data || !Array.isArray(response.data)) {

        return [];
      }

      console.log(`Successfully fetched ${response.data.length} builds`);
      return response.data;
    } catch (error) {
      console.error('Error in getBuilds:', error);

      // 서버 연결이 안 될 경우 기본 데이터 반환 (개발용)
      return [];
    }
  }

  /**
   * Get a single build by ID
   */
  async getBuild(id: string): Promise<Build> {
    try {
      const response = await this.request<Build | { data: Build }>(`/builds/${id}`);

      // 응답 구조 검증
      if (!response || typeof response !== 'object') {
        console.error('Invalid API response format:', response);
        throw new Error('Invalid API response format');
      }

      // response가 직접 Build 객체인지 또는 { data: Build } 형태인지 확인
      const build = 'data' in response ? response.data : response;

      // 유효한 빌드 객체인지 확인 (최소한 id 또는 name 필드가 있어야 함)
      if (!build || (typeof build !== 'object') || (!build.id && !build.name)) {
        console.error('Invalid build object in API response:', response);
        throw new Error('Build not found');
      }

      // Apply CDN URL to image and download URLs if CDN is configured
      if (this.cdnUrl && build.download_url) {
        // Replace download URL with CDN URL if exists
        if (!build.download_url.startsWith('http')) {
          build.download_url = `${this.cdnUrl}/${build.download_url.replace(/^\//, '')}`;
        }
      }

      return build as Build;
    } catch (error) {
      console.error('Error fetching build:', error);
      throw error;
    }
  }

  /**
   * Create a new build
   */
  async createBuild(buildData: Build): Promise<Build> {
    try {
      // 필요한 필드만 명시적으로 선택
      const newBuildData: Partial<Build> = {
        name: buildData.name,
        version: buildData.version,
      };

      // 선택적 필드들은 있을 경우에만 추가
      if (buildData.description !== undefined) newBuildData.description = buildData.description;
      if (buildData.size !== undefined) newBuildData.size = buildData.size;
      if (buildData.download_url !== undefined) newBuildData.download_url = buildData.download_url;
      if (buildData.status !== undefined) newBuildData.status = buildData.status;
      if (buildData.build_number !== undefined) newBuildData.build_number = buildData.build_number;
      if (buildData.platform !== undefined) newBuildData.platform = buildData.platform;
      if (buildData.build_path !== undefined) newBuildData.build_path = buildData.build_path;

      console.log('Creating build with fields:', newBuildData);

      // Actual server request
      const response = await this.request<Build | { data: Build }>('/builds', 'POST', newBuildData);

      // 응답 구조 검증
      if (!response || typeof response !== 'object') {
        console.error('Invalid API response format:', response);
        throw new Error('Invalid API response format');
      }

      // response가 직접 Build 객체인지 또는 { data: Build } 형태인지 확인
      const newBuild = 'data' in response ? response.data : response;

      // 유효한 빌드 객체인지 확인
      if (!newBuild || (typeof newBuild !== 'object') || (!newBuild.id && !newBuild.name)) {
        console.error('Invalid build object in API response:', response);
        throw new Error('Failed to create build');
      }

      // Apply CDN URL to image and download URLs if CDN is configured
      if (this.cdnUrl && newBuild.download_url) {
        // Replace download URL with CDN URL if exists
        if (!newBuild.download_url.startsWith('http')) {
          newBuild.download_url = `${this.cdnUrl}/${newBuild.download_url.replace(/^\//, '')}`;
        }
      }

      return newBuild as Build;
    } catch (error) {
      console.warn('Failed to create build on server. Creating virtual build on client.', error);
      throw error;
    }
  }

  /**
   * Update an existing build
   */
  async updateBuild(id: string, buildData: Partial<Build>): Promise<Build> {
    try {
      // 업데이트할 필드만 명시적으로 선택하여 요청
      // 서버에서 허용하는 필드만 포함
      const updateFields: Partial<Build> = {};

      // 필수 필드
      if (buildData.name !== undefined) updateFields.name = buildData.name;
      if (buildData.version !== undefined) updateFields.version = buildData.version;

      // 선택적 필드들
      if (buildData.description !== undefined) updateFields.description = buildData.description;
      if (buildData.size !== undefined) updateFields.size = buildData.size;
      if (buildData.download_url !== undefined) updateFields.download_url = buildData.download_url;
      if (buildData.status !== undefined) updateFields.status = buildData.status;
      if (buildData.build_number !== undefined) updateFields.build_number = buildData.build_number;

      // 플랫폼 필드 검증
      if (buildData.platform !== undefined) {
        const allowedPlatforms = ['windows', 'mac', 'web', 'android', 'ios', 'xbox', 'playstation4', 'playstation5', 'steam'];
        if (allowedPlatforms.includes(buildData.platform)) {
          updateFields.platform = buildData.platform;
        } else {
          console.warn(`Invalid platform '${buildData.platform}'. Defaulting to 'android'. Valid platforms are: ${allowedPlatforms.join(', ')}`);
          updateFields.platform = 'android';
        }
      }

      if (buildData.build_path !== undefined) updateFields.build_path = buildData.build_path;

      console.log('Updating build with fields:', updateFields);

      const response = await this.request<Build | { data: Build }>(`/builds/${id}`, 'PUT', updateFields);

      // 응답 구조 검증
      if (!response || typeof response !== 'object') {
        console.error('Invalid API response format:', response);
        throw new Error('Invalid API response format');
      }

      // response가 직접 Build 객체인지 또는 { data: Build } 형태인지 확인
      const updatedBuild = 'data' in response ? response.data : response;

      // 유효한 빌드 객체인지 확인 (없으면 buildData로 대체)
      if (!updatedBuild || (typeof updatedBuild !== 'object')) {
        console.error('Invalid build object in API response:', response);
        // 서버에서 반환받은 응답에 유효한 데이터가 없는 경우 buildData로 대체
        return { ...buildData, id } as Build;
      }

      // Apply CDN URL to image and download URLs if CDN is configured
      if (this.cdnUrl && updatedBuild.download_url) {
        // Replace download URL with CDN URL if exists
        if (!updatedBuild.download_url.startsWith('http')) {
          updatedBuild.download_url = `${this.cdnUrl}/${updatedBuild.download_url.replace(/^\//, '')}`;
        }
      }

      return updatedBuild as Build;
    } catch (error) {
      console.error('Build update failed:', error);
      throw error;
    }
  }

  /**
   * Delete a build
   */
  async deleteBuild(id: string): Promise<void> {
    await this.request<void>(`/builds/${id}`, 'DELETE');
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.request('/');
      return { success: true, message: 'Server connection success' };
    } catch (error) {
      console.error('Server connection test failed:', error);
      return {
        success: false,
        message: `Server connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get versions for a build
   */
  async getVersions(buildId: string, page: number = 1, limit: number = 10): Promise<{ totalCount: number; versions: Version[] }> {
    try {
      const timestamp = new Date().getTime();
      const response = await this.request<{ totalCount: number; data: Version[] }>(`builds/${buildId}/versions?page=${page}&limit=${limit}&_t=${timestamp}`);

      if (!response || !response.data) {
        console.error('API response is not in expected format:', response);
        return { totalCount: 0, versions: [] };
      }

      // Apply CDN URL to download URLs
      if (this.cdnUrl) {
        response.data.forEach(version => {
          if (version.download_url && !version.download_url.startsWith('http')) {
            version.download_url = `${this.cdnUrl}/${version.download_url.replace(/^\//, '')}`;
          }

          // Also apply to files if they exist
          if (version.files && Array.isArray(version.files.files)) {
            version.files.files.forEach(file => {
              if (file.download_url && !file.download_url.startsWith('http')) {
                file.download_url = `${this.cdnUrl}/${file.download_url.replace(/^\//, '')}`;
              }
            });
          }
        });
      }

      console.log(`Successfully fetched ${response.data.length} versions for build ${buildId}`);
      return { totalCount: response.totalCount, versions: response.data };
    } catch (error) {
      console.error(`Error in getVersions for build ${buildId}:`, error);

      // Return empty data on error
      return { totalCount: 0, versions: [] };
    }
  }

  /**
   * Get a specific version
   */
  async getVersion(buildId: string, versionId: string): Promise<Version> {
    try {
      const response = await this.request<{ data: Version }>(`builds/${buildId}/versions/${versionId}`);

      if (!response || !response.data) {
        throw new Error('Version not found');
      }

      const version = response.data;

      // Apply CDN URL to download URLs
      if (this.cdnUrl) {
        if (version.download_url && !version.download_url.startsWith('http')) {
          version.download_url = `${this.cdnUrl}/${version.download_url.replace(/^\//, '')}`;
        }

        // Also apply to files if they exist
        if (version.files && Array.isArray(version.files)) {
          version.files.forEach(file => {
            if (file.download_url && !file.download_url.startsWith('http')) {
              file.download_url = `${this.cdnUrl}/${file.download_url.replace(/^\//, '')}`;
            }
          });
        }
      }

      return version;
    } catch (error) {
      console.error(`Error fetching version ${versionId} for build ${buildId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new version
   */
  async createVersion(buildId: string, versionData: Partial<Version>): Promise<Version> {
    try {
      const response = await this.request<{ data: Version }>(`builds/${buildId}/versions`, 'POST', versionData);

      if (!response) {
        throw new Error(`Failed to create version: ${response}`);
      }

      const version = response.data;

      // Apply CDN URL to download URLs
      if (this.cdnUrl && version.download_url && !version.download_url.startsWith('http')) {
        version.download_url = `${this.cdnUrl}/${version.download_url.replace(/^\//, '')}`;
      }

      return version;
    } catch (error) {
      console.error('Failed to create version:', error);
      showGlobalError('버전 생성 실패', '새 버전을 생성하는데 실패했습니다.');
      throw error;
    }
  }

  /**
   * Update a version
   */
  async updateVersion(buildId: string, versionId: string, versionData: Partial<Version>): Promise<Version> {
    try {
      const response = await this.request<{ data: Version }>(`builds/${buildId}/versions/${versionId}`, 'PUT', versionData);

      console.log('updateVersion response:', response);
      if (!response) {
        throw new Error('Failed to update version');
      }

      const version = response.data;

      // Apply CDN URL to download URLs
      if (this.cdnUrl && version.download_url && !version.download_url.startsWith('http')) {
        version.download_url = `${this.cdnUrl}/${version.download_url.replace(/^\//, '')}`;
      }

      return version;
    } catch (error) {
      console.error(`Failed to update version ${versionId} for build ${buildId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a version
   */
  async deleteVersion(buildId: string, versionId: string): Promise<void> {
    try {
      await this.request<void>(`builds/${buildId}/versions/${versionId}`, 'DELETE');
    } catch (error) {
      console.error(`Failed to delete version ${versionId} for build ${buildId}:`, error);
      throw error;
    }
  }

  /**
   * Add a file to a version
   */
  async addFileToVersion(buildId: string, versionId: string, fileData: Partial<VersionFile>): Promise<VersionFile> {
    try {
      const response = await this.request<{ data: VersionFile }>(`builds/${buildId}/versions/${versionId}/files`, 'POST', fileData);

      if (!response) {
        console.error('Failed to add file to version');
        showGlobalError('파일 추가 실패', '버전에 파일을 추가하는데 실패했습니다.');
        throw new Error('Failed to add file to version');
      }

      const file = response.data;
      // Apply CDN URL to download URL
      if (this.cdnUrl && file?.download_url && !file?.download_url.startsWith('http')) {
        file.download_url = `${this.cdnUrl}/${file.download_url.replace(/^\//, '')}`;
      }

      return file;
    } catch (error) {
      console.error(`Failed to add file to version ${versionId} for build ${buildId}:`, error);
      showGlobalError('파일 추가 실패', `버전에 파일을 추가하는데 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Delete a file from a version
   */
  async deleteFileFromVersion(buildId: string, versionId: string, fileId: string): Promise<void> {
    try {
      await this.request<void>(`builds/${buildId}/versions/${versionId}/files/${fileId}`, 'DELETE');
    } catch (error) {
      console.error(`Failed to delete file ${fileId} from version ${versionId}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance of the API service
export const apiService = new ApiService();
