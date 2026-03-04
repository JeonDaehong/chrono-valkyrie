// ── 스테이지 설정 ──────────────────────────────────────────────────────

export interface StageEnemySpawn {
  type: 'melee' | 'ranged'
  position: [number, number]   // [x, z]
}

export interface StageWaveDef {
  enemies: StageEnemySpawn[]
  delay?: number  // 이전 웨이브 전멸 후 대기 시간 (초, 기본 0)
}

/** AABB 워커블 영역 (minX, maxX, minZ, maxZ) */
export type WalkableZone = [number, number, number, number]

export interface PortalDef {
  position: [number, number]  // [x, z]
}

export interface StageDefinition {
  id: number
  name: string
  mapType: 'wakeup' | 'alleyL' | 'alleyReverse' | 'plaza' | 'coreLab'
  playerSpawn: [number, number]
  /** 워커블 영역 배열 — 플레이어·적 이동 제한 */
  walkableZones: WalkableZone[]
  waves: StageWaveDef[]
  portal?: PortalDef
  spawnBoss: boolean
}

export const STAGES: StageDefinition[] = [
  // ── 0: 시작방 ─────────────────────────────────────────────────────────
  {
    id: 0,
    name: '시작방',
    mapType: 'wakeup',
    playerSpawn: [0, 0],
    walkableZones: [[-5, 5, -5, 5]],
    waves: [],
    portal: { position: [5, 0] },
    spawnBoss: false,
  },
  // ── 1: ㄱ자 골목 ─────────────────────────────────────────────────────
  // 수평: x[-22,22] z[-22,-12]  |  수직: x[12,22] z[-12,22]
  {
    id: 1,
    name: '연구소 골목 A',
    mapType: 'alleyL',
    playerSpawn: [-20, -17],
    walkableZones: [
      [-22, 22, -22, -12],   // 수평 복도
      [12, 22, -12, 22],     // 수직 복도
    ],
    waves: [
      {
        enemies: [
          { type: 'melee', position: [-10, -17] },
          { type: 'melee', position: [-4, -17] },
          { type: 'melee', position: [4, -17] },
          { type: 'ranged', position: [10, -17] },
          { type: 'melee', position: [17, -6] },
          { type: 'ranged', position: [17, 6] },
        ],
      },
    ],
    portal: { position: [17, 20] },
    spawnBoss: false,
  },
  // ── 2: ㄴ자 골목 ─────────────────────────────────────────────────────
  // 수직: x[-22,-12] z[-22,22]  |  수평: x[-12,22] z[-22,-12]
  {
    id: 2,
    name: '연구소 골목 B',
    mapType: 'alleyReverse',
    playerSpawn: [-17, 20],
    walkableZones: [
      [-22, -12, -22, 22],   // 수직 복도
      [-12, 22, -22, -12],   // 수평 복도
    ],
    waves: [
      {
        enemies: [
          { type: 'melee', position: [-17, 10] },
          { type: 'melee', position: [-17, 2] },
          { type: 'ranged', position: [-17, -4] },
          { type: 'melee', position: [-6, -17] },
          { type: 'melee', position: [2, -17] },
          { type: 'ranged', position: [8, -17] },
          { type: 'melee', position: [14, -17] },
        ],
      },
    ],
    portal: { position: [20, -17] },
    spawnBoss: false,
  },
  // ── 3: 광장 ───────────────────────────────────────────────────────────
  {
    id: 3,
    name: '광장',
    mapType: 'plaza',
    playerSpawn: [0, 0],
    walkableZones: [[-27, 27, -27, 27]],
    waves: [
      {
        enemies: [
          { type: 'melee', position: [-20, -20] },
          { type: 'melee', position: [20, -20] },
          { type: 'melee', position: [-20, 20] },
          { type: 'melee', position: [20, 20] },
          { type: 'melee', position: [0, -22] },
          { type: 'melee', position: [0, 22] },
        ],
      },
      {
        delay: 2,
        enemies: [
          { type: 'melee', position: [-22, 0] },
          { type: 'melee', position: [22, 0] },
          { type: 'ranged', position: [-18, -18] },
          { type: 'ranged', position: [18, -18] },
          { type: 'ranged', position: [-18, 18] },
          { type: 'melee', position: [15, 15] },
          { type: 'melee', position: [-15, 15] },
        ],
      },
      {
        delay: 3,
        enemies: [
          { type: 'melee', position: [-24, -10] },
          { type: 'melee', position: [24, -10] },
          { type: 'melee', position: [-24, 10] },
          { type: 'melee', position: [24, 10] },
          { type: 'ranged', position: [0, -24] },
          { type: 'ranged', position: [0, 24] },
          { type: 'ranged', position: [-20, 0] },
          { type: 'ranged', position: [20, 0] },
        ],
      },
    ],
    portal: { position: [0, -26] },
    spawnBoss: false,
  },
  // ── 4: 핵심 연구소 ───────────────────────────────────────────────────
  {
    id: 4,
    name: '핵심 연구소',
    mapType: 'coreLab',
    playerSpawn: [0, 22],
    walkableZones: [[-27, 27, -27, 27]],
    waves: [
      {
        enemies: [
          { type: 'melee', position: [-22, -22] },
          { type: 'melee', position: [22, -22] },
          { type: 'melee', position: [-22, 22] },
          { type: 'melee', position: [22, 22] },
          { type: 'melee', position: [0, -24] },
          { type: 'melee', position: [0, 24] },
          { type: 'melee', position: [-24, 0] },
          { type: 'melee', position: [24, 0] },
          { type: 'ranged', position: [0, -18] },
          { type: 'ranged', position: [18, 0] },
          { type: 'ranged', position: [0, 18] },
          { type: 'ranged', position: [-18, 0] },
          { type: 'ranged', position: [13, 13] },
        ],
      },
    ],
    spawnBoss: true,
  },
]

// ── 워커블 존 충돌 유틸 ──────────────────────────────────────────────
/** 포지션을 가장 가까운 워커블 존 안으로 클램프 */
export function clampToZones(x: number, z: number, zones: WalkableZone[]): [number, number] {
  // 이미 어딘가 존 안이면 그대로
  for (const [minX, maxX, minZ, maxZ] of zones) {
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return [x, z]
  }
  // 존 밖이면 가장 가까운 존 표면으로 밀기
  let bestX = x, bestZ = z, bestDist = Infinity
  for (const [minX, maxX, minZ, maxZ] of zones) {
    const cx = Math.max(minX, Math.min(maxX, x))
    const cz = Math.max(minZ, Math.min(maxZ, z))
    const dx = x - cx, dz = z - cz
    const d = dx * dx + dz * dz
    if (d < bestDist) {
      bestDist = d
      bestX = cx
      bestZ = cz
    }
  }
  return [bestX, bestZ]
}
