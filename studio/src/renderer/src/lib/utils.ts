import { ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines multiple class values into a single string, merging Tailwind classes efficiently.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

  // S3 파일 업로드 함수 추가
export const generateMD5Hash = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async function(event) {
        if (!event.target || !event.target.result) {
          reject(new Error('Failed to read file'));
          return;
        }

        try {
          const buffer = event.target.result as ArrayBuffer;

          // Web Crypto API 사용
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);

          // ArrayBuffer를 16진수 문자열로 변환
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          resolve(hashHex);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
  };
  // S3 설정 가져오기 함수
  export const getS3Config = async () => {
    try {
      if (!window.api || typeof window.api.getS3Config !== 'function') {
        console.error('window.api.getS3Config 함수가 정의되지 않았습니다.');

        // localStorage에서 정보 가져오기 (대체 방법)
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return {
          bucket: settings.bucketName || 'my-default-bucket',
          accessKeyId: settings.accessKey || '',
          secretAccessKey: settings.secretKey || '',
          region: settings.region || 'ap-northeast-2',
          cdnUrl: settings.cdnUrl || ''
        };
      }

      const config = await window.api.getS3Config();
      if (!config) {
        throw new Error('S3 설정을 가져오지 못했습니다');
      }

      return config;
    } catch (error) {
      console.error('S3 설정 가져오기 오류:', error);
      toast({
        title: 'S3 설정 오류',
        description: '설정을 가져오는 중 오류가 발생했습니다. 기본값을 사용합니다.'
      });

      // 오류 발생 시 기본값 반환
      return {
        bucket: 'my-default-bucket',
        accessKeyId: '',
        secretAccessKey: '',
        region: 'ap-northeast-2',
        cdnUrl: ''
      };
    }
  };
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
