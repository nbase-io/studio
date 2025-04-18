# GamePot Studio

게임팟 스튜디오는 게임 관리 시스템을 위한 데스크톱 애플리케이션입니다.

## 주요 기능

- 게임 프로젝트 관리
- 리소스 관리
- 빌드 및 배포
- AWS S3 통합
- 자동 업데이트

## 기술 스택

- Electron
- React
- TypeScript
- Tailwind CSS
- Radix UI
- AWS SDK

## 설치 방법

1. Node.js 20.x 이상 설치
2. pnpm 설치
3. 프로젝트 클론
4. 의존성 설치:
```bash
pnpm install
```

## 개발 환경 설정

1. 개발 서버 실행:
```bash
pnpm dev
```

2. 빌드:
```bash
# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```

## 패치 및 업데이트

### 패치 적용 방법
1. 패치 파일 다운로드
2. 프로젝트 루트에 패치 파일 복사
3. 다음 명령어 실행:
```bash
pnpm install
```

### 자동 업데이트 설정
1. `electron-update.yml` 파일을 프로젝트 루트에 복사
2. GitHub 저장소 정보로 설정 수정:
   - owner: GitHub 사용자명
   - repo: 저장소 이름
3. 애플리케이션 재시작

## 지원 플랫폼

- macOS
- Windows
- Linux

## 버전 관리

- 현재 버전: 1.0.0
- 자동 업데이트 지원

## 업데이트 URL 설정 가이드

[업데이트 URL 설정 가이드 확인하기](https://nbase-io.github.io/studio/update-url.md)
