# gamepot-studio-app

## Installation

### 1. Create project

```bash
$ pnpm create @quick-start/electron
```

### 2. Install dependencies

```bash
$ pnpm add tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react
```

### 3. Install Tailwind CSS

```bash
$ pnpm add -D tailwindcss postcss autoprefixer

$ pnpm dlx tailwindcss init -p
```

### 4. Update `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: `var(--radius)`,
        md: `calc(var(--radius) - 2px)`,
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
```

### 5. Update `tsconfig.json`

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/renderer/src/*"]
    }
  }
}
```

### 6. Update `tsconfig.web.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/renderer/src/*"],
      "@renderer/*": ["src/renderer/src/*"]
    }
  }
}
```

### 7. Create `components.json`

```json
{
  "style": "new-york",
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/renderer/src/assets/base.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "rsc": false,
  "aliases": {
    "utils": "@/lib/utils",
    "components": "@/components",
    "lib": "@/lib",
    "hooks": "@/lib/hooks",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
```

### 8. Update `src/renderer/src/assets/base.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 47.4% 11.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 47.4% 11.2%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 100% 50%;
    --destructive-foreground: 210 40% 98%;
    --ring: 215 20.2% 65.1%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215.4 16.3% 56.9%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --popover: 224 71% 4%;
    --popover-foreground: 215 20.2% 65.1%;
    --border: 216 34% 17%;
    --input: 216 34% 17%;
    --card: 224 71% 4%;
    --card-foreground: 213 31% 91%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 1.2%;
    --secondary: 222.2 47.4% 11.2%;
    --secondary-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --ring: 216 34% 17%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply font-sans antialiased bg-background text-foreground;
  }
}
```

## 빌드 및 배포

### 필수 요구사항

- [Node.js](https://nodejs.org/) 16.x 이상
- [pnpm](https://pnpm.io/) 8.x 이상
- macOS 빌드의 경우 Apple Developer ID
- Windows 빌드의 경우 Windows 환경

### 의존성 설치

```bash
pnpm install
```

### 인스톨러 빌드

#### Windows 인스톨러

```bash
pnpm run build:win-installer
```

#### macOS 인스톨러

서명되지 않은 버전 (개발용):
```bash
pnpm run build:mac-installer
```

서명된 버전 (배포용):
```bash
pnpm run build:mac-installer-signed
```

#### Linux 인스톨러

```bash
pnpm run build:linux-installer
```

### macOS 앱 인증 설정

macOS 앱 인증을 위해서는 다음 환경 변수를 설정해야 합니다:

```bash
export APPLE_ID="your.apple.id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" # Apple ID 앱 특정 비밀번호
export APPLE_TEAM_ID="XXXXXXXXXX" # Apple Developer 팀 ID
```

1. Apple Developer 계정 필요 (연 $99)
2. Apple Developer 사이트에서 인증서 생성 필요
3. 앱 특정 비밀번호 생성: [Apple ID 관리 페이지](https://appleid.apple.com/)
4. 팀 ID 확인: [Apple Developer 계정](https://developer.apple.com/account) > Membership

자세한 내용은 [electron-builder 문서](https://www.electron.build/code-signing)를 참조하세요.
