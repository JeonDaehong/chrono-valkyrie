export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720

// 도트 게임 — 논리 해상도 (실제 픽셀 2배 업스케일)
export const LOGIC_WIDTH = 640
export const LOGIC_HEIGHT = 360

export const TILE_SIZE = 16

// 플레이어 스탯
export const PLAYER_SPEED = 300
export const PLAYER_MAX_HP = 100
export const PLAYER_INVINCIBLE_DURATION = 600 // ms

// 레이어 깊이
export const DEPTH = {
  FLOOR: 0,
  SHADOW: 1,
  ENTITY: 10,
  PLAYER: 20,
  PROJECTILE: 30,
  EFFECT: 40,
  UI: 100,
} as const
