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
export const ENEMY2_FIRE_DELAY      = 1.0  // 애니메이션 시작 → 발사 딜레이 (궤도 표시 1초)

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
export const BOSS_AWAKEN_RATIO_1  = 0.7   // HP 70% — 1차 각성기
export const BOSS_AWAKEN_RATIO_2  = 0.3   // HP 30% — 2차 각성기 (이후 각성 상태 유지)
export const BOSS_AWAKEN_DMG_MULT = 1.5
export const BOSS_METEOR_DMG      = 45
export const BOSS_METEOR_RADIUS   = 3.5

// ── 보스 신규 패턴 ──────────────────────────────────────────────────
// Dive Attack (다이브 찍기)
export const BOSS_DIVE_DMG        = 70
export const BOSS_DIVE_RADIUS     = 6.0
export const BOSS_DIVE_HEIGHT     = 14
export const BOSS_DIVE_RISE_TIME  = 0.8
export const BOSS_DIVE_HANG_TIME  = 1.2
export const BOSS_DIVE_FALL_TIME  = 0.25

// Fire Sweep (불꽃 쓸기)
export const BOSS_FIRESWEEP_DMG   = 30
export const BOSS_FIRESWEEP_SPEED = 14
export const BOSS_FIRESWEEP_COUNT = 7
export const BOSS_FIRESWEEP_ARC   = Math.PI * 0.7

// Meteor Rain as regular skill
export const BOSS_METEOR_SKILL_DUR = 6.0
export const BOSS_METEOR_SKILL_CD  = 0.4

// Terrain Destruction (각성기)
export const BOSS_TERRAIN_DESTROY_1 = 8
export const BOSS_TERRAIN_DESTROY_2 = 12

// Shockwave Stomp (충격파 밟기)
export const BOSS_STOMP_DMG       = 35
export const BOSS_STOMP_RINGS     = 3
export const BOSS_STOMP_INTERVAL  = 0.5

// Rock Barrage (나선 투석)
export const BOSS_BARRAGE_DMG     = 25
export const BOSS_BARRAGE_COUNT   = 10
export const BOSS_BARRAGE_SPEED   = 12
export const BOSS_BARRAGE_DUR     = 2.0

// Ground Slam Chain (연속 지면 강타)
export const BOSS_SLAMCHAIN_DMG      = 40
export const BOSS_SLAMCHAIN_RADIUS   = 3.0
export const BOSS_SLAMCHAIN_COUNT    = 3
export const BOSS_SLAMCHAIN_INTERVAL = 0.6

// Whirlwind (회오리)
export const BOSS_WHIRL_DMG      = 20
export const BOSS_WHIRL_RADIUS   = 4.5
export const BOSS_WHIRL_SPEED    = 10
export const BOSS_WHIRL_DUR      = 3.0
export const BOSS_WHIRL_TICK     = 0.4

// Grab/Throw (잡기/던지기)
export const BOSS_GRAB_DASH_SPEED = 18
export const BOSS_GRAB_RANGE      = 3.5
export const BOSS_GRAB_DMG        = 55
export const BOSS_GRAB_STUN       = 1.5

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

export const SHIELD_MAX_GAUGE   = 100
export const SHIELD_DRAIN_RATE  = 40   // 초당 게이지 소모
export const SHIELD_REGEN_RATE  = 15   // 초당 게이지 재생 (비방어 시)
export const SHIELD_REGEN_DELAY = 1.5  // 방어 해제 후 재생 시작 딜레이
export const SHIELD_BLOCK_COST  = 10   // 공격 1회 막을 때 추가 소모

// ── R 미사일 스킬 ──────────────────────────────────────────────────
export const R_COOLDOWN       = 8.0
export const R_MISSILE_COUNT  = 3
export const R_MISSILE_DMG    = 35
export const R_MISSILE_SPEED  = 12
export const R_MISSILE_RANGE  = 15
export const R_HIT_RADIUS     = 1.5
export const R_EXPLODE_RADIUS = 3.0

// ── 히트스톱 (공격별 차등) ──────────────────────────────────────────
export const HITSTOP_BASIC   = 0.06
export const HITSTOP_Q       = 0.12
export const HITSTOP_W       = 0.20
export const HITSTOP_E       = 0.15
export const HITSTOP_R        = 0.10
export const HITSTOP_ATTACKER = 0.04  // 공격자(플레이어) 히트스톱

// ── 3-hit 콤보 ──────────────────────────────────────────────────────
export const COMBO_WINDOW     = 0.5   // 연속 클릭 허용 시간
export const COMBO_DMG        = [25, 30, 45]   // 1타/2타/3타 데미지
export const COMBO_LUNGE      = [1.0, 1.2, 1.8] // 전진 거리
export const COMBO_HITSTOP    = [0.04, 0.06, 0.10] // 타격별 공격자 히트스톱
