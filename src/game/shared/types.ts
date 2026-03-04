import * as THREE from 'three'

export interface EnemyData {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  idleAction: THREE.AnimationAction
  runAction: THREE.AnimationAction
  attackAction: THREE.AnimationAction
  deathAction: THREE.AnimationAction
  state: 'idle' | 'run' | 'attack' | 'death'
  hp: number
  attackTimer: number
  attackRing: THREE.Mesh
  isDead: boolean
  hitFlash: number
  attackHitDealt: boolean
  deathTimer: number
  knockbackVel: THREE.Vector3
  stunTimer: number      // 스킬 피격 기절 (>0이면 AI 정지 + 노란 플래시)
  hitStopTimer: number   // 피격 시 애니메이션 일시 정지 (타격감)
  dizzyGroup: THREE.Group | null  // 기절 시 머리 위 회전 별 이펙트
}

export type Fx = {
  light: THREE.PointLight
  age: number
  sparks: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; age: number }>
}

export type SlashFx = { mesh: THREE.Mesh; age: number; dur: number; startS: number }
export type RingFx  = { mesh: THREE.Mesh; age: number; dur: number; maxS: number }
export type FlameFx = { mesh: THREE.Mesh; age: number; dur: number; vx: number; vz: number }

export interface EnemySource {
  enemies: EnemyData[]
  damageEnemy(enemy: EnemyData, amount: number): void
}
