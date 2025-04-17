import React, { useState, createContext, useContext } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

// 오류 다이얼로그 컨텍스트 정의
interface ErrorDialogContextType {
  showError: (title: string, message: string) => void;
  clearError: () => void;
}

const ErrorDialogContext = createContext<ErrorDialogContextType | undefined>(undefined);

// 오류 다이얼로그 Provider 컴포넌트
export function ErrorDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const showError = (title: string, message: string) => {
    setTitle(title);
    setMessage(message);
    setOpen(true);
  };

  const clearError = () => {
    setOpen(false);
  };

  return (
    <ErrorDialogContext.Provider value={{ showError, clearError }}>
      {children}
      <ErrorDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        message={message}
      />
    </ErrorDialogContext.Provider>
  );
}

// 오류 다이얼로그 Hook
export function useErrorDialog() {
  const context = useContext(ErrorDialogContext);
  if (context === undefined) {
    throw new Error('useErrorDialog must be used within an ErrorDialogProvider');
  }
  return context;
}

// 오류 다이얼로그 컴포넌트
interface ErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
}

function ErrorDialog({ open, onOpenChange, title, message }: ErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-red-600 gap-2">
            <AlertCircle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 유틸리티 함수: API 서비스에서 직접 호출할 수 있는 전역 함수
let showErrorFn: ((title: string, message: string) => void) | null = null;

export function setErrorDialogFunction(fn: (title: string, message: string) => void) {
  showErrorFn = fn;
}

export function showGlobalError(title: string, message: string) {
  if (showErrorFn) {
    showErrorFn(title, message);
  } else {
    console.error('Error dialog function not set', { title, message });
  }
}
