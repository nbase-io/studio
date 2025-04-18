import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus, X, Maximize, Minimize, RefreshCcw, ArrowLeft, ArrowRight, RotateCw,
  Home, BookmarkPlus, Bookmark, Search, Zap, AlertTriangle, Loader2, ZoomIn, ZoomOut
} from 'lucide-react';
import { useSettings } from '../main';

interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  error?: string;
  isLoading?: boolean;
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

interface WebViewControllerProps {
  initialTabs?: Tab[];
  defaultUrl?: string;
}

// 탭 저장 키
const SAVED_TABS_KEY = 'gamepot-studio-saved-tabs';
const BOOKMARKS_KEY = 'gamepot-studio-bookmarks';
// 홈 URL 기본값
const BASE_URL = 'https://dash.gamepot.beta.ntruss.com';

const WebViewController: React.FC<WebViewControllerProps> = ({
  initialTabs = [],
  defaultUrl
}) => {
  // 설정에서 로그인 정보 가져오기
  const { settings } = useSettings();

  // HOME_URL 계산 - 프로젝트ID와 API KEY를 쿼리 파라미터로 전달
  const HOME_URL = React.useMemo(() => {
    // 기본 URL 설정
    let url = BASE_URL;

    // 프로젝트 ID와 API KEY가 있으면 URL에 추가
    if (settings.projectId && settings.apiKey) {
      url += `/projects/${settings.projectId}?apiKey=${encodeURIComponent(settings.apiKey)}`;
      if (settings.region) {
        url += `&region=${encodeURIComponent(settings.region)}`;
      }
    }

    return url;
  }, [settings.projectId, settings.apiKey, settings.region]);

  // 빈 defaultUrl이면 계산된 HOME_URL 사용
  const effectiveDefaultUrl = defaultUrl || HOME_URL;

  const [tabs, setTabs] = useState<Tab[]>(
    initialTabs.length > 0
      ? initialTabs
      : [{ id: crypto.randomUUID(), title: 'GamePot Dashboard', url: effectiveDefaultUrl }]
  );
  const [activeTabId, setActiveTabId] = useState<string>(
    initialTabs.length > 0 ? initialTabs[0].id : tabs[0].id
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>('');
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  const webviewRefs = useRef<Map<string, Electron.WebviewTag | null>>(new Map());
  const urlInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 로그인 정보 변경 시 대시보드 URL 업데이트
  useEffect(() => {
    // 로그인 정보가 없으면 아무것도 하지 않음
    if (!settings.projectId || !settings.apiKey) {
      return;
    }

    // 활성 탭이 GamePot Dashboard인 경우에만 URL 업데이트
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab && activeTab.url.startsWith(BASE_URL)) {
      // 디버깅 로그
      console.log('로그인 정보 변경 감지, 대시보드 URL 업데이트:', HOME_URL);

      // URL 업데이트 및 새로고침
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === activeTabId ? { ...tab, url: HOME_URL } : tab
        )
      );

      if (activeTabId) {
        setCurrentUrl(HOME_URL);
      }

      // 새로고침
      setTimeout(() => {
        const webview = webviewRefs.current.get(activeTabId);
        if (webview) {
          console.log('웹뷰 새로고침 실행');
          webview.reload();
        }
      }, 100);
    }
  }, [HOME_URL, settings.projectId, settings.apiKey, settings.region, tabs, activeTabId]);

  // 네트워크 상태 감시
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 탭 URL 업데이트 함수
  const updateTabUrl = (id: string, url: string) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === id ? { ...tab, url } : tab
      )
    );
    if (id === activeTabId) {
      setCurrentUrl(url);
    }
  };

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 요소에서 단축키 무시 (URL 입력창, 검색창 등)
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const webview = getActiveWebview();

      // Ctrl+T: 새 탭
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      // Ctrl+W: 현재 탭 닫기
      else if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId, e as any);
        }
      }
      // Ctrl+R: 새로고침
      else if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        refreshActiveTab();
      }
      // Alt+Left: 뒤로가기
      else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
      // Alt+Right: 앞으로가기
      else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
      // Ctrl+L: 주소창 포커스
      else if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        focusUrlInput();
      }
      // Ctrl+F: 페이지 내 검색
      else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      // Escape: 검색 닫기
      else if (e.key === 'Escape') {
        if (isSearchOpen) {
          setIsSearchOpen(false);
          setSearchText('');
          webview?.stopFindInPage('clearSelection');
        }
      }
      // Ctrl+D: 북마크 추가/제거
      else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        toggleBookmark();
      }
      // Ctrl+H: 홈으로 가기
      else if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        navigateToHome();
      }
      // Ctrl+Plus: 확대
      else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomIn();
      }
      // Ctrl+Minus: 축소
      else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
      // Ctrl+0: 기본 크기로 복원
      else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, isSearchOpen]);

  // 앱 시작 시 저장된 탭과 북마크 불러오기
  useEffect(() => {
    loadSavedTabs();
    loadBookmarks();
  }, []);

  // 탭 변경시 URL 업데이트
  useEffect(() => {
    if (activeTabId) {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        setCurrentUrl(activeTab.url);
        setZoomFactor(1); // 탭 변경 시 줌 초기화
      }
    }
  }, [activeTabId, tabs]);

  // 앱 버전 가져오기
  useEffect(() => {
    const getVersion = async () => {
      try {
        const packageInfo = await window.api.getAppVersion();
        setAppVersion(packageInfo.version || '1.0.0');
      } catch (error) {
        console.error('앱 버전 가져오기 실패:', error);
        setAppVersion('1.0.0');
      }
    };

    getVersion();
  }, []);

  // 세션 초기화 및 쿠키 설정
  useEffect(() => {
    // 간소화된 버전으로 변경 - 복잡한 객체 사용 제거
    console.log('세션 초기화 준비 완료');

    // API 인증 정보가 있는 경우 웹뷰에 쿠키 설정
    if (settings.projectId && settings.apiKey) {
      setTimeout(() => {
        const webview = getActiveWebview();
        if (webview) {
          // 필요한 쿠키 설정
          webview.executeJavaScript(`
            document.cookie = "projectId=${settings.projectId}; path=/; domain=.ntruss.com";
            document.cookie = "apiKey=${settings.apiKey}; path=/; domain=.ntruss.com";
            document.cookie = "region=${settings.region || 'ap-northeast-2'}; path=/; domain=.ntruss.com";
            console.log('GamePot Studio에서 인증 쿠키를 설정했습니다.');
          `);
        }
      }, 1000);
    }
  }, [settings.projectId, settings.apiKey, settings.region, activeTabId]);

  // 탭 저장하기
  const saveTabs = useCallback(() => {
    try {
      window.localStorage.setItem(SAVED_TABS_KEY, JSON.stringify({
        tabs: tabs.map(({ isLoading, error, ...rest }) => rest), // 로딩 상태, 에러는 저장하지 않음
        activeTabId
      }));
      console.log('탭 저장 완료');
    } catch (error) {
      console.error('탭 저장 실패:', error);
    }
  }, [tabs, activeTabId]);

  // 저장된 탭 불러오기
  const loadSavedTabs = () => {
    try {
      const savedData = window.localStorage.getItem(SAVED_TABS_KEY);

      if (savedData) {
        const { tabs: savedTabs, activeTabId: savedActiveTabId } = JSON.parse(savedData);

        if (savedTabs && savedTabs.length > 0) {
          setTabs(savedTabs);
          setActiveTabId(savedActiveTabId || savedTabs[0].id);
          console.log('저장된 탭 불러오기 완료');
          return;
        }
      }

      // 저장된 탭이 없으면 기본 탭 생성
      const defaultTab = { id: crypto.randomUUID(), title: 'GamePot Dashboard', url: effectiveDefaultUrl };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    } catch (error) {
      console.error('저장된 탭 불러오기 실패:', error);
      // 오류 발생 시 기본 탭 생성
      const defaultTab = { id: crypto.randomUUID(), title: 'GamePot Dashboard', url: effectiveDefaultUrl };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
  };

  // 탭이 변경될 때마다 저장
  useEffect(() => {
    if (tabs.length > 0 && activeTabId) {
      saveTabs();
    }
  }, [tabs, activeTabId, saveTabs]);

  // 현재 활성 탭의 webview 요소
  const getActiveWebview = (): Electron.WebviewTag | null => {
    const webview = webviewRefs.current.get(activeTabId);
    if (!webview) {
      console.warn('활성 탭의 webview를 찾을 수 없음:', activeTabId);
    }
    return webview || null;
  };

  // 탭 추가
  const addTab = (url: string = effectiveDefaultUrl) => {
    const newId = crypto.randomUUID();
    const newTab: Tab = {
      id: newId,
      title: 'New Tab',
      url,
      isLoading: true
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  // 탭 닫기
  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (tabs.length === 1) {
      // 마지막 탭은 URL만 초기화
      const resetTab = { id: tabs[0].id, title: 'GamePot Dashboard', url: effectiveDefaultUrl, isLoading: true };
      setTabs([resetTab]);
      setActiveTabId(resetTab.id);
      return;
    }

    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);

    if (id === activeTabId) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  // 탭 제목 업데이트
  const updateTabTitle = (id: string, title: string, favicon?: string) => {
    setTabs(tabs.map(tab =>
      tab.id === id
        ? { ...tab, title: title || tab.url, ...(favicon && { favicon }) }
        : tab
    ));
  };

  // URL 입력 처리
  const handleUrlSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!currentUrl) return;

    // URL 형식 검증 및 수정
    let formattedUrl = currentUrl;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('URL 이동 시도:', formattedUrl); // 디버깅용 로그

    // 현재 활성 탭 URL 업데이트
    setTabs(prevTabs => prevTabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, url: formattedUrl, isLoading: true, error: undefined }
        : tab
    ));

    // 현재 URL 상태 업데이트
    setCurrentUrl(formattedUrl);
    setIsEditing(false);

    // webview 로드
    const webview = getActiveWebview();
    if (webview) {
      try {
        webview.loadURL(formattedUrl)
          .then(() => {
            console.log('URL 로드 성공:', formattedUrl);
          })
          .catch(err => {
            console.error('URL 로드 실패:', err);
            setTabs(prevTabs => prevTabs.map(tab =>
              tab.id === activeTabId
                ? { ...tab, isLoading: false, error: `URL을 로드할 수 없습니다: ${err.message}` }
                : tab
            ));
          });
      } catch (err) {
        console.error('URL 로드 중 예외 발생:', err);
        setTabs(prevTabs => prevTabs.map(tab =>
          tab.id === activeTabId
            ? { ...tab, isLoading: false, error: `URL 로드 중 오류 발생` }
            : tab
        ));
      }
    } else {
      console.error('활성 webview를 찾을 수 없음');
    }
  };

  // 주소 변경 후 포커스가 바뀔 때 자동으로 이동
  const handleUrlBlur = () => {
    // 주소가 비어있지 않고 현재 탭의 URL과 다른 경우에만 이동
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTab && currentUrl && currentUrl !== activeTab.url) {
      console.log('URL 블러 이벤트 감지, 이동 시도:', currentUrl);
      handleUrlSubmit();
    }
    setIsEditing(false);
  };

  // webview 이벤트 핸들러 설정
  const setupWebviewEvents = (webview: Electron.WebviewTag, tabId: string) => {
    if (!webview) return;

    // 탭 제목 업데이트
    const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
      updateTabTitle(tabId, e.title);
    };

    // 페이지 아이콘 업데이트
    const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
      if (e.favicons && e.favicons.length > 0) {
        updateTabTitle(tabId, tabs.find(t => t.id === tabId)?.title || '', e.favicons[0]);
      }
    };

    // 링크 클릭 시 이동 처리 (will-navigate 이벤트)
    const handleWillNavigate = (e: Electron.WillNavigateEvent) => {
      console.log('링크 클릭 감지 (will-navigate):', e.url, '탭 ID:', tabId);

      // 탭의 로딩 상태 업데이트
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, isLoading: true } : tab
      ));

      // 현재 활성 탭인 경우 주소창 업데이트
      if (tabId === activeTabId) {
        setCurrentUrl(e.url);
      }
    };

    // URL 변경 감지
    const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
      console.log('웹뷰 탐색 완료:', e.url, '탭 ID:', tabId);

      // 현재 활성화된 탭인 경우에만 주소창 업데이트
      if (tabId === activeTabId) {
        setCurrentUrl(e.url);
      }

      // 탭의 URL 업데이트
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, url: e.url, error: undefined }
          : tab
      ));
    };

    // 페이지 내 탐색 감지
    const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
      console.log('웹뷰 페이지 내 탐색:', e.url, '탭 ID:', tabId);

      // 브라우저 히스토리가 바뀌는 경우에 처리 (해시 변경 등)
      if (e.isMainFrame && tabId === activeTabId) {
        setCurrentUrl(e.url);
      }

      // 탭 URL 업데이트
      if (e.isMainFrame) {
        setTabs(prevTabs => prevTabs.map(tab =>
          tab.id === tabId
            ? { ...tab, url: e.url }
            : tab
        ));
      }
    };

    // 로딩 시작
    const handleDidStartLoading = () => {
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, isLoading: true, error: undefined }
          : tab
      ));
    };

    // 로딩 완료
    const handleDidStopLoading = () => {
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, isLoading: false }
          : tab
      ));
    };

    // 페이지 로드 실패
    const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      // 중단된 요청(-3)이나 프레임 로드 취소(-6)는 무시
      if (e.errorCode === -3 || e.errorCode === -6) {
        return;
      }

      console.error('페이지 로드 실패:', e.errorDescription, e.errorCode, e.validatedURL);

      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              isLoading: false,
              error: `페이지를 불러올 수 없습니다: ${e.errorDescription}`
            }
          : tab
      ));

      // 오류 페이지 표시
      webview.executeJavaScript(`
        document.body.innerHTML = \`
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#444;text-align:center;padding:20px;">
            <div style="width:64px;height:64px;margin-bottom:20px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 style="margin:0;font-size:24px;font-weight:500;">페이지를 불러올 수 없습니다</h2>
            <p style="margin:10px 0;">${e.errorDescription}</p>
            <p style="margin:10px 0 20px;color:#666;font-size:14px;">URL: ${e.validatedURL}</p>
            <button onclick="window.location.reload()" style="background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:14px;">새로고침</button>
          </div>
        \`;
      `);
    };

    // 웹뷰가 로드될 때
    const handleDidAttach = () => {
      console.log('웹뷰 연결됨:', tabId);

      // 대시보드 UI 요소 숨기기 - CSS 삽입
      webview.insertCSS(`
        /* 상단 헤더바 숨기기 */
        .MuiAppBar-root,
        header,
        .MuiToolbar-root,
        nav[class*="Header"],
        div[class*="Header"],
        div[class*="header"],
        div[class*="HeaderContainer"] {
          display: none !important;
        }

        /* 좌측 사이드바 숨기기 */
        .MuiDrawer-root,
        aside,
        nav[class*="Sidebar"],
        div[class*="Sidebar"],
        div[class*="sidebar"],
        div[class*="DrawerContainer"],
        div[class*="LeftPanel"] {
          display: none !important;
        }

        /* 설정 버튼 및 관리 옵션 숨기기 */
        button[aria-label*="settings"],
        button[aria-label*="Setting"],
        div[class*="setting"],
        div[class*="Setting"],
        div[class*="admin"],
        div[class*="Admin"],
        div[class*="management"],
        div[class*="Management"] {
          display: none !important;
        }

        /* 메인 컨텐츠 영역 전체 너비로 확장 */
        main,
        div[class*="Content"],
        div[class*="content"],
        div[class*="Main"],
        div[class*="main"],
        div[class*="Dashboard"],
        div[class*="dashboard"] {
          width: 100% !important;
          margin-left: 0 !important;
          padding-left: 0 !important;
          left: 0 !important;
        }

        /* 메뉴 및 탭바 숨기기 */
        ul[role="tablist"],
        div[role="tablist"],
        nav[class*="TabNav"],
        div[class*="TabContainer"],
        div[class*="MenuBar"] {
          display: none !important;
        }
      `).then(() => {
        console.log('대시보드 UI 요소 숨김 CSS 적용됨');
      }).catch(err => {
        console.error('CSS 삽입 실패:', err);
      });

      // 고급 웹뷰 설정 - 링크 클릭 및 네비게이션 문제 해결
      webview.executeJavaScript(`
        // 모든 a 태그에 클릭 이벤트 리스너 직접 추가
        function fixAllLinks() {
          console.log('링크 이벤트 재설정 시작');
          try {
            document.querySelectorAll('a').forEach(link => {
              // 기존 이벤트 제거
              const newLink = link.cloneNode(true);
              if (link.parentNode) {
                link.parentNode.replaceChild(newLink, link);
              }

              // 새 이벤트 리스너 추가
              newLink.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                  console.log('링크 클릭 감지:', href);
                  e.preventDefault();
                  e.stopPropagation();

                  // 상대 URL 처리
                  let fullUrl = href;
                  if (!href.startsWith('http')) {
                    const base = document.querySelector('base')?.href || window.location.origin;
                    fullUrl = new URL(href, base).href;
                  }

                  window.location.href = fullUrl;
                  return false;
                }
              });
            });
            console.log('링크 이벤트 재설정 완료');
          } catch(e) {
            console.error('링크 수정 오류:', e);
          }
        }

        // 페이지 로드 후 링크 수정
        if (document.readyState === 'complete') {
          fixAllLinks();
        } else {
          window.addEventListener('load', fixAllLinks);
        }

        // 추가 UI 요소 숨기기 함수
        function hideAdditionalElements() {
          // 관리자 설정 버튼 및 페이지 숨기기
          const adminButtons = document.querySelectorAll('button, a, div, span');
          adminButtons.forEach(el => {
            const text = el.textContent?.toLowerCase() || '';
            const classes = el.className?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';

            if (
              text.includes('admin') ||
              text.includes('관리자') ||
              text.includes('설정') ||
              text.includes('setting') ||
              classes.includes('admin') ||
              classes.includes('setting') ||
              id.includes('admin') ||
              id.includes('setting')
            ) {
              el.style.display = 'none';
            }
          });

          // 상단 네비게이션바 전체 숨기기
          const navs = document.querySelectorAll('nav, header, div[role="navigation"]');
          navs.forEach(nav => {
            nav.style.display = 'none';
          });

          console.log('추가 UI 요소 숨김 적용됨');
        }

        // 페이지 로드 후 및 DOM 변경 시 숨기기 적용
        window.addEventListener('load', hideAdditionalElements);

        // DOM 변경 감지하여 새로운 링크와 UI 요소도 처리
        const observer = new MutationObserver(mutations => {
          fixAllLinks();
          hideAdditionalElements();
        });

        // DOM 변경 관찰 시작
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });

        // 기본 쿠키 설정
        document.cookie = "allow_all_cookies=true; path=/; SameSite=None; Secure";
        document.cookie = "gamepot_session=active; path=/; SameSite=None; Secure";
        localStorage.setItem('gamepot-session-test', 'ok');
        sessionStorage.setItem('gamepot-session-test', 'ok');
      `).catch(e => console.error('초기화 스크립트 실행 오류:', e));

      // 추가 이벤트 리스너: 페이지가 타사 사이트로 이동하려 할 때
      webview.addEventListener('will-navigate', (e) => {
        console.log('새 페이지로 이동:', e.url);

        // 관리자 페이지나 설정 페이지로 이동 방지
        const url = e.url.toLowerCase();
        if (
          url.includes('/admin') ||
          url.includes('/setting') ||
          url.includes('/config') ||
          url.includes('/management') ||
          url.includes('/setup')
        ) {
          e.preventDefault();
          console.log('관리자/설정 페이지 이동 차단됨:', e.url);

          // 메인 대시보드로 리디렉션
          webview.loadURL(HOME_URL);
        }
      });

      // 추가 도메인 쿠키 설정
      setTimeout(() => {
        webview.executeJavaScript(`
          try {
            document.cookie = "allow_cookies=true; domain=dash.gamepot.beta.ntruss.com; path=/; SameSite=None; Secure";
            console.log('도메인 쿠키 설정 완료');
          } catch(e) {}
        `).catch(() => {});
      }, 500);

      // 헤더 설정 스크립트
      webview.addEventListener('did-start-loading', () => {
        try {
          // API 헤더 설정
          webview.executeJavaScript(`
            try {
              const version = "${appVersion}";

              // Fetch API
              const originalFetch = window.fetch;
              window.fetch = function(url, options) {
                options = options || {};
                if (!options.headers) options.headers = {};
                options.headers['X-STUDIO-VERSION'] = version;
                return originalFetch(url, options);
              };

              // XHR
              const originalOpen = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function() {
                this.addEventListener('readystatechange', function() {
                  if (this.readyState === 1) {
                    try { this.setRequestHeader('X-STUDIO-VERSION', version); } catch(e) {}
                  }
                });
                originalOpen.apply(this, arguments);
              };
            } catch(e) {}
          `).catch(() => {});
        } catch (error) {}
      });

      // 모든 새 창 이벤트를 현재 창으로 리디렉션
      webview.addEventListener('new-window', (e: any) => {
        e.preventDefault();
        console.log('새 창 요청 감지:', e.url);

        // URL이 유효하면 현재 탭에서 열기
        if (e.url) {
          console.log('현재 탭에서 열기:', e.url);
          webview.loadURL(e.url);

          // 탭 정보 업데이트
          setTabs(prevTabs => prevTabs.map(tab =>
            tab.id === tabId ? { ...tab, url: e.url, isLoading: true } : tab
          ));

          // 현재 탭이면 URL 상태 업데이트
          if (tabId === activeTabId) {
            setCurrentUrl(e.url);
          }
        }
      });
    };

    // 크래시 발생
    const handleCrashed = () => {
      console.error('웹뷰 크래시 발생:', tabId);
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              isLoading: false,
              error: `웹뷰가 크래시되었습니다. 탭을 다시 로드해주세요.`
            }
          : tab
      ));
    };

    // 플러그인 크래시
    const handlePluginCrashed = () => {
      console.error('플러그인 크래시 발생:', tabId);
    };

    webview.addEventListener('dom-ready', handleDidAttach);
    webview.addEventListener('page-title-updated', handlePageTitleUpdated);
    webview.addEventListener('page-favicon-updated', handlePageFaviconUpdated);
    webview.addEventListener('will-navigate', handleWillNavigate);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('crashed', handleCrashed);
    webview.addEventListener('plugin-crashed', handlePluginCrashed);

    return () => {
      webview.removeEventListener('dom-ready', handleDidAttach);
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handlePageFaviconUpdated);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('crashed', handleCrashed);
      webview.removeEventListener('plugin-crashed', handlePluginCrashed);
    };
  };

  // 새로고침
  const refreshActiveTab = () => {
    const webview = getActiveWebview();
    if (webview) {
      // 에러 상태 초기화
      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, isLoading: true, error: undefined }
          : tab
      ));
      webview.reload();

      // 페이지 로드 후 UI 요소 다시 숨기기
      setTimeout(() => {
        try {
          webview.insertCSS(`
            /* 모든 관리자 관련 버튼 숨기기 */
            button:has(svg[data-testid*="Admin"]),
            button:has(svg[data-testid*="Setting"]),
            [aria-label*="admin"],
            [aria-label*="setting"],
            [role="menuitem"],
            ul[role="menu"] {
              display: none !important;
              visibility: hidden !important;
            }

            /* 드롭다운 메뉴 비활성화 */
            .MuiPopover-root,
            div[role="presentation"],
            div[class*="Popover"],
            div[class*="Dropdown"],
            div[class*="dropdown"],
            div[class*="Menu"],
            div[class*="menu"] {
              display: none !important;
            }

            /* 팝업 및 모달 차단 */
            div[role="dialog"],
            div[aria-modal="true"],
            .MuiDialog-root,
            .modal,
            .dialog,
            div[class*="Modal"],
            div[class*="Dialog"],
            div[class*="modal"],
            div[class*="dialog"] {
              display: none !important;
            }
          `);
        } catch (e) {
          console.error('추가 CSS 삽입 실패:', e);
        }
      }, 1000);
    }
  };

  // 뒤로가기
  const goBack = () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  };

  // 앞으로가기
  const goForward = () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  };

  // 전체화면 토글
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // URL 입력창 활성화
  const focusUrlInput = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (urlInputRef.current) {
        urlInputRef.current.focus();
        urlInputRef.current.select();
      }
    }, 0);
  };

  // 웹뷰 참조 설정 (기존 함수 수정)
  const setWebviewRef = (id: string, ref: Electron.WebviewTag | null) => {
    if (ref) {
      webviewRefs.current.set(id, ref);
      setupWebviewEvents(ref, id);

      // 디버깅용 로그
      console.log('웹뷰 참조 설정됨:', id);

      // 링크와 관련된 특별한 이벤트 추가
      ref.addEventListener('dom-ready', () => {
        console.log('웹뷰 DOM 준비됨:', id);
      });

      // 클릭 이벤트 문제 해결을 위한 추가 감지
      ref.addEventListener('console-message', (e) => {
        if (e.message.includes('링크') || e.message.includes('navigation')) {
          console.log('웹뷰 콘솔:', e.message);
        }
      });
    }
  };

  // 북마크 불러오기
  const loadBookmarks = () => {
    try {
      const savedBookmarks = window.localStorage.getItem(BOOKMARKS_KEY);
      if (savedBookmarks) {
        setBookmarks(JSON.parse(savedBookmarks));
      }
    } catch (error) {
      console.error('북마크 불러오기 실패:', error);
    }
  };

  // 북마크 저장하기
  const saveBookmarks = useCallback((updatedBookmarks: Bookmark[]) => {
    try {
      window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updatedBookmarks));
    } catch (error) {
      console.error('북마크 저장 실패:', error);
    }
  }, []);

  // 북마크 추가/제거 토글
  const toggleBookmark = () => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (!activeTab) return;

    const existingBookmark = bookmarks.find(b => b.url === activeTab.url);
    let updatedBookmarks: Bookmark[];

    if (existingBookmark) {
      // 북마크 제거
      updatedBookmarks = bookmarks.filter(b => b.id !== existingBookmark.id);
    } else {
      // 북마크 추가
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        title: activeTab.title,
        url: activeTab.url,
        favicon: activeTab.favicon
      };
      updatedBookmarks = [...bookmarks, newBookmark];
    }

    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);
  };

  // 북마크 제거
  const removeBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedBookmarks = bookmarks.filter(b => b.id !== id);
    setBookmarks(updatedBookmarks);
    saveBookmarks(updatedBookmarks);
  };

  // 북마크로 이동
  const navigateToBookmark = (url: string) => {
    // 현재 탭 URL 변경
    setTabs(tabs.map(tab =>
      tab.id === activeTabId
        ? { ...tab, url, isLoading: true }
        : tab
    ));

    // webview 로드
    const webview = getActiveWebview();
    if (webview) {
      webview.loadURL(url);
    }

    setCurrentUrl(url);
    setIsBookmarksOpen(false);
  };

  // 홈으로 이동
  const navigateToHome = () => {
    const webview = getActiveWebview();
    if (webview) {
      webview.loadURL(HOME_URL);

      // 탭 정보 업데이트
      setTabs(tabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, url: HOME_URL }
          : tab
      ));

      setCurrentUrl(HOME_URL);
    }
  };

  // 줌 인
  const zoomIn = () => {
    const webview = getActiveWebview();
    if (webview) {
      const newZoom = Math.min(zoomFactor + 0.1, 3.0);
      webview.setZoomFactor(newZoom);
      setZoomFactor(newZoom);
    }
  };

  // 줌 아웃
  const zoomOut = () => {
    const webview = getActiveWebview();
    if (webview) {
      const newZoom = Math.max(zoomFactor - 0.1, 0.5);
      webview.setZoomFactor(newZoom);
      setZoomFactor(newZoom);
    }
  };

  // 줌 리셋
  const resetZoom = () => {
    const webview = getActiveWebview();
    if (webview) {
      webview.setZoomFactor(1.0);
      setZoomFactor(1.0);
    }
  };

  // 검색 실행
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const webview = getActiveWebview();
    if (webview && searchText) {
      webview.findInPage(searchText);
    }
  };

  // 검색 다음/이전 결과로 이동
  const findNext = (forward: boolean) => {
    const webview = getActiveWebview();
    if (webview && searchText) {
      webview.findInPage(searchText, { forward });
    }
  };

  // 검색 닫기
  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchText('');
    const webview = getActiveWebview();
    if (webview) {
      webview.stopFindInPage('clearSelection');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className={`flex flex-col bg-gray-100 ${isFullscreen ? 'hidden' : ''}`}>
        {/* 탭 바 */}
        <div className="flex items-center">
          <div className="flex-1 flex items-center overflow-x-auto">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center px-2 py-1 border-r border-gray-200 min-w-[100px] max-w-[180px] cursor-pointer text-xs ${
                  activeTabId === tab.id ? 'bg-white' : 'bg-gray-100'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.isLoading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin text-blue-500" />
                ) : tab.error ? (
                  <AlertTriangle className="w-3 h-3 mr-1 text-red-500" />
                ) : tab.favicon ? (
                  <img src={tab.favicon} alt="" className="w-3 h-3 mr-1" />
                ) : (
                  <div className="w-3 h-3 mr-1" />
                )}
                <div className="truncate text-xs flex-1">{tab.title}</div>
                <button
                  className="ml-1 text-gray-500 hover:text-gray-700"
                  onClick={(e) => closeTab(tab.id, e)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* 탭 관련 버튼 */}
          <div className="flex items-center px-2">
            <button
              className="p-1 hover:bg-gray-200 rounded"
              onClick={() => addTab()}
              title="새 탭 (Ctrl+T)"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* URL 바 */}
        <div className="flex items-center px-2 py-1 border-t border-gray-200">
          <button
            className={`p-1 mr-1 rounded ${isOffline ? 'text-red-500' : 'hover:bg-gray-200 text-gray-700'}`}
            onClick={goBack}
            disabled={isOffline}
            title="뒤로 가기 (Alt+←)"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className={`p-1 mr-1 rounded ${isOffline ? 'text-red-500' : 'hover:bg-gray-200 text-gray-700'}`}
            onClick={goForward}
            disabled={isOffline}
            title="앞으로 가기 (Alt+→)"
          >
            <ArrowRight size={16} />
          </button>
          <button
            className={`p-1 mr-1 rounded ${isOffline ? 'text-red-500' : 'hover:bg-gray-200 text-gray-700'}`}
            onClick={refreshActiveTab}
            disabled={isOffline}
            title="새로고침 (Ctrl+R)"
          >
            <RotateCw size={16} />
          </button>
          <button
            className={`p-1 mr-1 rounded ${isOffline ? 'text-red-500' : 'hover:bg-gray-200 text-gray-700'}`}
            onClick={navigateToHome}
            disabled={isOffline}
            title="홈으로 가기 (Ctrl+H)"
          >
            <Home size={16} />
          </button>

          <form onSubmit={handleUrlSubmit} className="flex-1 flex relative">
            <input
              ref={urlInputRef}
              type="text"
              className={`flex-1 px-3 py-1 border rounded-l text-xs ${
                isOffline ? 'border-red-300 bg-red-50' :
                tabs.find(t => t.id === activeTabId)?.error ? 'border-orange-300 bg-orange-50' :
                'border-gray-300'
              }`}
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              onFocus={() => setIsEditing(true)}
              onBlur={handleUrlBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUrlSubmit();
                }
              }}
              placeholder={isOffline ? "오프라인 상태입니다" : "URL 입력"}
              title="주소 입력 (Ctrl+L)"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-300 border-l-0 rounded-r text-xs"
              title="이동"
              onClick={handleUrlSubmit}
            >
              이동
            </button>
            {isOffline && (
              <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                <Zap className="h-3 w-3 text-red-500" />
              </div>
            )}
          </form>

          <button
            className={`ml-1 p-1 rounded ${
              bookmarks.some(b => b.url === currentUrl)
                ? 'text-blue-500 hover:bg-blue-100'
                : 'text-gray-500 hover:bg-gray-200'
            }`}
            onClick={toggleBookmark}
            title="북마크 추가/제거 (Ctrl+D)"
          >
            {bookmarks.some(b => b.url === currentUrl) ? (
              <Bookmark size={16} />
            ) : (
              <BookmarkPlus size={16} />
            )}
          </button>

          <button
            className="ml-1 p-1 hover:bg-gray-200 rounded"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            title="페이지에서 찾기 (Ctrl+F)"
          >
            <Search size={16} />
          </button>

          <div className="ml-1 flex items-center">
            <button
              className="p-1 hover:bg-gray-200 rounded"
              onClick={zoomOut}
              title="축소 (Ctrl+-)"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs mx-1 w-12 text-center">
              {Math.round(zoomFactor * 100)}%
            </span>
            <button
              className="p-1 hover:bg-gray-200 rounded"
              onClick={zoomIn}
              title="확대 (Ctrl++)"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <button
            className="ml-1 p-1 hover:bg-gray-200 rounded"
            onClick={toggleFullscreen}
            title="전체화면 전환"
          >
            <Maximize size={16} />
          </button>
        </div>

        {/* 검색 바 */}
        {isSearchOpen && (
          <div className="flex items-center px-2 py-1 border-t border-gray-200 bg-white">
            <form onSubmit={handleSearch} className="flex-1 flex items-center">
              <Search size={14} className="text-gray-500 mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="페이지에서 찾기"
                autoFocus
              />
              <button
                type="button"
                className="ml-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                onClick={() => findNext(false)}
                disabled={!searchText}
              >
                이전
              </button>
              <button
                type="submit"
                className="ml-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                disabled={!searchText}
              >
                다음
              </button>
              <button
                type="button"
                className="ml-1 p-1 text-gray-500 hover:text-gray-700"
                onClick={closeSearch}
              >
                <X size={14} />
              </button>
            </form>
          </div>
        )}

        {/* 북마크 바 */}
        {isBookmarksOpen && (
          <div className="flex items-center px-2 py-2 border-t border-gray-200 bg-white overflow-x-auto">
            {bookmarks.length === 0 ? (
              <span className="text-xs text-gray-500">북마크가 없습니다. Ctrl+D로 현재 페이지를 북마크에 추가할 수 있습니다.</span>
            ) : (
              bookmarks.map(bookmark => (
                <div
                  key={bookmark.id}
                  className="flex items-center px-2 py-1 mr-2 bg-gray-50 hover:bg-gray-100 rounded cursor-pointer text-xs"
                  onClick={() => navigateToBookmark(bookmark.url)}
                >
                  {bookmark.favicon ? (
                    <img src={bookmark.favicon} alt="" className="w-3 h-3 mr-1" />
                  ) : (
                    <Bookmark size={12} className="mr-1" />
                  )}
                  <span className="truncate max-w-[100px]">{bookmark.title}</span>
                  <button
                    className="ml-1 text-gray-400 hover:text-gray-700"
                    onClick={(e) => removeBookmark(bookmark.id, e)}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 웹뷰 컨테이너 */}
      <div className="flex-1 relative">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
          >
            <webview
              ref={(ref) => setWebviewRef(tab.id, ref as Electron.WebviewTag)}
              src={tab.url}
              className="w-full h-full border-0"
              allowpopups={true}
              webpreferences="contextIsolation=yes, javascript=yes, cookies=yes, webSecurity=yes, allowRunningInsecureContent=yes, nodeIntegration=no"
              partition="persist:gamepot"
              useragent={window.navigator.userAgent}
              disablewebsecurity={true}
            ></webview>
          </div>
        ))}
      </div>

      {/* 전체화면 컨트롤 */}
      {isFullscreen && (
        <div className="absolute top-2 right-2 z-50">
          <button
            className="p-1 bg-white bg-opacity-50 hover:bg-opacity-100 rounded shadow"
            onClick={toggleFullscreen}
            title="전체화면 해제"
          >
            <Minimize size={16} />
          </button>
        </div>
      )}

      {/* 오프라인 알림 */}
      {isOffline && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg shadow-lg px-4 py-2 flex items-center z-50">
          <Zap className="h-5 w-5 text-red-500 mr-2" />
          <span className="text-red-700 text-sm">인터넷 연결이 끊어졌습니다</span>
        </div>
      )}
    </div>
  );
};

export default WebViewController;
