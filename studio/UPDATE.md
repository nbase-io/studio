# GamePot Studio 업데이트 가이드

이 문서는 GamePot Studio 애플리케이션의 자동 업데이트 시스템 사용 방법을 설명합니다.

## 1. 개요

GamePot Studio는 `electron-updater` 패키지를 사용한 자동 업데이트 시스템을 구현하고 있습니다. 이를 통해 사용자는 애플리케이션을 재설치하지 않고도 최신 버전을 받을 수 있습니다.

## 2. 버전 업데이트 방법

### 2.1 버전 번호 변경

새 버전을 배포하기 전에 `package.json` 파일의 `version` 필드를 업데이트하세요. 버전 번호는 [시맨틱 버저닝](https://semver.org/lang/ko/) 규칙을 따르는 것이 좋습니다.

```json
{
  "name": "GamePot-Studio",
  "version": "1.0.1",  // 여기서 버전을 변경 (예: 1.0.0 → 1.0.1)
  ...
}
```

주요 변경사항이 있을 때는 메이저 버전(1.0.0 → 2.0.0)을, 기능 추가는 마이너 버전(1.0.0 → 1.1.0)을, 버그 수정은 패치 버전(1.0.0 → 1.0.1)을 업데이트하세요.

### 2.2 변경 사항 기록

애플리케이션의 변경 사항을 `CHANGELOG.md` 파일에 기록하는 것이 좋습니다. 이를 통해 사용자는 각 버전에서 무엇이 변경되었는지 확인할 수 있습니다.

## 3. 빌드 및 배포 프로세스

### 3.1 애플리케이션 빌드

각 플랫폼별 빌드 명령어:

```bash
# Windows 용 빌드
npm run build:win

# macOS 용 빌드
npm run build:mac

# Linux 용 빌드
npm run build:linux
```

빌드가 완료되면 `dist` 폴더에 설치 파일과 함께 다음 파일들이 생성됩니다:
- Windows: `latest.yml`, `GamePot-Studio-[버전]-setup.exe`
- macOS: `latest-mac.yml`, `GamePot-Studio-[버전].dmg`, `GamePot-Studio-[버전]-mac.zip`
- Linux: `latest-linux.yml`, `GamePot-Studio-[버전].AppImage`

### 3.2 업데이트 서버 설정

업데이트 파일을 호스팅할 서버가 필요합니다. 일반적으로 Amazon S3, GitHub Releases 또는 자체 웹 서버를 사용할 수 있습니다.

1. `electron-builder.yml` 파일의 `publish` 섹션에서 실제 업데이트 서버 URL을 설정합니다:

```yaml
publish:
  provider: generic
  url: https://your-update-server.com/updates/
  channel: latest
  publishAutoUpdate: true
```

2. `dev-app-update.yml` 파일에서도 동일한 URL을 설정합니다:

```yaml
provider: generic
url: https://your-update-server.com/updates/
updaterCacheDirName: gamepot-studio-updater
```

### 3.3 업데이트 파일 업로드

빌드 후 생성된 다음 파일들을 업데이트 서버에 업로드해야 합니다:

**Windows:**
- `latest.yml`
- `GamePot-Studio-[버전]-setup.exe`

**macOS:**
- `latest-mac.yml`
- `GamePot-Studio-[버전].dmg`
- `GamePot-Studio-[버전]-mac.zip` (선택사항)

**Linux:**
- `latest-linux.yml`
- `GamePot-Studio-[버전].AppImage`

## 4. 업데이트 파일 형식

### 4.1 latest.yml (Windows) 예시

```yaml
version: 1.0.1
files:
  - url: GamePot-Studio-1.0.1-setup.exe
    sha512: dWjH9gwUUEuJfC8+8Y8IetpDRzFnE8OIm0BgHUwJglJDIJYS7Zm1sQbcGj3G0Y6h7SYU0XHpnYBiZnBJaJ6Uew==
    size: 68540728
path: GamePot-Studio-1.0.1-setup.exe
sha512: dWjH9gwUUEuJfC8+8Y8IetpDRzFnE8OIm0BgHUwJglJDIJYS7Zm1sQbcGj3G0Y6h7SYU0XHpnYBiZnBJaJ6Uew==
releaseDate: '2023-07-15T14:22:13.972Z'
```

### 4.2 latest-mac.yml (macOS) 예시

```yaml
version: 1.0.1
files:
  - url: GamePot-Studio-1.0.1.dmg
    sha512: j6K3n8G7MJlYM5Uw8InOsazFVzv4RX6zq1fHQ3OLjdB2o4vWQJLv9RZqeMCBXnI35uO+RlAxJSKVwpq+5kPQ==
    size: 75248936
  - url: GamePot-Studio-1.0.1-mac.zip
    sha512: sT4jPKvxZu9O6YL+pMmjGp4lPYFGRnEGCDjlcIr93Z5y2TuOXnWJY7FnwP8DP2xUWYkxb3Jsj8T6Z1hJKw==
    size: 74982536
path: GamePot-Studio-1.0.1.dmg
sha512: j6K3n8G7MJlYM5Uw8InOsazFVzv4RX6zq1fHQ3OLjdB2o4vWQJLv9RZqeMCBXnI35uO+RlAxJSKVwpq+5kPQ==
releaseDate: '2023-07-15T14:30:45.221Z'
```

## 5. 자동 업데이트 테스트

### 5.1 개발 환경에서 테스트

개발 환경에서 자동 업데이트를 테스트하려면:

1. `dev-app-update.yml` 파일이 올바르게 설정되어 있는지 확인합니다.
2. 다음 코드를 사용하여 업데이트를 수동으로 트리거할 수 있습니다:

```typescript
window.api.checkForUpdates();
```

### 5.2 프로덕션 테스트

실제 환경에서 테스트하려면:

1. 낮은 버전의 애플리케이션을 빌드하여 설치합니다.
2. `package.json`에서 버전을 업데이트하고 새 버전을 빌드합니다.
3. 새 빌드 파일과 `latest.yml`(또는 기타 플랫폼의 업데이트 파일)을 업데이트 서버에 업로드합니다.
4. 이전 버전의 애플리케이션을 실행하면 업데이트 알림이 표시됩니다.

## 6. 문제 해결

### 6.1 업데이트가 감지되지 않는 경우

- `package.json`의 버전 번호가 올바르게 증가했는지 확인하세요.
- 업데이트 서버 URL이 `electron-builder.yml`과 `dev-app-update.yml`에 올바르게 설정되어 있는지 확인하세요.
- 필요한 모든 파일이 업데이트 서버에 업로드되었는지 확인하세요.
- 애플리케이션이 개발 모드가 아닌 프로덕션 모드로 실행 중인지 확인하세요(개발 모드에서는 자동 업데이트가 비활성화됨).

### 6.2 로그 확인

자동 업데이트 로그는 다음 위치에서 확인할 수 있습니다:

- Windows: `%USERPROFILE%\AppData\Roaming\GamePot-Studio\logs\main.log`
- macOS: `~/Library/Logs/GamePot-Studio/main.log`
- Linux: `~/.config/GamePot-Studio/logs/main.log`

## 7. 보안 고려사항

### 7.1 코드 서명

프로덕션 환경에서는 애플리케이션에 코드 서명을 적용하는 것이 좋습니다. 이는 사용자에게 애플리케이션의 신뢰성을 보장하고, 특히 macOS에서 Gatekeeper 경고를 방지합니다.

Windows 및 macOS에서 코드 서명을 설정하는 방법은 [electron-builder 문서](https://www.electron.build/code-signing)를 참조하세요.

### 7.2 업데이트 무결성

`electron-updater`는 파일의 SHA512 해시를 확인하여 업데이트 파일의 무결성을 검증합니다. 이 과정은 자동으로 처리되지만, 업데이트 파일이 손상되지 않도록 주의해야 합니다.
