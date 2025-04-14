import { useState, useEffect } from 'react'
import { GameLauncher } from '@/components/GameLauncher'
import React from 'react'
import { toast, Toaster } from 'react-hot-toast'

// Types definition
declare global {
  interface Window {
    api: {
      initializeDownload: (fileUrl: string, shouldCleanup: boolean) => Promise<{
        success: boolean
        error?: string
        isAlreadyRunning?: boolean
        canResume?: boolean
        resumeInfo?: {
          filePath: string
          downloadedBytes: number
          totalBytes: number
        }
      }>
      downloadAndExtract: (fileUrl: string, targetFolder: string, shouldResume?: boolean) => Promise<string>
      cancelDownload: () => Promise<void>
      checkResumeAvailable: (fileUrl: string) => Promise<{
        canResume: boolean;
        resumeInfo?: {
          fileUrl: string;
          filePath: string;
          downloadedBytes: number;
          totalBytes: number;
        };
        reason?: string;
      }>
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
      onExtractProgress: (callback: (progress: ExtractProgress) => void) => () => void
      sendDownloadEvent: (event: DownloadEvent) => Promise<void>
      onSecondInstanceDetected: (callback: () => void) => () => void
    }
  }
}

interface DownloadProgress {
  percent: number
  transferredBytes: number
  totalBytes: number
  bytesPerSecond: number
  remaining: number
  isResumed?: boolean
}

interface ExtractProgress {
  percent: number
  extracted: number
  total: number
}

interface DownloadEvent {
  eventType: 'start' | 'progress' | 'complete' | 'cancel' | 'error'
  timestamp: number
  fileUrl?: string
  fileSize?: number
  progress?: number
  bytesPerSecond?: number
  averageSpeed?: number
  elapsedTime?: number
  targetFolder?: string
  error?: string
}

// Download status type
type DownloadStatus = 'idle' | 'downloading' | 'extracting' | 'cancelling' | 'completed' | 'error';

function App(): JSX.Element {
  // Basic UI status
  const [progress, setProgress] = useState(0)
  const [currentImage] = useState('/main.png')
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s')
  const [downloadSize, setDownloadSize] = useState('Preparing file download...')
  const [remainingTime, setRemainingTime] = useState('Calculating...')

  // Core download status
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle')
  const [isButtonDisabled, setIsButtonDisabled] = useState(false)

  // Store status copy in ref (to reference latest status in event handlers)
  const statusRef = React.useRef<DownloadStatus>('idle');

  // Reference for animation frame
  const animationFrameRef = React.useRef<number | null>(null);
  // Last progress update timestamp
  const lastUpdateTimeRef = React.useRef<number>(0);
  // Store most recent progress data
  const progressDataRef = React.useRef<DownloadProgress | null>(null);

  // Resume-related status
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [resumeInfo, setResumeInfo] = useState<{
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
  } | null>(null)

  // Download statistics
  const [downloadStats, setDownloadStats] = useState<{
    startTime: number
    speedSamples: number[]
    movingAvgSpeed: number
    displaySpeed: number
    lastRemainingTime: number
    remainingTimeSamples: number[]
    totalBytes: number
    url: string
  } | null>(null)

  // Download settings
  const fileUrl = 'https://d3fwkemdw8spx3.cloudfront.net/studio/SQLProStudio.2024.21.app.zip'
  const targetFolder = '/Users/kongshinbae/Downloads/extracted-files'

  // Derived properties based on status
  const isDownloading = downloadStatus === 'downloading'
  const isExtracting = downloadStatus === 'extracting'
  const isCancelling = downloadStatus === 'cancelling'
  const isCompleted = downloadStatus === 'completed'
  const isProcessing = isDownloading || isExtracting || isCancelling

  // Check if resume is available
  useEffect(() => {
    // Only check resume information when downloadStatus is idle
    if (downloadStatus === 'idle') {
      checkResumeInfo().catch(error => {
        console.error('Error while checking resume information:', error)
      })
    }
  }, [downloadStatus])

  // Function to check resume information
  const checkResumeInfo = async (): Promise<void> => {
    try {
      const result = await window.api.checkResumeAvailable(fileUrl)
      setResumeAvailable(result.canResume)

      if (result.canResume && result.resumeInfo) {
        const { downloadedBytes, totalBytes } = result.resumeInfo
        const percent = Math.floor((downloadedBytes / totalBytes) * 100)
        setResumeInfo({
          downloadedBytes,
          totalBytes,
          percent
        })
        setDownloadSize(`Previous download can be resumed: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${percent}%)`)
      } else {
        setResumeInfo(null)
        if (downloadStatus === 'idle') {
          setDownloadSize('Preparing file download...')
        }
      }
    } catch (error) {
      console.error('Error while checking resume information:', error)
      setResumeAvailable(false)
      setResumeInfo(null)
      if (downloadStatus === 'idle') {
        setDownloadSize('Preparing file download...')
      }
    }
  }

  // Setup for receiving download and extraction progress
  useEffect(() => {
    // IPC 이벤트 리스너 설정 (메인 프로세스에서 전송하는 진행 상황 데이터 수신)
    const downloadListener = (event: Event, progress: DownloadProgress): void => {
      // 진행 데이터 저장
      progressDataRef.current = progress;

      // 현재 상태 확인
      const currentStatus = statusRef.current;

      // 취소 중이거나 이미 완료된 상태면 무시
      if (currentStatus === 'cancelling' ||
          currentStatus === 'idle' ||
          currentStatus === 'completed' ||
          currentStatus === 'error') return;

      // 애니메이션 프레임이 없으면 생성
      if (!animationFrameRef.current && (currentStatus === 'downloading')) {
        animationFrameRef.current = requestAnimationFrame((timestamp) => {
          lastUpdateTimeRef.current = timestamp;
        });
      }

      // 다운로드 완료 시 압축 해제 상태로 변경
      if (progress.percent === 100 && currentStatus === 'downloading') {
        setDownloadStatus('extracting');
      }

      // 다운로드 통계 업데이트 (메인 프로세스에서 계산된 값 사용)
      setDownloadStats((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          movingAvgSpeed: progress.bytesPerSecond,
          displaySpeed: progress.bytesPerSecond,
          lastRemainingTime: progress.remaining,
          totalBytes: progress.totalBytes
        };
      });
    };

    // 압축 해제 이벤트 리스너
    const extractListener = (event: Event, progress: ExtractProgress): void => {
      // 진행 데이터 업데이트
      progressDataRef.current = {
        ...progressDataRef.current,
        percent: progress.percent
      } as DownloadProgress;

      // 현재 상태 확인
      const currentStatus = statusRef.current;

      // 취소 중이거나 압축 해제 상태가 아니면 무시
      if (currentStatus === 'cancelling' || currentStatus !== 'extracting') return;

      // 압축 해제 텍스트 업데이트
      setDownloadSize(`Extracting file: ${progress.extracted}/${progress.total}`);

      // 압축 해제 완료 시 상태 업데이트
      if (progress.percent === 100) {
        setProgress(100);
        setDownloadStatus('completed');
        setDownloadSize('Download and extraction completed');
        setDownloadSpeed('-');
        setRemainingTime('-');
        setResumeAvailable(false);
        setResumeInfo(null);
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener('download-progress', downloadListener as EventListener);
    window.addEventListener('extract-progress', extractListener as EventListener);

    // 기존 API 기반 이벤트 리스너 (이전 방식과 호환성 유지)
    const removeDownloadListener = window.api.onDownloadProgress((progress: DownloadProgress): void => {
      downloadListener({} as Event, progress);
    });

    const removeExtractListener = window.api.onExtractProgress((progress: ExtractProgress): void => {
      extractListener({} as Event, progress);
    });

    return (): void => {
      // 이벤트 리스너 정리
      window.removeEventListener('download-progress', downloadListener as EventListener);
      window.removeEventListener('extract-progress', extractListener as EventListener);
      removeDownloadListener();
      removeExtractListener();
    };
  }, []);

  // Separate UI rendering with animation frames (visual updates only)
  useEffect(() => {
    // Track last time we updated text displays
    let lastTextUpdateTime = 0;

    // Animation frame callback for smooth UI updates - ONLY updates the UI
    const updateUI = (timestamp: number): void => {
      // Update UI only if we have progress data and we're in an active download state
      const currentStatus = statusRef.current;
      const progress = progressDataRef.current;

      if (progress && (currentStatus === 'downloading' || currentStatus === 'extracting')) {
        // Update UI at optimal frequency
        const MIN_UPDATE_INTERVAL = 16; // ~60fps for progress bar
        const shouldUpdate = timestamp - lastUpdateTimeRef.current > MIN_UPDATE_INTERVAL;

        if (shouldUpdate) {
          lastUpdateTimeRef.current = timestamp;

          // Always update progress bar (most important visual feedback)
          setProgress(Math.floor(progress.percent));

          // Update text elements less frequently
          const TEXT_UPDATE_INTERVAL = 80; // 80ms for text updates (12.5fps)
          const shouldUpdateText = timestamp - lastTextUpdateTime > TEXT_UPDATE_INTERVAL;

          if (shouldUpdateText) {
            lastTextUpdateTime = timestamp;

            // DISPLAY ONLY - UI 렌더링만 담당 (계산 없음)
            const stats = downloadStats;

            // Display speed
            if (stats && stats.displaySpeed > 0) {
              setDownloadSpeed(formatBytes(stats.displaySpeed) + '/s');
            } else {
              setDownloadSpeed(formatBytes(progress.bytesPerSecond) + '/s');
            }

            // Display size
            setDownloadSize(`${formatBytes(progress.transferredBytes)} / ${formatBytes(progress.totalBytes)}`);

            // Display remaining time
            if (stats && stats.lastRemainingTime > 0) {
              setRemainingTime(formatTime(stats.lastRemainingTime));
            } else if (progress.remaining > 0 && progress.remaining < Infinity) {
              // Fallback to electron's calculation
              setRemainingTime(formatTime(progress.remaining));
            } else {
              setRemainingTime('Calculating...');
            }
          }
        }

        // Continue the animation loop
        animationFrameRef.current = requestAnimationFrame(updateUI);
      } else {
        // No need to continue animation if not downloading/extracting
        animationFrameRef.current = null;
      }
    };

    // Start/stop animation frame based on download status
    if (downloadStatus === 'downloading' || downloadStatus === 'extracting') {
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateUI);
      }
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    // Cleanup
    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [downloadStatus, downloadStats]);

  // Update status ref whenever downloadStatus changes
  useEffect((): void => {
    statusRef.current = downloadStatus;
  }, [downloadStatus]);

  // Second instance detection handling
  useEffect(() => {
    const cleanup = window.api.onSecondInstanceDetected(() => {
      toast.error('Program is already running!', {
        icon: '⚠️',
        duration: 3000,
        style: {
          background: '#FEF2F2',
          color: '#7F1D1D',
          border: '1px solid #FECACA',
          padding: '16px',
          fontSize: '14px',
          fontWeight: 'bold'
        }
      });
    });

    return cleanup;
  }, []);

  // Byte formatting function
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))

    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Time formatting function
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity || isNaN(seconds) || seconds < 0) {
      return 'Calculating...';
    }

    // Round the value for stable time display
    const roundedSeconds = Math.round(seconds);

    if (roundedSeconds < 60) {
      return `${roundedSeconds}s`;
    } else if (roundedSeconds < 3600) {
      const minutes = Math.floor(roundedSeconds / 60);
      const secs = Math.round(roundedSeconds % 60);
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(roundedSeconds / 3600);
      const minutes = Math.floor((roundedSeconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  // Button event handler
  const handleButtonClick = async (): Promise<void> => {
    // Do nothing if the button is already disabled or cancellation is in progress
    if (isButtonDisabled || downloadStatus === 'cancelling') {
      return;
    }

    // 중복 클릭 방지를 위해 즉시 버튼 비활성화
    setIsButtonDisabled(true);

    try {
      if (isDownloading || isExtracting) {
        // 다운로드 중이면 취소
        await cancelDownload();
      } else {
        // 아니면 다운로드 시작
        await startDownload();
      }
    } catch (error) {
      console.error('Error while processing button event:', error);
      // 오류 발생 시 버튼 상태 복원
      setIsButtonDisabled(false);
    }
  }

  // Download start function
  const startDownload = async (): Promise<void> => {
    // Ignore and restore button status if already downloading or cancelling
    const currentStatus = downloadStatus;
    if (currentStatus !== 'idle' && currentStatus !== 'completed' && currentStatus !== 'error') {
      setIsButtonDisabled(false);
      return;
    }

    // Reset animation frame when starting download
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastUpdateTimeRef.current = 0;

    // Reset UI status before starting download
    setIsButtonDisabled(true);
    setProgress(0);
    setDownloadSpeed('0 KB/s');
    setRemainingTime('Calculating...');
    setDownloadSize('Preparing file download...');

    try {
      // Call new download initialization function (to prevent duplicate downloads)
      const initResult = await window.api.initializeDownload(fileUrl, false);

      // If initialization fails
      if (!initResult.success) {
        if (initResult.isAlreadyRunning) {
          setDownloadSize('Download is already in progress');
        } else if (initResult.error) {
          setDownloadSize(`Download initialization failed: ${initResult.error}`);
        }
        setIsButtonDisabled(false);
        return;
      }

      // Change to downloading status
      setDownloadStatus('downloading');

      // Set resume information (new method: direct file-based check)
      const shouldResume = initResult.canResume && initResult.resumeInfo !== undefined;

      if (shouldResume && initResult.resumeInfo) {
        const resumedInfo = {
          downloadedBytes: initResult.resumeInfo.downloadedBytes,
          totalBytes: initResult.resumeInfo.totalBytes,
          percent: Math.floor((initResult.resumeInfo.downloadedBytes / initResult.resumeInfo.totalBytes) * 100)
        };

        setResumeInfo(resumedInfo);
        setResumeAvailable(true);
        setDownloadSize(`Resuming: ${formatBytes(resumedInfo.downloadedBytes)} / ${formatBytes(resumedInfo.totalBytes)}`);
        setProgress(resumedInfo.percent);

        // Initialize download statistics with better responsiveness
        setDownloadStats({
          startTime: Date.now(),
          speedSamples: [],
          movingAvgSpeed: 0,
          displaySpeed: 1024, // Initialize with 1KB/s to avoid division by zero
          lastRemainingTime: 0,
          remainingTimeSamples: [],
          totalBytes: resumedInfo.totalBytes,
          url: fileUrl
        });
      } else {
        // Initialize download statistics (if not resuming) with better responsiveness
        setDownloadStats({
          startTime: Date.now(),
          speedSamples: [],
          movingAvgSpeed: 0,
          // Start with a small non-zero value for smoother initial transition
          displaySpeed: 1024, // Initialize with 1KB/s to avoid division by zero
          lastRemainingTime: 0,
          remainingTimeSamples: [],
          totalBytes: 0,
          url: fileUrl
        });
      }

      // Send download start event
      await window.api.sendDownloadEvent({
        eventType: 'start',
        timestamp: Date.now(),
        fileUrl,
        targetFolder
      });

      // Re-enable for cancel button
      setIsButtonDisabled(false);

      try {
        // Execute download and extraction (with resume option)
        const extractedFolder = await window.api.downloadAndExtract(fileUrl, targetFolder, shouldResume);

        // Send download complete event
        if (downloadStats) {
          const elapsedTime = (Date.now() - downloadStats.startTime) / 1000;
          const avgSpeed = downloadStats.movingAvgSpeed ||
            (downloadStats.speedSamples.reduce((sum, speed) => sum + speed, 0) /
            Math.max(1, downloadStats.speedSamples.length));

          await window.api.sendDownloadEvent({
            eventType: 'complete',
            timestamp: Date.now(),
            fileUrl,
            fileSize: downloadStats.totalBytes,
            progress: 100,
            averageSpeed: avgSpeed,
            elapsedTime
          });
        }

        console.log('Extraction completed:', extractedFolder);

        // Reset resume information
        setResumeAvailable(false);
        setResumeInfo(null);

        // If download is completed but UI status is not yet updated to completed
        // May have missed the extractProgress event, so update status here additionally
        if (statusRef.current !== 'completed') {
          // Ensure progress shows 100%
          setProgress(100);
          setDownloadStatus('completed');
          setDownloadSize('Download and extraction completed');
          setDownloadSpeed('-');
          setRemainingTime('-');
        }
      } catch (error) {
        // Error occurred during download or extraction process
        console.error('Error during download or extraction:', error);

        // Check current status - only process error if not cancelling
        if (statusRef.current !== 'cancelling') {
          // Set to error status
          setDownloadStatus('error');

          // If the error indicates download is already in progress, show to user
          if (error instanceof Error && error.message.includes('Download is already in progress')) {
            setDownloadSize('Download is already in progress');
          } else {
            // 기타 오류
            const errorMsg = error instanceof Error ? error.message : String(error);
            setDownloadSize(`Error during download: ${errorMsg}`);

            // Send error event
            if (downloadStats) {
              await window.api.sendDownloadEvent({
                eventType: 'error',
                timestamp: Date.now(),
                fileUrl: downloadStats.url,
                error: errorMsg
              });
            }
          }

          // Check resume information (new method)
          try {
            const fileCheckResult = await window.api.checkResumeAvailable(fileUrl);
            setResumeAvailable(fileCheckResult.canResume);

            if (fileCheckResult.canResume && fileCheckResult.resumeInfo) {
              const { downloadedBytes, totalBytes } = fileCheckResult.resumeInfo;
              const percent = Math.floor((downloadedBytes / totalBytes) * 100);
              setResumeInfo({
                downloadedBytes,
                totalBytes,
                percent
              });
              setDownloadSize(`Previous download can be resumed: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${percent}%)`);
            }
          } catch (checkError) {
            console.error('Error while checking resume information:', checkError);
          }
        }
      } finally {
        // Only reset statistics if not cancelling
        if (statusRef.current !== 'cancelling') {
          setDownloadStats(null);
        }

        // Re-enable button if it's disabled
        if (isButtonDisabled) {
          setIsButtonDisabled(false);
        }
      }
    } catch (error) {
      console.error('Error while initializing download:', error);
      setDownloadStatus('error');
      setDownloadStats(null);
      setIsButtonDisabled(false);
    }
  }

  // Download cancel function
  const cancelDownload = async (): Promise<void> => {
    // Check current status
    const currentStatus = downloadStatus;

    // Ignore and restore button status if not in a cancellable state
    if (currentStatus !== 'downloading' && currentStatus !== 'extracting') {
      setIsButtonDisabled(false);
      return;
    }

    // Clean up animation frame when cancelling
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Button is already disabled from handleButtonClick
    // Change to cancelling status
    setDownloadStatus('cancelling');

    // Update UI status
    setDownloadSize('Cancelling download...');
    setDownloadSpeed('0 KB/s');
    setRemainingTime('-');

    try {
      // Send download cancellation command
      await window.api.cancelDownload();

      // Send cancellation event
      if (downloadStats) {
        const elapsedTime = (Date.now() - downloadStats.startTime) / 1000;
        const avgSpeed = downloadStats.speedSamples.reduce((sum, speed) => sum + speed, 0) /
          Math.max(1, downloadStats.speedSamples.length);

        await window.api.sendDownloadEvent({
          eventType: 'cancel',
          timestamp: Date.now(),
          fileUrl: downloadStats.url,
          averageSpeed: avgSpeed,
          elapsedTime,
          progress
        });
      }

      // Reset status
      setProgress(0);
      setDownloadStats(null);

      // Check resume information (new method)
      try {
        const fileCheckResult = await window.api.checkResumeAvailable(fileUrl);
        setResumeAvailable(fileCheckResult.canResume);

        if (fileCheckResult.canResume && fileCheckResult.resumeInfo) {
          const { downloadedBytes, totalBytes } = fileCheckResult.resumeInfo;
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          setResumeInfo({
            downloadedBytes,
            totalBytes,
            percent
          });
          setDownloadSize(`Previous download can be resumed: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${percent}%)`);
        } else {
          setResumeInfo(null);
          setDownloadSize('Download has been cancelled');
        }
      } catch (checkError) {
        console.error('Error while checking resume information:', checkError);
        setDownloadSize('Download has been cancelled');
      }

      // Final status update (cancelling -> idle)
      setDownloadStatus('idle');
    } catch (error) {
      console.error('Error while cancelling download:', error);
      setDownloadStatus('error');
      setDownloadSize('An error occurred during cancellation');
    } finally {
      // Enable button in any case
      setIsButtonDisabled(false);
    }
  }

  // Calculate button label
  const getButtonLabel = (): string => {
    // If button is disabled and downloading, show processing status
    if (isButtonDisabled) {
      if (isDownloading) return 'Downloading...';
      if (isExtracting) return 'Extracting...';
      if (isCancelling) return 'Cancelling...';
    }

    if (isDownloading || isExtracting) {
      return 'Cancel';
    }

    if (downloadStatus === 'completed') {
      return 'Completed';
    }

    if (resumeAvailable && resumeInfo) {
      return 'Resume';
    }

    return 'Download';
  }

  return (
    <div className="h-screen w-full flex items-center justify-center overflow-hidden">
      {/* Notification component */}
      <Toaster position="top-center" />

      <GameLauncher
        image={currentImage}
        progress={progress}
        downloadSpeed={downloadSpeed}
        downloadSize={downloadSize}
        remainingTime={remainingTime}
        isDownloading={isProcessing}
        onEvent={handleButtonClick}
        buttonLabel={getButtonLabel()}
        isButtonDisabled={isButtonDisabled || isCompleted}
      />
    </div>
  )
}

export default App
