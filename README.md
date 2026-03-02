# Top-Down Action RPG

탑다운 시점의 3D 액션 RPG 게임. Three.js 기반 3D 렌더링과 Phaser 메뉴 시스템을 결합하고, Electron으로 데스크톱 앱으로 배포합니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 3D 렌더링 | Three.js 0.183 |
| 메뉴/타이틀 | Phaser 3.88 |
| UI 오버레이 | React 19 |
| 언어 | TypeScript 5.7 |
| 번들러 | Vite 6 |
| 데스크톱 | Electron 33 |
| 패키징 | electron-builder |

---

## 프로젝트 구조

```
src/
├── game/
│   ├── config/       # 해상도·DEPTH 상수 (Phaser)
│   ├── scenes/       # BootScene, MenuScene
│   ├── shared/       # 공통 타입 및 게임 수치 상수
│   ├── world/        # WorldManager (Three.js 씬), MapBuilder (맵 오브젝트)
│   ├── audio/        # AudioManager (BGM + 효과음)
│   ├── ui/           # HUD (HP바, 쿨타임, 비네트)
│   ├── fx/           # EffectSystem (파티클 풀), DamageNumber
│   ├── player/       # PlayerAnimation, PlayerController, PlayerCombat
│   └── enemy/        # EnemyManager, Enemy2Manager, BossManager
├── ui/
│   ├── App.tsx        # React 루트
│   ├── GameWorld.tsx  # Three.js 모듈 조립 래퍼
│   ├── preloader.ts   # GLB/FBX 에셋 프리로드
│   └── LoadingScreen.tsx
├── assets/
│   └── img/
│       ├── player/   # 플레이어 GLB 애니메이션 파일
│       └── main.jpg  # 메뉴 배경
└── main.tsx          # Phaser + React 동시 마운트
electron/
├── main.cjs          # IPC 핸들러, 파일 저장
└── preload.cjs       # contextBridge API
```

---

## 씬 흐름

```
Phaser BootScene → MenuScene
       ↓ (New Game 클릭)
CustomEvent('game:startWorld')
       ↓
App.tsx → <GameWorld> 렌더 (Three.js 게임 시작)
       ↓ (ESC 키)
MenuScene 복귀
```

---

## 플레이어 스킬

| 키 | 스킬 | 설명 |
|----|------|------|
| 마우스 LMB | 기본 공격 | 전방 부채꼴 근접 공격 (DMG 25) |
| Q | 광역 참격 | 144° 부채꼴, 넉백 포함 (DMG 40, 쿨 3초) |
| W | 쉴드 슬램 | 마우스 위치로 순간이동 → 내려찍기 → 폭발 2단 (DMG 45/30, 쿨 5초) |
| E | 방패 돌진 | 전방 강타 + 강력 넉백 (DMG 50, 쿨 5초) |
| Shift | 점멸 | 최대 3회 충전, 5초마다 충전 |

---

## 적 종류

| 이름 | 설명 |
|------|------|
| 근접 적 | 플레이어를 추적해 근접 공격 (HP 80) |
| 원거리 적 | 일정 거리 유지하며 파이어볼 발사 (HP 60, 사거리 12) |
| 보스 | 고HP(2400) 상태머신 AI — 휘두르기·펀치·점프·돌 던지기·돌진·운석 6개 패턴. HP 30% 이하 각성(속도·데미지 ×1.5) |

---

## 시작하기

### 요구사항

- Node.js 18 이상
- npm 9 이상

### 설치

```bash
npm install
```

### 실행

```bash
# 브라우저 테스트 (localhost:5173)
npm run dev

# Electron 앱 실행
npm run dev:electron
```

### 빌드

```bash
# 웹 빌드
npm run build

# Windows 설치 파일(.exe) + zip 빌드
npm run build:electron
```

빌드 산출물은 `dist-electron/` 폴더에 생성됩니다.

---

## 카메라 / 렌더링 설정

- `PerspectiveCamera(fov=50)` — `(0, 18, 12)` 위치, `(0,0,0)` LookAt (탑다운 약각도)
- 그림자: `PCFSoftShadowMap`, DirectionalLight, shadowMap `1024×1024`
- 마우스 시선: Raycaster → 지면(y=0) 교차 → `atan2(dx, dz)` → 캐릭터 `rotation.y`
