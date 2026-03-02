export const MOVE_SPEED = 10
export const BOUNDARY  = 29

export const ENEMY_HP           = 80
export const ENEMY_ATTACK_RANGE = 2.5
export const ENEMY_DETECT_RANGE = 14
export const ENEMY_ATTACK_DMG   = 20

export const PLAYER_ATTACK_RANGE = 3.5
export const PLAYER_ATTACK_DMG   = 25

export const Q_COOLDOWN       = 3.0
export const Q_KNOCKBACK_FORCE = 12.0
export const Q_ATTACK_RANGE = 8.0
export const Q_CONE_ANGLE  = Math.PI * 0.8    // ~144° 부채꼴
export const Q_ATTACK_DMG  = 40

export const BLINK_MAX      = 3
export const BLINK_RECHARGE = 5
export const BLINK_DIST     = 7

// ── enemy2 (원거리 적) ────────────────────────────────────────────────
export const ENEMY2_HP              = 60
export const ENEMY2_DETECT_RANGE    = 20
export const ENEMY2_ATTACK_RANGE    = 12   // 이 거리 안에 들어오면 사격 시작
export const ENEMY2_MIN_DIST        = 5    // 이 거리보다 가까우면 후퇴
export const ENEMY2_MOVE_SPEED      = 4
export const ENEMY2_ATTACK_INTERVAL = 2.5  // 발사 주기 (초)
export const ENEMY2_FIRE_DELAY      = 0.5  // 애니메이션 시작 → 발사 딜레이

// 파이어볼
export const FIREBALL_DMG        = 18
export const FIREBALL_SPEED      = 14
export const FIREBALL_HIT_RADIUS = 1.2
export const FIREBALL_MAX_AGE    = 3.0

// ── 보스 ──────────────────────────────────────────────────────────────
export const BOSS_HP              = 2400  // 800 * 3
export const BOSS_SCALE           = 0.0506  // 0.022 * 2.3
export const BOSS_SPEED           = 5
export const BOSS_AWAKENED_SPEED  = 6.5   // 각성 후 +30%
export const BOSS_MELEE_RANGE     = 6.5   // 크기 3배에 맞춰 증가
export const BOSS_ATTACK1_DMG     = 40    // 휘두르기
export const BOSS_ATTACK2_DMG     = 30    // 펀치
export const BOSS_JUMP_DMG        = 60    // 점프 착지
export const BOSS_JUMP_RADIUS     = 5.5   // 착지 AOE 반경
export const BOSS_JUMP_KNOCKBACK  = 14
export const BOSS_STONE_DMG       = 35    // 돌 던지기
export const BOSS_STONE_SPEED     = 16
export const BOSS_STONE_RADIUS    = 3.0
export const BOSS_CHARGE_DMG      = 55    // 돌진
export const BOSS_CHARGE_SPEED    = 22
export const BOSS_AWAKEN_RATIO    = 0.3   // HP 30% 이하 각성
export const BOSS_AWAKEN_DMG_MULT = 1.5
export const BOSS_METEOR_DMG      = 45
export const BOSS_METEOR_RADIUS   = 3.5

// ── 플레이어 신규 스킬 ────────────────────────────────────────────────
export const W_COOLDOWN   = 5.0
export const W_DMG        = 45
export const W_DMG2       = 30
export const W_RANGE      = 5.5
export const W_STUN_DUR   = 1.0

export const E_COOLDOWN   = 5.0
export const E_DMG        = 50
export const E_RANGE      = 7.0
export const E_KNOCKBACK  = 40.0

export const SHIELD_COOLDOWN = 5.0
