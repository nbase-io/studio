# Electron Update URL 설정

## 1. 메인 프로세스에서 설정

```typescript
import { autoUpdater } from 'electron-updater'

// 업데이트 URL 설정
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'osoriz',
  repo: 'studio',
  private: false,
  token: process.env.GITHUB_TOKEN // 선택적
})

// 업데이트 체크
autoUpdater.checkForUpdates()
```

## 2. 환경 변수로 설정

```bash
# .env 파일에 추가
ELECTRON_UPDATE_URL=https://github.com/osoriz/studio/releases/latest
```

## 3. package.json에서 설정

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "osoriz",
      "repo": "studio"
    }
  }
}
```

## 주의사항

- GitHub 토큰이 필요한 경우 `GITHUB_TOKEN` 환경 변수 설정
- 프라이빗 저장소인 경우 `private: true` 설정
- 업데이트 채널 변경 시 `channel` 옵션 사용
