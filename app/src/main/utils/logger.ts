import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 로그 레벨 enum
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * 로그 메시지 인터페이스
 */
export interface LogMessage {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

/**
 * 로그 설정 인터페이스
 */
export interface LoggerOptions {
  // 로그 레벨 설정 (설정 레벨 이상만 출력)
  minLevel?: LogLevel;
  // 콘솔 출력 활성화
  enableConsole?: boolean;
  // 파일 출력 활성화
  enableFile?: boolean;
  // 서버 전송 활성화
  enableRemote?: boolean;
  // 서버 URL
  remoteUrl?: string;
  // 파일 저장 경로
  logDir?: string;
  // 최대 파일 크기 (바이트)
  maxFileSize?: number;
  // 앱 버전
  appVersion?: string;
}

/**
 * 로깅 시스템 클래스
 */
export class Logger {
  private static instance: Logger;
  private options: LoggerOptions;
  private logQueue: LogMessage[] = [];
  private isSending: boolean = false;
  private logFilePath: string;
  private lastFileSizeCheck: number = 0;

  private constructor(options: LoggerOptions = {}) {
    // 기본 옵션 설정
    this.options = {
      minLevel: LogLevel.INFO,
      enableConsole: true,
      enableFile: true,
      enableRemote: false,
      remoteUrl: '',
      logDir: path.join(app.getPath('userData'), 'logs'),
      maxFileSize: 10 * 1024 * 1024, // 10MB
      appVersion: app.getVersion(),
      ...options
    };

    // 로그 디렉토리 생성
    if (this.options.enableFile && this.options.logDir) {
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
    }

    // 로그 파일 경로 설정
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFilePath = path.join(this.options.logDir!, `app-${today}.log`);

    // 시작 로그
    this.info('System', '로깅 시스템 초기화됨', {
      version: this.options.appVersion,
      logFile: this.logFilePath
    });

    // 주기적으로 큐에 있는 로그 전송
    if (this.options.enableRemote) {
      setInterval(() => this.processQueue(), 5000);
    }
  }

  /**
   * 싱글톤 인스턴스 얻기
   */
  public static getInstance(options?: LoggerOptions): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  /**
   * 로그 설정 업데이트
   */
  public updateOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
    this.info('System', '로깅 설정이 업데이트되었습니다', this.options);
  }

  /**
   * 디버그 로그
   */
  public debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  /**
   * 정보 로그
   */
  public info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  /**
   * 경고 로그
   */
  public warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  /**
   * 에러 로그
   */
  public error(category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /**
   * 로그 메시지 생성 및 처리
   */
  private log(level: LogLevel, category: string, message: string, data?: any): void {
    // 최소 로그 레벨 확인
    if (!this.shouldLog(level)) return;

    // 로그 시간 생성
    const timestamp = new Date().toISOString();

    // 오류 객체 처리 (스택 트레이스 추출)
    let processedData = data;
    if (data instanceof Error) {
      processedData = {
        name: data.name,
        message: data.message,
        stack: data.stack
      };
    }

    // 로그 메시지 객체 생성
    const logMessage: LogMessage = {
      timestamp,
      level,
      category,
      message,
      data: processedData
    };

    // 콘솔 출력
    if (this.options.enableConsole) {
      this.writeToConsole(logMessage);
    }
    // 원격 서버 전송을 위한 큐에 추가
    if (this.options.enableRemote && this.options.remoteUrl) {
      this.logQueue.push(logMessage);

      // 에러는 즉시 전송
      if (level === LogLevel.ERROR) {
        this.processQueue();
      }
    }
  }

  /**
   * 로그 출력 여부 확인
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minLevelIndex = levels.indexOf(this.options.minLevel!);
    const currentLevelIndex = levels.indexOf(level);

    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * 콘솔에 로그 출력
   */
  private writeToConsole(logMessage: LogMessage): void {
    const { timestamp, level, category, message, data } = logMessage;
    const formattedTime = timestamp.split('T')[1].split('.')[0]; // HH:MM:SS

    // 로그 레벨에 따른 콘솔 메서드 선택
    let consoleMethod: (...args: any[]) => void;

    switch (level) {
      case LogLevel.ERROR:
        consoleMethod = console.error;
        break;
      case LogLevel.WARN:
        consoleMethod = console.warn;
        break;
      case LogLevel.DEBUG:
        consoleMethod = console.debug;
        break;
      default:
        consoleMethod = console.log;
    }

    // 로그 메시지 포맷
    const logPrefix = `[${formattedTime}] [${level}] [${category}]`;

    // 콘솔 출력 - 항상 stdout/stderr에 직접 출력하는 방식으로 변경
    try {
      if (data) {
        consoleMethod(`${logPrefix} ${message}`, data);
        // 백업: 직접 출력
        process.stdout.write(`${logPrefix} ${message} ${JSON.stringify(data)}\n`);
      } else {
        consoleMethod(`${logPrefix} ${message}`);
        // 백업: 직접 출력
        process.stdout.write(`${logPrefix} ${message}\n`);
      }
    } catch (error) {
      // 콘솔 출력 실패 시 stdout으로 강제 출력
      process.stdout.write(`${logPrefix} [콘솔 출력 실패] ${message}\n`);
      if (error) {
        process.stdout.write(`Error: ${error}\n`);
      }
    }
  }

  /**
   * 파일에 로그 출력
   */
  private writeToFile(logMessage: LogMessage): void {
    try {
      // 일정 주기로 파일 크기 확인 (모든 호출마다 확인하지 않음)
      const now = Date.now();
      if (now - this.lastFileSizeCheck > 60000) { // 1분마다 확인
        this.checkLogFileSize();
        this.lastFileSizeCheck = now;
      }

      // 로그 포맷팅
      let logLine = `${logMessage.timestamp} [${logMessage.level}] [${logMessage.category}] ${logMessage.message}`;

      // 데이터가 있을 경우 JSON으로 추가
      if (logMessage.data) {
        logLine += ` ${JSON.stringify(logMessage.data)}`;
      }

      logLine += '\n';

      // 파일에 로그 추가
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch (error) {
      console.error('로그 파일 쓰기 실패:', error);
    }
  }

  /**
   * 로그 파일 크기 확인 및 관리
   */
  private checkLogFileSize(): void {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);

        // 파일 크기가 제한을 초과하면 새 파일 생성
        if (stats.size > this.options.maxFileSize!) {
          const timestamp = new Date().toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
          const newPath = `${this.logFilePath}.${timestamp}`;

          // 현재 로그 파일 이름 변경
          fs.renameSync(this.logFilePath, newPath);

          // 로그 파일 개수 제한 (10개)
          this.cleanupOldLogs();
        }
      }
    } catch (error) {
      console.error('로그 파일 크기 확인 실패:', error);
    }
  }

  /**
   * 오래된 로그 파일 정리
   */
  private cleanupOldLogs(): void {
    try {
      const logDir = this.options.logDir!;
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith('app-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          time: fs.statSync(path.join(logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // 최신 파일 순으로 정렬

      // 10개 이상의 파일이 있으면 오래된 파일 삭제
      if (files.length > 10) {
        for (let i = 10; i < files.length; i++) {
          fs.unlinkSync(files[i].path);
          console.log(`오래된 로그 파일 삭제: ${files[i].name}`);
        }
      }
    } catch (error) {
      console.error('오래된 로그 파일 정리 실패:', error);
    }
  }

  /**
   * 서버에 로그 전송 처리
   */
  private async processQueue(): Promise<void> {
    // 이미 전송 중이거나 큐가 비어있으면 건너뛰기
    if (this.isSending || this.logQueue.length === 0) return;

    // 큐에서 최대 50개 로그 가져오기
    const batch = this.logQueue.slice(0, 50);

    try {
      this.isSending = true;

      // 로그 데이터 준비
      const payload = {
        appVersion: this.options.appVersion,
        platform: process.platform,
        logs: batch
      };

      // 서버로 로그 전송
      const response = await fetch(this.options.remoteUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // 응답 확인
      if (response.ok) {
        // 성공적으로 전송된 로그 제거
        this.logQueue = this.logQueue.slice(batch.length);
        this.debug('Logger', `로그 ${batch.length}개 전송 완료`);
      } else {
        console.error(`로그 전송 실패: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('로그 전송 중 오류 발생:', error);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * 다운로드 관련 로그
   */
  public logDownload(action: string, url: string, data?: any): void {
    this.info('Download', `${action}: ${url}`, data);
  }

  /**
   * 압축 해제 관련 로그
   */
  public logExtract(action: string, filePath: string, data?: any): void {
    this.info('Extract', `${action}: ${filePath}`, data);
  }

  /**
   * 파일 처리 관련 로그
   */
  public logFile(action: string, filePath: string, data?: any): void {
    this.info('File', `${action}: ${filePath}`, data);
  }

  /**
   * 네트워크 요청 관련 로그
   */
  public logNetwork(action: string, url: string, data?: any): void {
    this.info('Network', `${action}: ${url}`, data);
  }

  /**
   * 앱 이벤트 관련 로그
   */
  public logAppEvent(action: string, data?: any): void {
    this.info('AppEvent', action, data);
  }
}
