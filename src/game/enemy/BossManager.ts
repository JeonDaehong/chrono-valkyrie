import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import enemyHitUrl   from '@assets/sound/enemy_hit.mp3?url'
import enemyDeathUrl from '@assets/sound/enemy_death.mp3?url'
import bangUrl       from '@assets/sound/bang.mp3?url'
import {
  boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
  boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
  fireballFbxPromise,
} from '../../ui/preloader'
import type { EnemyData } from '../shared/types'
import type { EffectSystem } from '../fx/EffectSystem'
import type { AudioManager } from '../audio/AudioManager'
import type { HUD } from '../ui/HUD'
import {
  BOSS_HP, BOSS_SCALE, BOSS_SPEED, BOSS_AWAKENED_SPEED,
  BOSS_MELEE_RANGE, BOSS_ATTACK1_DMG, BOSS_ATTACK2_DMG,
  BOSS_JUMP_DMG, BOSS_JUMP_RADIUS,
  BOSS_STONE_DMG, BOSS_STONE_SPEED, BOSS_STONE_RADIUS,
  BOSS_CHARGE_DMG, BOSS_CHARGE_SPEED,
  BOSS_AWAKEN_RATIO_1, BOSS_AWAKEN_RATIO_2, BOSS_AWAKEN_DMG_MULT,
  BOSS_METEOR_DMG, BOSS_METEOR_RADIUS,
  BOSS_DIVE_DMG, BOSS_DIVE_RADIUS, BOSS_DIVE_HEIGHT, BOSS_DIVE_RISE_TIME, BOSS_DIVE_HANG_TIME, BOSS_DIVE_FALL_TIME,
  BOSS_FIRESWEEP_DMG, BOSS_FIRESWEEP_SPEED, BOSS_FIRESWEEP_COUNT, BOSS_FIRESWEEP_ARC,
  BOSS_METEOR_SKILL_DUR, BOSS_METEOR_SKILL_CD,
  BOSS_TERRAIN_DESTROY_1, BOSS_TERRAIN_DESTROY_2,
  BOSS_STOMP_DMG, BOSS_STOMP_RINGS, BOSS_STOMP_INTERVAL,
  BOSS_BARRAGE_DMG, BOSS_BARRAGE_COUNT, BOSS_BARRAGE_SPEED, BOSS_BARRAGE_DUR,
  BOSS_SLAMCHAIN_DMG, BOSS_SLAMCHAIN_RADIUS, BOSS_SLAMCHAIN_COUNT, BOSS_SLAMCHAIN_INTERVAL,
  BOSS_WHIRL_DMG, BOSS_WHIRL_RADIUS, BOSS_WHIRL_SPEED, BOSS_WHIRL_DUR, BOSS_WHIRL_TICK,
  BOSS_GRAB_DASH_SPEED, BOSS_GRAB_RANGE, BOSS_GRAB_DMG, BOSS_GRAB_STUN,
  BOUNDARY,
} from '../shared/constants'

const BOSS_FB_POOL = 25

// ── 상태 타입 ──────────────────────────────────────────────────────────
type BossState =
  | 'inactive' | 'idle' | 'run'
  | 'attack1' | 'attack2' | 'jump_attack' | 'stone_throw' | 'charge'
  | 'dive_attack' | 'fire_sweep' | 'meteor_rain'
  | 'shockwave_stomp' | 'rock_barrage' | 'ground_slam_chain'
  | 'whirlwind' | 'grab_throw'
  | 'awakening' | 'death'

// ── 보스 파이어볼 풀 엔트리 ───────────────────────────────────────────
interface BossFbEntry {
  mesh:   THREE.Object3D
  mixer:  THREE.AnimationMixer | null
  action: THREE.AnimationAction | null
  light:  THREE.PointLight
  inUse:  boolean
}

// ── 충격파 링 ─────────────────────────────────────────────────────────
interface ShockwaveRing {
  cx: number; cz: number
  radius: number
  speed: number
  maxRadius: number
  hitDealt: boolean
  mesh: THREE.Mesh
}

// ── 지면 강타 폭발점 ─────────────────────────────────────────────────
interface SlamExplosion {
  x: number; z: number
  delay: number
  activated: boolean
  hitDealt: boolean
}

// ── 보스 데이터 ───────────────────────────────────────────────────────
interface BossData {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  idleAction:    THREE.AnimationAction
  deathAction:   THREE.AnimationAction
  attack1Action: THREE.AnimationAction
  attack2Action: THREE.AnimationAction
  jumpAction:    THREE.AnimationAction
  chargeAction:  THREE.AnimationAction

  state: BossState
  hp: number
  maxHp: number
  isDead: boolean
  hitFlash: number

  awakened: boolean
  awakeningTriggered1st: boolean
  awakeningTriggered2nd: boolean
  awakeningRound: number
  invincible: boolean

  stateTimer: number
  hitDealt: boolean
  hitDealt2: boolean

  attackRangeMesh: THREE.Mesh | null

  // 돌진
  chargeDir: THREE.Vector3
  chargeDistLeft: number
  chargeWarningMesh: THREE.Mesh | null

  // 점프
  jumpY: number
  jumpPhase: number
  jumpOriginX: number; jumpOriginZ: number
  jumpTargetX: number; jumpTargetZ: number
  jumpLanded: boolean
  jumpSecondHitDealt: boolean; jumpSecondHitAt: number

  // 각성 시퀀스
  awakePhase: number
  awakeTimer: number
  meteorSpawnCd: number

  // 넉백
  knockbackVel: THREE.Vector3
  hitStopTimer: number
  deathTimer: number

  // ── 신규 패턴 필드 ──────────────────────────────────────────
  // Dive Attack
  divePhase: number
  diveTargetX: number; diveTargetZ: number

  // Fire Sweep
  sweepPhase: number
  sweepShotsFired: number
  sweepBaseAngle: number
  sweepCd: number

  // Meteor Rain (regular)
  meteorSkillTimer: number
  meteorSkillCd: number

  // Shockwave Stomp
  stompRingsFired: number
  stompCd: number

  // Rock Barrage
  barrageAngle: number
  barrageCount: number
  barrageCd: number

  // Ground Slam Chain
  slamChainCount: number
  slamChainCd: number

  // Whirlwind
  whirlTickCd: number

  // Grab/Throw
  grabPhase: number
  grabHeldTimer: number

  // 각성기 (지형파괴)
  awakeSlamCount: number
  awakeSlamCd: number
}

// ── 보스 파이어볼 투사체 ─────────────────────────────────────────────
interface BossFireballProjectile {
  fbObj:    THREE.Object3D
  fbMixer:  THREE.AnimationMixer | null
  fbLight:  THREE.PointLight
  vel:      THREE.Vector3
  age:      number
  hitDealt: boolean
  poolIdx:  number
  baseDmg:  number   // 패턴별 데미지
}

// ── 운석 ──────────────────────────────────────────────────────────────
interface MeteorState {
  wx: number; wz: number
  warningRing: THREE.Mesh
  timer: number
  fallen: boolean
  fbObj:    THREE.Object3D | null
  fbMixer:  THREE.AnimationMixer | null
  fbLight:  THREE.PointLight | null
  sphereY:  number
  impactDealt: boolean
  poolIdx:  number
}

export class BossManager {
  private boss:    BossData | null = null
  private hasSpawned = false
  private _boundary = BOUNDARY

  private baseGroup:    THREE.Group | null = null
  private idleClip:     THREE.AnimationClip | null = null
  private runClip:      THREE.AnimationClip | null = null
  private attackClip:   THREE.AnimationClip | null = null
  private attack2Clip:  THREE.AnimationClip | null = null
  private jumpClip:     THREE.AnimationClip | null = null
  private deathClip:    THREE.AnimationClip | null = null

  private stones:  BossFireballProjectile[] = []
  private meteors: MeteorState[]            = []

  // 충격파 + 지면 강타
  private shockwaves:     ShockwaveRing[]  = []
  private slamExplosions: SlamExplosion[]   = []

  // 보스 파이어볼 풀
  private bossFbBase: THREE.Group | null = null
  private bossFbPool: BossFbEntry[]      = []
  private bossFbFree: number[]           = []

  private meteorRingGeo = new THREE.RingGeometry(BOSS_METEOR_RADIUS - 0.15, BOSS_METEOR_RADIUS, 40)

  // ── 공유 머터리얼/지오메트리 (GPU 업로드 1회) ──────────────────────────
  private sharedRingMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  private sharedWarnMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5 })
  private sharedMeteorMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.7, side: THREE.DoubleSide })

  // 경고 박스 지오메트리 (charge/grab 공유)
  private chargeWarnGeo = new THREE.BoxGeometry(BOSS_MELEE_RANGE * 2, 0.06, 46)
  private grabWarnGeo = new THREE.BoxGeometry(BOSS_MELEE_RANGE * 1.2, 0.06, 12)

  constructor(
    private scene:        THREE.Scene,
    private getCharacter: () => THREE.Group,
    private fx:           EffectSystem,
    private audio:        AudioManager,
    private damagePlayer: (amount: number, knockDir?: THREE.Vector3, attackOrigin?: THREE.Vector3) => void,
    private spawnDmgNum:  (pos: THREE.Vector3, amount: number, isPlayer: boolean) => void,
    private hud:          HUD,
    private stunPlayer:   (dur: number) => void,
    private isMounted:    () => boolean,
    private destroyTerrain: (count: number) => THREE.Vector3[],
  ) {
    this.loadFBXs()
  }

  setBoundary(b: number) { this._boundary = b }

  reset() {
    if (this.boss) {
      this.scene.remove(this.boss.group)
      if (this.boss.attackRangeMesh) this.scene.remove(this.boss.attackRangeMesh)
      if (this.boss.chargeWarningMesh) this.scene.remove(this.boss.chargeWarningMesh)
    }
    for (const s of this.stones) this.releaseBossFb(s.poolIdx)
    this.stones = []
    for (const m of this.meteors) {
      this.scene.remove(m.warningRing)
      if (m.poolIdx >= 0) this.releaseBossFb(m.poolIdx)
    }
    this.meteors = []
    for (const sw of this.shockwaves) this.scene.remove(sw.mesh)
    this.shockwaves = []
    this.slamExplosions = []
    this.boss = null
    this.hasSpawned = false
    this.hud.hideBossHP()
  }

  // ── FBX 로딩 ──────────────────────────────────────────────────────
  private loadFBXs() {
    boss1IdleFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.baseGroup = fbx
      if (fbx.animations.length > 0) this.idleClip = fbx.animations[0]
    }).catch(e => console.error('[Boss] idle:', e))

    boss1RunFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.runClip = fbx.animations[0]
    }).catch(e => console.error('[Boss] run:', e))

    boss1AttackFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.attackClip = fbx.animations[0]
    }).catch(e => console.error('[Boss] attack:', e))

    boss1Attack2FbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.attack2Clip = fbx.animations[0]
    }).catch(e => console.error('[Boss] attack2:', e))

    boss1JumpAttackFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.jumpClip = fbx.animations[0]
    }).catch(e => console.error('[Boss] jump:', e))

    boss1DeathFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.deathClip = fbx.animations[0]
    }).catch(e => console.error('[Boss] death:', e))

    fireballFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.bossFbBase = fbx
      this.initBossFireballPool()
    }).catch(e => console.error('[Boss] fireball:', e))
  }

  // ── 보스 파이어볼 풀 ────────────────────────────────────────────────
  private initBossFireballPool() {
    if (this.bossFbPool.length > 0 || !this.bossFbBase) return
    for (let i = 0; i < BOSS_FB_POOL; i++) {
      const mesh = SkeletonUtils.clone(this.bossFbBase) as THREE.Group
      mesh.scale.setScalar(0.013)
      mesh.visible = false
      mesh.position.set(0, -9999, 0)
      mesh.traverse((c: THREE.Object3D) => {
        if ((c as THREE.Mesh).isMesh) {
          (c as THREE.Mesh).frustumCulled = false
          c.castShadow = true
        }
      })
      this.scene.add(mesh)
      let mixer: THREE.AnimationMixer | null = null
      let action: THREE.AnimationAction | null = null
      if (this.bossFbBase.animations?.length > 0) {
        mixer  = new THREE.AnimationMixer(mesh as THREE.Group)
        action = mixer.clipAction(this.bossFbBase.animations[0])
        action.play()
      }
      const light = new THREE.PointLight(0xff5500, 0, 12)
      light.position.set(0, -9999, 0)
      this.scene.add(light)
      this.bossFbPool.push({ mesh, mixer, action, light, inUse: false })
      this.bossFbFree.push(i)
    }
  }

  private acquireBossFb(x: number, y: number, z: number): {
    mesh: THREE.Object3D; mixer: THREE.AnimationMixer | null; light: THREE.PointLight; poolIdx: number
  } | null {
    if (this.bossFbFree.length === 0) return null
    const idx   = this.bossFbFree.pop()!
    const entry = this.bossFbPool[idx]
    entry.inUse = true
    entry.mesh.position.set(x, y, z)
    entry.mesh.rotation.set(0, 0, 0)
    entry.mesh.visible = true
    entry.light.position.set(x, y, z)
    entry.light.intensity = 8
    if (entry.action) entry.action.reset().play()
    return { mesh: entry.mesh, mixer: entry.mixer, light: entry.light, poolIdx: idx }
  }

  private releaseBossFb(poolIdx: number) {
    const entry = this.bossFbPool[poolIdx]
    if (!entry) return
    entry.inUse         = false
    entry.mesh.visible  = false
    entry.mesh.position.set(0, -9999, 0)
    entry.light.intensity = 0
    entry.light.position.set(0, -9999, 0)
    this.bossFbFree.push(poolIdx)
  }

  // ── 스폰 ────────────────────────────────────────────────────────────
  trySpawnIfReady(e1: EnemyData[], e2: EnemyData[]) {
    if (this.hasSpawned) return
    const all = [...e1, ...e2]
    if (all.length === 0) return
    if (!all.every(e => e.isDead)) return
    this.spawnBoss()
  }

  private spawnBoss() {
    if (!this.baseGroup || !this.idleClip || !this.runClip ||
        !this.attackClip || !this.attack2Clip || !this.jumpClip || !this.deathClip) return
    if (this.hasSpawned) return
    this.hasSpawned = true

    const group = SkeletonUtils.clone(this.baseGroup) as THREE.Group
    group.scale.setScalar(BOSS_SCALE)
    group.position.set(0, 0, 0)
    group.traverse((c: THREE.Object3D) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true; c.receiveShadow = true
        ;(c as THREE.Mesh).frustumCulled = false
      }
    })
    this.scene.add(group)

    const mixer         = new THREE.AnimationMixer(group)
    const idleAction    = mixer.clipAction(this.idleClip!)
    const deathAction   = mixer.clipAction(this.deathClip!)
    const attack1Action = mixer.clipAction(this.attackClip!)
    const attack2Action = mixer.clipAction(this.attack2Clip!)
    const jumpAction    = mixer.clipAction(this.jumpClip!)
    const chargeAction  = mixer.clipAction(this.runClip!)

    attack1Action.loop = THREE.LoopOnce; attack1Action.clampWhenFinished = true
    attack2Action.loop = THREE.LoopOnce; attack2Action.clampWhenFinished = true
    jumpAction.loop    = THREE.LoopOnce; jumpAction.clampWhenFinished = true
    deathAction.loop   = THREE.LoopOnce; deathAction.clampWhenFinished = true
    chargeAction.timeScale = 3.0

    idleAction.play()

    this.boss = {
      group, mixer,
      idleAction, deathAction, attack1Action, attack2Action, jumpAction, chargeAction,
      state: 'idle',
      hp: BOSS_HP, maxHp: BOSS_HP, isDead: false,
      hitFlash: 0,
      awakened: false,
      awakeningTriggered1st: false, awakeningTriggered2nd: false,
      awakeningRound: 0, invincible: false,
      stateTimer: 1.5,
      hitDealt: false, hitDealt2: false,
      attackRangeMesh: null,
      chargeDir: new THREE.Vector3(), chargeDistLeft: 0, chargeWarningMesh: null,
      jumpY: 0, jumpPhase: 0,
      jumpOriginX: 0, jumpOriginZ: 0, jumpTargetX: 0, jumpTargetZ: 0,
      jumpLanded: false, jumpSecondHitDealt: false, jumpSecondHitAt: 0,
      awakePhase: 0, awakeTimer: 0, meteorSpawnCd: 0,
      knockbackVel: new THREE.Vector3(),
      hitStopTimer: 0, deathTimer: 0,
      // 신규
      divePhase: 0, diveTargetX: 0, diveTargetZ: 0,
      sweepPhase: 0, sweepShotsFired: 0, sweepBaseAngle: 0, sweepCd: 0,
      meteorSkillTimer: 0, meteorSkillCd: 0,
      stompRingsFired: 0, stompCd: 0,
      barrageAngle: 0, barrageCount: 0, barrageCd: 0,
      slamChainCount: 0, slamChainCd: 0,
      whirlTickCd: 0,
      grabPhase: 0, grabHeldTimer: 0,
      awakeSlamCount: 0, awakeSlamCd: 0,
    }

    this.hud.showBossHP()
    this.hud.updateBossHP(BOSS_HP, BOSS_HP)
  }

  // ── 공개 프로퍼티 ───────────────────────────────────────────────────
  get isActive(): boolean { return this.boss !== null && !this.boss.isDead }
  get isBossDead(): boolean { return this.boss !== null && this.boss.isDead }
  get bossPosition(): THREE.Vector3 | null { return this.boss ? this.boss.group.position : null }

  // ── 피해 처리 ───────────────────────────────────────────────────────
  takeDamage(amount: number, knockDir?: THREE.Vector3) {
    const b = this.boss
    if (!b || b.isDead || b.state === 'death') return
    if (b.invincible) return

    b.hp = Math.max(0, b.hp - amount)
    this.hud.updateBossHP(b.hp, b.maxHp)
    this.spawnDmgNum(b.group.position, amount, false)
    this.fx.spawnHit(b.group.position)
    b.hitFlash = 0.15
    b.hitStopTimer = 0.1
    this.setMaterial(b.group, 0xff4444)
    this.audio.playSound(enemyHitUrl, 0.6)

    if (knockDir) b.knockbackVel.set(knockDir.x * 6, 0, knockDir.z * 6)

    if (b.hp <= 0) { this.killBoss(); return }

    // 1차 각성: 70% HP
    if (!b.awakeningTriggered1st && b.hp / b.maxHp <= BOSS_AWAKEN_RATIO_1) {
      b.awakeningTriggered1st = true
      b.awakeningRound = 1
      this.setState(b, 'awakening')
      return
    }
    // 2차 각성: 30% HP
    if (b.awakeningTriggered1st && !b.awakeningTriggered2nd && b.hp / b.maxHp <= BOSS_AWAKEN_RATIO_2) {
      b.awakeningTriggered2nd = true
      b.awakeningRound = 2
      this.setState(b, 'awakening')
    }
  }

  private killBoss() {
    const b = this.boss!
    b.isDead = true
    b.state = 'death'
    b.invincible = false
    b.group.position.y = 0
    this.cleanupBattleMeshes(b)
    b.mixer.stopAllAction()
    b.deathAction.reset().play()
    b.deathTimer = 4
    this.fx.spawnDeathExplosion(b.group.position, true)
    this.audio.playSound(enemyDeathUrl, 0.8)
    this.hud.hideBossHP()
  }

  private cleanupBattleMeshes(b: BossData) {
    if (b.attackRangeMesh)   { this.scene.remove(b.attackRangeMesh);   b.attackRangeMesh   = null }
    if (b.chargeWarningMesh) { this.scene.remove(b.chargeWarningMesh); b.chargeWarningMesh = null }
  }

  // ── 범위 표시 헬퍼 ──────────────────────────────────────────────────
  private createRangeRing(innerR: number, outerR: number, color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.RingGeometry(innerR, outerR, 40)
    const mat = this.sharedRingMat.clone()
    mat.color.setHex(color)
    mat.opacity = opacity
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.frustumCulled = false
    return mesh
  }

  // ── 상태 전환 ───────────────────────────────────────────────────────
  private setState(b: BossData, state: BossState) {
    this.cleanupBattleMeshes(b)

    const prevActionMap: Partial<Record<BossState, THREE.AnimationAction>> = {
      idle: b.idleAction, run: b.chargeAction,
      attack1: b.attack1Action, attack2: b.attack2Action,
      jump_attack: b.jumpAction, stone_throw: b.attack1Action,
      charge: b.chargeAction, awakening: b.idleAction,
      dive_attack: b.jumpAction, fire_sweep: b.attack1Action,
      meteor_rain: b.attack1Action,
      shockwave_stomp: b.attack2Action, rock_barrage: b.attack1Action,
      ground_slam_chain: b.attack2Action,
      whirlwind: b.chargeAction, grab_throw: b.chargeAction,
    }
    const prevAction = prevActionMap[b.state] ?? null

    b.state      = state
    b.stateTimer = 0
    b.hitDealt   = false
    b.hitDealt2  = false

    let nextAction: THREE.AnimationAction | null = null

    switch (state) {
      case 'idle':
        nextAction = b.idleAction
        break

      case 'run':
        b.chargeAction.timeScale = 1.0
        nextAction = b.chargeAction
        break

      case 'attack1': {
        nextAction = b.attack1Action
        const ring = this.createRangeRing(BOSS_MELEE_RANGE * 0.55, BOSS_MELEE_RANGE, 0xff6600, 0.45)
        ring.position.set(b.group.position.x, 0.12, b.group.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      case 'attack2': {
        nextAction = b.attack2Action
        const ring = this.createRangeRing(0, BOSS_MELEE_RANGE * 0.88, 0xff8800, 0.38)
        ring.position.set(b.group.position.x, 0.12, b.group.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      case 'jump_attack': {
        nextAction = b.jumpAction
        b.jumpY = 0; b.jumpPhase = 0; b.jumpLanded = false
        b.jumpSecondHitDealt = false; b.jumpSecondHitAt = 0
        const char = this.getCharacter()
        b.jumpOriginX = b.group.position.x; b.jumpOriginZ = b.group.position.z
        b.jumpTargetX = char.position.x;    b.jumpTargetZ = char.position.z
        const ring = this.createRangeRing(BOSS_JUMP_RADIUS * 0.7, BOSS_JUMP_RADIUS + 0.4, 0xff2200, 0.5)
        ring.position.set(b.jumpTargetX, 0.12, b.jumpTargetZ)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      case 'stone_throw': {
        nextAction = b.attack1Action
        const char = this.getCharacter()
        const ring = this.createRangeRing(3.6, 7.8, 0xff2200, 0.5)
        ring.position.set(char.position.x, 0.12, char.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      case 'charge': {
        b.chargeAction.timeScale = 3.0
        nextAction = b.chargeAction
        const char = this.getCharacter()
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        const len = Math.sqrt(dx * dx + dz * dz)
        b.chargeDir.set(len > 0 ? dx / len : 0, 0, len > 0 ? dz / len : 1)
        b.chargeDistLeft = 60
        const WARN_LEN = 46
        const warnMat  = this.sharedWarnMat.clone()
        warnMat.color.setHex(0xff3300)
        warnMat.opacity = 0.5
        const warnMesh = new THREE.Mesh(this.chargeWarnGeo, warnMat)
        warnMesh.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
        warnMesh.position.set(
          b.group.position.x + b.chargeDir.x * WARN_LEN * 0.5,
          0.08,
          b.group.position.z + b.chargeDir.z * WARN_LEN * 0.5,
        )
        warnMesh.frustumCulled = false
        this.scene.add(warnMesh)
        b.chargeWarningMesh = warnMesh
        break
      }

      // ── 다이브 어택 ─────────────────────────────────────────────
      case 'dive_attack': {
        nextAction = b.jumpAction
        b.divePhase = 0
        const char = this.getCharacter()
        b.diveTargetX = char.position.x
        b.diveTargetZ = char.position.z
        // 착지 예고 마커
        const ring = this.createRangeRing(BOSS_DIVE_RADIUS * 0.6, BOSS_DIVE_RADIUS, 0xff2200, 0.55)
        ring.position.set(b.diveTargetX, 0.12, b.diveTargetZ)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      // ── 불꽃 쓸기 ──────────────────────────────────────────────
      case 'fire_sweep': {
        nextAction = b.attack1Action
        b.sweepPhase = 0
        b.sweepShotsFired = 0
        b.sweepCd = 0
        const char = this.getCharacter()
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        b.sweepBaseAngle = Math.atan2(dx, dz)
        break
      }

      // ── 운석 비 (일반 스킬) ──────────────────────────────────────
      case 'meteor_rain': {
        nextAction = b.attack1Action
        b.meteorSkillTimer = 0
        b.meteorSkillCd = 0
        break
      }

      // ── 충격파 밟기 ─────────────────────────────────────────────
      case 'shockwave_stomp': {
        nextAction = b.attack2Action
        b.stompRingsFired = 0
        b.stompCd = 0.8  // 윈드업
        break
      }

      // ── 나선 투석 ──────────────────────────────────────────────
      case 'rock_barrage': {
        nextAction = b.attack1Action
        b.barrageCount = 0
        b.barrageCd = 0
        const char = this.getCharacter()
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        b.barrageAngle = Math.atan2(dx, dz)
        break
      }

      // ── 연속 지면 강타 ─────────────────────────────────────────
      case 'ground_slam_chain': {
        nextAction = b.attack2Action
        b.slamChainCount = 0
        b.slamChainCd = 0.5  // 첫 슬램까지 윈드업
        break
      }

      // ── 회오리 ─────────────────────────────────────────────────
      case 'whirlwind': {
        b.chargeAction.timeScale = 5.0
        nextAction = b.chargeAction
        b.whirlTickCd = 0
        b.invincible = true
        break
      }

      // ── 잡기/던지기 ────────────────────────────────────────────
      case 'grab_throw': {
        b.chargeAction.timeScale = 3.0
        nextAction = b.chargeAction
        b.grabPhase = 0
        b.grabHeldTimer = 0
        // 경고 라인
        const char = this.getCharacter()
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        const len = Math.sqrt(dx * dx + dz * dz)
        b.chargeDir.set(len > 0 ? dx / len : 0, 0, len > 0 ? dz / len : 1)
        const WARN_LEN = 12
        const warnMat  = this.sharedWarnMat.clone()
        warnMat.color.setHex(0xff0066)
        warnMat.opacity = 0.45
        const warnMesh = new THREE.Mesh(this.grabWarnGeo, warnMat)
        warnMesh.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
        warnMesh.position.set(
          b.group.position.x + b.chargeDir.x * WARN_LEN * 0.5,
          0.08,
          b.group.position.z + b.chargeDir.z * WARN_LEN * 0.5,
        )
        warnMesh.frustumCulled = false
        this.scene.add(warnMesh)
        b.chargeWarningMesh = warnMesh
        break
      }

      // ── 각성기 (지형 파괴) ─────────────────────────────────────
      case 'awakening':
        nextAction = b.jumpAction
        b.awakePhase    = 0
        b.awakeTimer    = 0
        b.invincible    = true
        b.awakeSlamCount = 0
        b.awakeSlamCd    = 0
        this.fx.screenShakeTimer = 1.0
        break

      case 'death':
        break
    }

    // 크로스페이드 전환
    if (nextAction) {
      nextAction.reset().play()
      if (prevAction && prevAction !== nextAction && state !== 'death') {
        prevAction.crossFadeTo(nextAction, 0.15, true)
      } else if (!prevAction || state === 'death') {
        b.mixer.stopAllAction()
        nextAction.reset().play()
      }
    } else {
      b.mixer.stopAllAction()
    }
  }

  // ── 공격 선택 (가중치 랜덤) ─────────────────────────────────────────
  private pickAttack(dist: number): BossState {
    interface W { state: BossState; weight: number }
    const c: W[] = []
    const aw = this.boss?.awakened

    if (dist <= BOSS_MELEE_RANGE) {
      c.push(
        { state: 'attack1', weight: 15 }, { state: 'attack2', weight: 12 },
        { state: 'shockwave_stomp', weight: 12 }, { state: 'ground_slam_chain', weight: 10 },
        { state: 'whirlwind', weight: 10 }, { state: 'grab_throw', weight: 8 },
        { state: 'charge', weight: 5 }, { state: 'jump_attack', weight: 5 },
        { state: 'dive_attack', weight: 5 }, { state: 'fire_sweep', weight: 5 },
      )
    } else if (dist <= 12) {
      c.push(
        { state: 'charge', weight: 18 }, { state: 'dive_attack', weight: 15 },
        { state: 'fire_sweep', weight: 15 }, { state: 'stone_throw', weight: 10 },
        { state: 'shockwave_stomp', weight: 10 }, { state: 'rock_barrage', weight: 10 },
        { state: 'ground_slam_chain', weight: 8 }, { state: 'whirlwind', weight: 8 },
        { state: 'jump_attack', weight: 6 },
      )
    } else {
      c.push(
        { state: 'charge', weight: 20 }, { state: 'dive_attack', weight: 18 },
        { state: 'stone_throw', weight: 15 }, { state: 'fire_sweep', weight: 12 },
        { state: 'rock_barrage', weight: 12 }, { state: 'meteor_rain', weight: aw ? 15 : 8 },
        { state: 'jump_attack', weight: 5 },
      )
    }

    const total = c.reduce((s, e) => s + e.weight, 0)
    let r = Math.random() * total
    for (const e of c) { r -= e.weight; if (r <= 0) return e.state }
    return c[c.length - 1].state
  }

  // ── 메인 업데이트 ───────────────────────────────────────────────────
  update(delta: number) {
    if (!this.boss) return
    const b    = this.boss
    const char = this.getCharacter()

    for (const entry of this.bossFbPool) {
      if (entry.inUse && entry.mixer) entry.mixer.update(delta)
    }

    this.updateStones(delta, char)
    this.updateMeteors(delta, char)
    this.updateShockwaves(delta, char)
    this.updateSlamExplosions(delta, char)

    if (b.isDead) {
      if (b.deathTimer > 0) {
        b.deathTimer -= delta
        if (b.deathTimer <= 0) this.scene.remove(b.group)
      }
      b.mixer.update(delta)
      return
    }

    // 넉백
    if (b.knockbackVel.lengthSq() > 0.01) {
      b.group.position.addScaledVector(b.knockbackVel, delta)
      b.knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 6))
    }

    // 바운더리 클램프
    b.group.position.x = Math.max(-this._boundary + 1, Math.min(this._boundary - 1, b.group.position.x))
    b.group.position.z = Math.max(-this._boundary + 1, Math.min(this._boundary - 1, b.group.position.z))

    // hit flash
    if (b.hitFlash > 0) {
      b.hitFlash -= delta
      if (b.hitFlash <= 0) this.setMaterial(b.group, b.awakened ? 0x880000 : null)
    }

    b.stateTimer += delta

    switch (b.state) {
      case 'idle':              this.updateIdle(b, char, delta); break
      case 'run':               this.updateRun(b, char, delta); break
      case 'attack1':           this.updateAttack1(b, char); break
      case 'attack2':           this.updateAttack2(b, char); break
      case 'jump_attack':       this.updateJumpAttack(b, char, delta); break
      case 'stone_throw':       this.updateStoneThrow(b, char); break
      case 'charge':            this.updateCharge(b, char, delta); break
      case 'dive_attack':       this.updateDiveAttack(b, char, delta); break
      case 'fire_sweep':        this.updateFireSweep(b, char, delta); break
      case 'meteor_rain':       this.updateMeteorRain(b, char, delta); break
      case 'shockwave_stomp':   this.updateShockwaveStomp(b, delta); break
      case 'rock_barrage':      this.updateRockBarrage(b, char, delta); break
      case 'ground_slam_chain': this.updateGroundSlamChain(b, char, delta); break
      case 'whirlwind':         this.updateWhirlwind(b, char, delta); break
      case 'grab_throw':        this.updateGrabThrow(b, char, delta); break
      case 'awakening':         this.updateAwakening(b, delta); break
    }

    // 히트스톱
    if (b.hitStopTimer > 0) {
      b.hitStopTimer = Math.max(0, b.hitStopTimer - delta)
      b.mixer.update(0)
    } else {
      b.mixer.update(delta)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 기존 패턴 업데이트
  // ══════════════════════════════════════════════════════════════════════

  private updateIdle(b: BossData, char: THREE.Group, _delta: number) {
    if (b.stateTimer < 1.0) return
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    this.setState(b, dist > BOSS_MELEE_RANGE + 1 ? 'run' : this.pickAttack(dist))
  }

  private updateRun(b: BossData, char: THREE.Group, delta: number) {
    const dx   = char.position.x - b.group.position.x
    const dz   = char.position.z - b.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist <= BOSS_MELEE_RANGE) { this.setState(b, this.pickAttack(dist)); return }
    const speed = b.awakened ? BOSS_AWAKENED_SPEED : BOSS_SPEED
    if (dist > 0.1) {
      b.group.position.x += (dx / dist) * speed * delta
      b.group.position.z += (dz / dist) * speed * delta
      b.group.rotation.y  = Math.atan2(dx, dz)
    }
    if (b.stateTimer > 8.0) this.setState(b, 'idle')
  }

  private updateAttack1(b: BossData, char: THREE.Group) {
    const clipDur = (this.attackClip?.duration ?? 1.5) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)
    if (b.attackRangeMesh) {
      b.attackRangeMesh.position.x = b.group.position.x
      b.attackRangeMesh.position.z = b.group.position.z
      ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.2 * Math.abs(Math.sin(b.stateTimer * 8))
    }
    const dist = Math.sqrt(dx * dx + dz * dz)
    const dmg = b.awakened ? Math.round(BOSS_ATTACK1_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_ATTACK1_DMG
    if (!b.hitDealt && b.stateTimer >= 1.0) {
      b.hitDealt = true
      if (dist <= BOSS_MELEE_RANGE) {
        const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
        this.damagePlayer(dmg, kd, b.group.position.clone())
        this.fx.spawnRing(char.position.x, char.position.z, 0xff2200, 3.5, 0.3)
        this.fx.spawnHitOnPos(char.position.x, char.position.z)
      }
    }
    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  private updateAttack2(b: BossData, char: THREE.Group) {
    const clipDur = (this.attack2Clip?.duration ?? 1.2) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)
    if (b.attackRangeMesh) {
      b.attackRangeMesh.position.x = b.group.position.x
      b.attackRangeMesh.position.z = b.group.position.z
      ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.18 * Math.abs(Math.sin(b.stateTimer * 10))
    }
    const dist = Math.sqrt(dx * dx + dz * dz)
    const dmg = b.awakened ? Math.round(BOSS_ATTACK2_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_ATTACK2_DMG
    if (!b.hitDealt && b.stateTimer >= 1.0) {
      b.hitDealt = true
      if (dist <= BOSS_MELEE_RANGE * 0.88) {
        const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
        this.damagePlayer(dmg, kd, b.group.position.clone())
        this.fx.spawnHitOnPos(char.position.x, char.position.z)
      }
    }
    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  private updateJumpAttack(b: BossData, char: THREE.Group, delta: number) {
    const RISE_TIME = 0.5, FALL_TIME = 0.3
    if (b.jumpLanded) {
      if (b.attackRangeMesh) {
        ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.2 * Math.abs(Math.sin(b.stateTimer * 6))
      }
      if (!b.jumpSecondHitDealt && b.stateTimer >= b.jumpSecondHitAt) {
        b.jumpSecondHitDealt = true
        if (b.attackRangeMesh) { this.scene.remove(b.attackRangeMesh); b.attackRangeMesh = null }
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff6600, 8.0, 0.5)
        this.fx.spawnHitOnPos(b.group.position.x, b.group.position.z)
        this.audio.playSound(bangUrl, 0.7)
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        const d2 = Math.sqrt(dx * dx + dz * dz)
        if (d2 <= BOSS_JUMP_RADIUS * 1.4) {
          const dmg = b.awakened ? Math.round(BOSS_JUMP_DMG * 0.65 * BOSS_AWAKEN_DMG_MULT) : Math.round(BOSS_JUMP_DMG * 0.65)
          const kd = d2 > 0.01 ? new THREE.Vector3(dx / d2, 0, dz / d2) : new THREE.Vector3(0, 0, 1)
          this.damagePlayer(dmg, kd, b.group.position.clone())
        }
      }
      if (b.stateTimer >= (this.jumpClip?.duration ?? 1.2)) this.setState(b, 'idle')
      return
    }

    if (b.jumpPhase === 0) {
      const t = Math.min(1, b.stateTimer / RISE_TIME)
      b.jumpY = t * 4.5
      const speed = b.awakened ? BOSS_AWAKENED_SPEED : BOSS_SPEED
      const tx = b.jumpTargetX - b.group.position.x
      const tz = b.jumpTargetZ - b.group.position.z
      const tl = Math.sqrt(tx * tx + tz * tz)
      if (tl > 0.2) {
        b.group.position.x += (tx / tl) * speed * 2 * delta
        b.group.position.z += (tz / tl) * speed * 2 * delta
        b.group.rotation.y = Math.atan2(tx, tz)
      }
      b.group.position.y = b.jumpY
      if (b.stateTimer >= RISE_TIME) b.jumpPhase = 1
    } else {
      const elapsed = b.stateTimer - RISE_TIME
      const t = Math.min(1, elapsed / FALL_TIME)
      b.jumpY = 4.5 * (1 - t)
      const tx = b.jumpTargetX - b.group.position.x
      const tz = b.jumpTargetZ - b.group.position.z
      const tl = Math.sqrt(tx * tx + tz * tz)
      if (tl > 0.1) {
        b.group.position.x += (tx / tl) * Math.min(tl, 20 * delta)
        b.group.position.z += (tz / tl) * Math.min(tl, 20 * delta)
      }
      b.group.position.y = b.jumpY

      if (t >= 1) {
        b.group.position.y = 0
        b.jumpLanded = true
        b.jumpSecondHitAt = b.stateTimer + 1.0
        this.fx.screenShakeTimer = 0.5
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff4400, 6.5, 0.5)
        this.fx.spawnHitOnPos(b.group.position.x, b.group.position.z)
        this.audio.playSound(bangUrl, 0.9)
        const dx   = char.position.x - b.group.position.x
        const dz   = char.position.z - b.group.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= BOSS_JUMP_RADIUS) {
          const dmg = b.awakened ? Math.round(BOSS_JUMP_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_JUMP_DMG
          const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
          this.damagePlayer(dmg, kd, b.group.position.clone())
          this.stunPlayer(1.0)
        }
      }
    }
  }

  private updateStoneThrow(b: BossData, char: THREE.Group) {
    const clipDur = (this.attackClip?.duration ?? 1.2) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)
    if (b.attackRangeMesh && !b.hitDealt) {
      b.attackRangeMesh.position.x = char.position.x
      b.attackRangeMesh.position.z = char.position.z
      ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.abs(Math.sin(b.stateTimer * 12))
    }
    if (!b.hitDealt && b.stateTimer >= 1.0) {
      b.hitDealt = true
      this.fireStone(b, char)
      if (b.attackRangeMesh) { this.scene.remove(b.attackRangeMesh); b.attackRangeMesh = null }
    }
    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  private fireStone(b: BossData, char: THREE.Group) {
    const ox = b.group.position.x + Math.sin(b.group.rotation.y) * 1.5
    const oz = b.group.position.z + Math.cos(b.group.rotation.y) * 1.5
    const tdx = char.position.x - ox, tdz = char.position.z - oz
    const tl = Math.sqrt(tdx * tdx + tdz * tdz)
    const baseAngle = tl > 0 ? Math.atan2(tdx, tdz) : b.group.rotation.y
    const SPREAD = [-0.698, -0.349, 0, 0.349, 0.698]
    for (const offset of SPREAD) {
      const angle = baseAngle + offset
      const acquired = this.acquireBossFb(ox, 2.0, oz)
      if (!acquired) continue
      this.stones.push({
        fbObj: acquired.mesh, fbMixer: acquired.mixer, fbLight: acquired.light, poolIdx: acquired.poolIdx,
        vel: new THREE.Vector3(Math.sin(angle) * BOSS_STONE_SPEED, 0, Math.cos(angle) * BOSS_STONE_SPEED),
        age: 0, hitDealt: false, baseDmg: BOSS_STONE_DMG,
      })
    }
  }

  private updateCharge(b: BossData, _char: THREE.Group, delta: number) {
    const WINDUP = 1.0
    const CHARGE_DUR = 1.2 + WINDUP
    if (b.stateTimer < WINDUP) {
      if (b.chargeWarningMesh) {
        ;(b.chargeWarningMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin((WINDUP - b.stateTimer) * 30)
      }
      b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
      return
    }
    if (b.chargeWarningMesh) { this.scene.remove(b.chargeWarningMesh); b.chargeWarningMesh = null }

    b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
    const speed = b.awakened ? BOSS_CHARGE_SPEED * 1.15 : BOSS_CHARGE_SPEED
    const move  = speed * delta
    b.group.position.x += b.chargeDir.x * move
    b.group.position.z += b.chargeDir.z * move
    b.chargeDistLeft -= move
    b.group.position.x = Math.max(-this._boundary + 1, Math.min(this._boundary - 1, b.group.position.x))
    b.group.position.z = Math.max(-this._boundary + 1, Math.min(this._boundary - 1, b.group.position.z))

    const char = this.getCharacter()
    const pdx = char.position.x - b.group.position.x
    const pdz = char.position.z - b.group.position.z
    if (!b.hitDealt && Math.sqrt(pdx * pdx + pdz * pdz) <= BOSS_MELEE_RANGE) {
      b.hitDealt = true
      const dmg = b.awakened ? Math.round(BOSS_CHARGE_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_CHARGE_DMG
      this.damagePlayer(dmg, b.chargeDir.clone(), b.group.position.clone())
      this.fx.spawnHitOnPos(char.position.x, char.position.z)
      this.fx.screenShakeTimer = 0.3
    }
    if (b.stateTimer >= CHARGE_DUR || b.chargeDistLeft <= 0) this.setState(b, 'idle')
  }

  // ══════════════════════════════════════════════════════════════════════
  // 신규 패턴 업데이트
  // ══════════════════════════════════════════════════════════════════════

  // ── 1. 다이브 어택 ──────────────────────────────────────────────────
  private updateDiveAttack(b: BossData, char: THREE.Group, delta: number) {
    if (b.divePhase === 0) {
      // 상승
      const t = Math.min(1, b.stateTimer / BOSS_DIVE_RISE_TIME)
      b.group.position.y = BOSS_DIVE_HEIGHT * t
      // 마커 펄스
      if (b.attackRangeMesh) {
        ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.25 * Math.abs(Math.sin(b.stateTimer * 6))
      }
      if (b.stateTimer >= BOSS_DIVE_RISE_TIME) {
        b.divePhase = 1
        b.stateTimer = 0
      }
      return
    }

    if (b.divePhase === 1) {
      // 공중 체공 — 마커 강렬 펄스, 약간 타겟 추적
      b.group.position.y = BOSS_DIVE_HEIGHT + Math.sin(b.stateTimer * 3) * 0.3
      // 30% 플레이어 추적
      b.diveTargetX += (char.position.x - b.diveTargetX) * 0.3 * delta
      b.diveTargetZ += (char.position.z - b.diveTargetZ) * 0.3 * delta
      if (b.attackRangeMesh) {
        b.attackRangeMesh.position.x = b.diveTargetX
        b.attackRangeMesh.position.z = b.diveTargetZ
        ;(b.attackRangeMesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.abs(Math.sin(b.stateTimer * 12))
      }
      if (b.stateTimer >= BOSS_DIVE_HANG_TIME) {
        b.divePhase = 2
        b.stateTimer = 0
      }
      return
    }

    // 급강하
    const t = Math.min(1, b.stateTimer / BOSS_DIVE_FALL_TIME)
    b.group.position.y = BOSS_DIVE_HEIGHT * (1 - t)
    // 타겟 쪽으로 이동
    b.group.position.x += (b.diveTargetX - b.group.position.x) * Math.min(1, delta * 30)
    b.group.position.z += (b.diveTargetZ - b.group.position.z) * Math.min(1, delta * 30)

    if (t >= 1) {
      b.group.position.y = 0
      b.group.position.x = b.diveTargetX
      b.group.position.z = b.diveTargetZ

      // 충격
      this.fx.screenShakeTimer = 0.6
      this.fx.spawnRing(b.diveTargetX, b.diveTargetZ, 0xff2200, 8.0, 0.5)
      this.fx.spawnRing(b.diveTargetX, b.diveTargetZ, 0xff6600, 5.0, 0.4)
      this.fx.spawnHitOnPos(b.diveTargetX, b.diveTargetZ)
      this.audio.playSound(bangUrl, 1.0)

      const dx   = char.position.x - b.diveTargetX
      const dz   = char.position.z - b.diveTargetZ
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= BOSS_DIVE_RADIUS) {
        const dmg = b.awakened ? Math.round(BOSS_DIVE_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_DIVE_DMG
        const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
        this.damagePlayer(dmg, kd, new THREE.Vector3(b.diveTargetX, 0, b.diveTargetZ))
        this.stunPlayer(0.8)
      }

      if (b.attackRangeMesh) { this.scene.remove(b.attackRangeMesh); b.attackRangeMesh = null }
      // 착지 후 0.5초 경직
      b.divePhase = 3
      b.stateTimer = 0
      return
    }

    if (b.divePhase === 3 && b.stateTimer >= 0.5) {
      this.setState(b, 'idle')
    }
  }

  // ── 2. 불꽃 쓸기 ───────────────────────────────────────────────────
  private updateFireSweep(b: BossData, char: THREE.Group, delta: number) {
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    const INTERVAL = 0.14
    const TOTAL_PER_SWEEP = BOSS_FIRESWEEP_COUNT

    if (b.sweepPhase === 0) {
      // 오른쪽 쓸기
      b.sweepCd -= delta
      if (b.sweepCd <= 0 && b.sweepShotsFired < TOTAL_PER_SWEEP) {
        const frac = b.sweepShotsFired / (TOTAL_PER_SWEEP - 1)
        const angle = b.sweepBaseAngle - BOSS_FIRESWEEP_ARC / 2 + frac * BOSS_FIRESWEEP_ARC
        this.fireProjectile(b, angle)
        b.sweepShotsFired++
        b.sweepCd = INTERVAL
      }
      if (b.sweepShotsFired >= TOTAL_PER_SWEEP) {
        b.sweepPhase = 1
        b.stateTimer = 0
        b.sweepShotsFired = 0
        b.sweepBaseAngle = Math.atan2(dx, dz)
      }
    } else if (b.sweepPhase === 1) {
      // 중간 멈춤
      if (b.stateTimer >= 0.3) {
        b.sweepPhase = 2
        b.stateTimer = 0
        b.sweepCd = 0
      }
    } else {
      // 왼쪽 쓸기 (역방향)
      b.sweepCd -= delta
      if (b.sweepCd <= 0 && b.sweepShotsFired < TOTAL_PER_SWEEP) {
        const frac = b.sweepShotsFired / (TOTAL_PER_SWEEP - 1)
        const angle = b.sweepBaseAngle + BOSS_FIRESWEEP_ARC / 2 - frac * BOSS_FIRESWEEP_ARC
        this.fireProjectile(b, angle)
        b.sweepShotsFired++
        b.sweepCd = INTERVAL
      }
      if (b.sweepShotsFired >= TOTAL_PER_SWEEP) {
        this.setState(b, 'idle')
      }
    }
  }

  private fireProjectile(b: BossData, angle: number) {
    const ox = b.group.position.x + Math.sin(b.group.rotation.y) * 1.5
    const oz = b.group.position.z + Math.cos(b.group.rotation.y) * 1.5
    const acquired = this.acquireBossFb(ox, 2.0, oz)
    if (!acquired) return
    this.stones.push({
      fbObj: acquired.mesh, fbMixer: acquired.mixer, fbLight: acquired.light, poolIdx: acquired.poolIdx,
      vel: new THREE.Vector3(Math.sin(angle) * BOSS_FIRESWEEP_SPEED, 0, Math.cos(angle) * BOSS_FIRESWEEP_SPEED),
      age: 0, hitDealt: false, baseDmg: BOSS_FIRESWEEP_DMG,
    })
  }

  // ── 3. 운석 비 (일반 스킬) ──────────────────────────────────────────
  private updateMeteorRain(b: BossData, char: THREE.Group, delta: number) {
    b.meteorSkillTimer += delta
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    b.meteorSkillCd -= delta
    if (b.meteorSkillCd <= 0) {
      const angle = Math.random() * Math.PI * 2
      const dist  = 3 + Math.random() * 7
      const wx = Math.max(-this._boundary + 2, Math.min(this._boundary - 2, char.position.x + Math.cos(angle) * dist))
      const wz = Math.max(-this._boundary + 2, Math.min(this._boundary - 2, char.position.z + Math.sin(angle) * dist))
      this.spawnSingleMeteor(wx, wz)
      b.meteorSkillCd = BOSS_METEOR_SKILL_CD
    }

    if (b.meteorSkillTimer >= BOSS_METEOR_SKILL_DUR) this.setState(b, 'idle')
  }

  // ── 4. 충격파 밟기 ──────────────────────────────────────────────────
  private updateShockwaveStomp(b: BossData, delta: number) {
    b.stompCd -= delta

    if (b.stompCd <= 0 && b.stompRingsFired < BOSS_STOMP_RINGS) {
      b.stompRingsFired++
      b.stompCd = BOSS_STOMP_INTERVAL

      this.fx.screenShakeTimer = 0.15
      this.audio.playSound(bangUrl, 0.6)

      // 충격파 링 스폰
      const ring = this.createRangeRing(0, 1.0, 0xff4400, 0.7)
      ring.position.set(b.group.position.x, 0.12, b.group.position.z)
      this.scene.add(ring)
      this.shockwaves.push({
        cx: b.group.position.x, cz: b.group.position.z,
        radius: 1.0, speed: 20, maxRadius: 25,
        hitDealt: false, mesh: ring,
      })
    }

    if (b.stompRingsFired >= BOSS_STOMP_RINGS && b.stompCd <= -0.5) {
      this.setState(b, 'idle')
    }
  }

  // ── 5. 나선 투석 ───────────────────────────────────────────────────
  private updateRockBarrage(b: BossData, char: THREE.Group, delta: number) {
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    b.barrageCd -= delta
    if (b.barrageCd <= 0 && b.barrageCount < BOSS_BARRAGE_COUNT) {
      const angle = b.barrageAngle + (b.barrageCount / BOSS_BARRAGE_COUNT) * Math.PI * 3
      const ox = b.group.position.x + Math.sin(b.group.rotation.y) * 1.5
      const oz = b.group.position.z + Math.cos(b.group.rotation.y) * 1.5
      const acquired = this.acquireBossFb(ox, 2.0, oz)
      if (acquired) {
        this.stones.push({
          fbObj: acquired.mesh, fbMixer: acquired.mixer, fbLight: acquired.light, poolIdx: acquired.poolIdx,
          vel: new THREE.Vector3(Math.sin(angle) * BOSS_BARRAGE_SPEED, 0, Math.cos(angle) * BOSS_BARRAGE_SPEED),
          age: 0, hitDealt: false, baseDmg: BOSS_BARRAGE_DMG,
        })
      }
      b.barrageCount++
      b.barrageCd = BOSS_BARRAGE_DUR / BOSS_BARRAGE_COUNT
    }

    if (b.barrageCount >= BOSS_BARRAGE_COUNT && b.barrageCd <= -0.3) {
      this.setState(b, 'idle')
    }
  }

  // ── 6. 연속 지면 강타 ──────────────────────────────────────────────
  private updateGroundSlamChain(b: BossData, char: THREE.Group, delta: number) {
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    b.slamChainCd -= delta
    if (b.slamChainCd <= 0 && b.slamChainCount < BOSS_SLAMCHAIN_COUNT) {
      b.slamChainCount++
      b.slamChainCd = BOSS_SLAMCHAIN_INTERVAL

      this.fx.screenShakeTimer = 0.2
      this.audio.playSound(bangUrl, 0.6)

      // 플레이어 방향으로 폭발 라인 (4개 폭발점)
      const dist = Math.sqrt(dx * dx + dz * dz)
      const ndx = dist > 0.01 ? dx / dist : 0
      const ndz = dist > 0.01 ? dz / dist : 1
      for (let j = 0; j < 4; j++) {
        const d = 3 + j * 3
        this.slamExplosions.push({
          x: b.group.position.x + ndx * d,
          z: b.group.position.z + ndz * d,
          delay: j * 0.08,
          activated: false, hitDealt: false,
        })
      }
    }

    if (b.slamChainCount >= BOSS_SLAMCHAIN_COUNT && b.slamChainCd <= -0.5) {
      this.setState(b, 'idle')
    }
  }

  // ── 7. 회오리 ──────────────────────────────────────────────────────
  private updateWhirlwind(b: BossData, char: THREE.Group, delta: number) {
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (b.stateTimer < BOSS_WHIRL_DUR) {
      // 추적 이동
      if (dist > 0.5) {
        b.group.position.x += (dx / dist) * BOSS_WHIRL_SPEED * delta
        b.group.position.z += (dz / dist) * BOSS_WHIRL_SPEED * delta
        b.group.rotation.y = Math.atan2(dx, dz)
      }

      // 데미지 틱
      b.whirlTickCd -= delta
      if (b.whirlTickCd <= 0) {
        b.whirlTickCd = BOSS_WHIRL_TICK
        if (dist <= BOSS_WHIRL_RADIUS) {
          const dmg = b.awakened ? Math.round(BOSS_WHIRL_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_WHIRL_DMG
          const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
          this.damagePlayer(dmg, kd, b.group.position.clone())
        }
        // 이펙트
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff6600, 3.5, 0.3)
      }
    } else {
      // 경직 (1초)
      b.invincible = false
      b.chargeAction.timeScale = 1.0
      if (b.stateTimer >= BOSS_WHIRL_DUR + 1.0) {
        this.setState(b, 'idle')
      }
    }
  }

  // ── 8. 잡기/던지기 ─────────────────────────────────────────────────
  private updateGrabThrow(b: BossData, char: THREE.Group, delta: number) {
    const WINDUP = 0.5

    if (b.grabPhase === 0) {
      // 경고 후 돌진
      if (b.stateTimer < WINDUP) {
        if (b.chargeWarningMesh) {
          ;(b.chargeWarningMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.3 * Math.sin(b.stateTimer * 20)
        }
        b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
        return
      }
      if (b.chargeWarningMesh) { this.scene.remove(b.chargeWarningMesh); b.chargeWarningMesh = null }

      // 돌진
      b.group.position.x += b.chargeDir.x * BOSS_GRAB_DASH_SPEED * delta
      b.group.position.z += b.chargeDir.z * BOSS_GRAB_DASH_SPEED * delta
      b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)

      const pdx = char.position.x - b.group.position.x
      const pdz = char.position.z - b.group.position.z
      const pdist = Math.sqrt(pdx * pdx + pdz * pdz)

      if (pdist <= BOSS_GRAB_RANGE) {
        b.grabPhase = 1
        b.stateTimer = 0
        this.stunPlayer(BOSS_GRAB_STUN)
        return
      }

      if (b.stateTimer >= WINDUP + 1.0) {
        this.setState(b, 'idle')  // 실패
      }
      return
    }

    if (b.grabPhase === 1) {
      // 잡기 — 플레이어를 보스 쪽으로 끌어당기기
      b.grabHeldTimer += delta
      char.position.x += (b.group.position.x - char.position.x) * Math.min(1, delta * 8)
      char.position.z += (b.group.position.z - char.position.z) * Math.min(1, delta * 8)

      if (b.grabHeldTimer >= 0.8) {
        b.grabPhase = 2
        b.stateTimer = 0
      }
      return
    }

    // 던지기
    if (!b.hitDealt) {
      b.hitDealt = true
      const throwDir = new THREE.Vector3(
        Math.sin(b.group.rotation.y), 0, Math.cos(b.group.rotation.y),
      )
      this.damagePlayer(
        b.awakened ? Math.round(BOSS_GRAB_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_GRAB_DMG,
        throwDir.clone().multiplyScalar(15 / 6),  // force 15 normalized
        b.group.position.clone(),
      )
      this.fx.screenShakeTimer = 0.3
      this.fx.spawnHitOnPos(char.position.x, char.position.z)
      this.audio.playSound(bangUrl, 0.8)
    }

    if (b.stateTimer >= 0.5) this.setState(b, 'idle')
  }

  // ══════════════════════════════════════════════════════════════════════
  // 각성기 (지형 파괴)
  // ══════════════════════════════════════════════════════════════════════

  private updateAwakening(b: BossData, delta: number) {
    b.awakeTimer += delta

    if (b.awakePhase === 0) {
      // 포효 — 1.5초 플래시 + 화면 흔들림
      const flash = Math.sin(b.awakeTimer * 20) > 0 ? 0xff4400 : 0x441100
      this.setMaterial(b.group, flash)
      this.fx.screenShakeTimer = 0.1

      if (b.awakeTimer >= 1.5) {
        b.awakePhase = 1
        b.awakeTimer = 0
        b.awakeSlamCount = 0
        b.awakeSlamCd = 0.3
        this.setMaterial(b.group, null)
      }
      return
    }

    if (b.awakePhase === 1) {
      // 지면 연타 — 지형 파괴
      const maxSlams = b.awakeningRound === 2 ? 4 : 3
      const destroyPerSlam = b.awakeningRound === 2
        ? Math.ceil(BOSS_TERRAIN_DESTROY_2 / maxSlams)
        : Math.ceil(BOSS_TERRAIN_DESTROY_1 / maxSlams)

      b.awakeSlamCd -= delta
      if (b.awakeSlamCd <= 0 && b.awakeSlamCount < maxSlams) {
        b.awakeSlamCount++
        b.awakeSlamCd = 0.5

        // 지형 파괴
        const positions = this.destroyTerrain(destroyPerSlam)
        for (const pos of positions) {
          this.fx.spawnDeathExplosion(pos, false)
          this.fx.spawnRing(pos.x, pos.z, 0xff4400, 6.0, 0.5)
        }

        this.fx.screenShakeTimer = 0.4
        this.audio.playSound(bangUrl, 0.9)

        // 보스 주변 충격파
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff2200, 10.0, 0.5)
        this.fx.spawnHitOnPos(b.group.position.x, b.group.position.z)
      }

      if (b.awakeSlamCount >= maxSlams && b.awakeSlamCd <= -0.3) {
        b.awakePhase = 2
        b.awakeTimer = 0
      }
      return
    }

    if (b.awakePhase === 2) {
      // 회복 — 1초
      if (b.awakeTimer >= 1.0) {
        b.invincible = false
        if (b.awakeningRound === 2) {
          b.awakened = true
          this.setMaterial(b.group, 0x880000)
        }
        this.fx.screenShakeTimer = 0.6
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff6600, 10.0, 0.6)
        this.audio.playSound(bangUrl, 0.9)
        this.setState(b, 'idle')
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 투사체 / 충격파 / 폭발 업데이트
  // ══════════════════════════════════════════════════════════════════════

  private spawnSingleMeteor(wx: number, wz: number) {
    const mat  = this.sharedMeteorMat.clone()
    const ring = new THREE.Mesh(this.meteorRingGeo, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(wx, 0.08, wz)
    ring.frustumCulled = false
    this.scene.add(ring)
    this.meteors.push({
      wx, wz, warningRing: ring,
      timer: 1.5, fallen: false,
      fbObj: null, fbMixer: null, fbLight: null,
      sphereY: 0, impactDealt: false, poolIdx: -1,
    })
  }

  private updateMeteors(delta: number, char: THREE.Group) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      if (!m.fallen) {
        m.timer -= delta
        m.warningRing.scale.setScalar(0.85 + 0.15 * Math.sin(m.timer * 20))
        if (m.timer <= 0) {
          m.fallen = true
          const acquired = this.acquireBossFb(m.wx, 22, m.wz)
          if (acquired) {
            m.fbObj = acquired.mesh; m.fbMixer = acquired.mixer
            m.fbLight = acquired.light; m.poolIdx = acquired.poolIdx
            m.sphereY = 22
          } else {
            this.scene.remove(m.warningRing)
            if (!m.impactDealt) {
              m.impactDealt = true
              const dx = char.position.x - m.wx, dz = char.position.z - m.wz
              const md = Math.sqrt(dx * dx + dz * dz)
              if (md <= BOSS_METEOR_RADIUS) {
                const kd = md > 0.01 ? new THREE.Vector3(dx / md, 0, dz / md) : new THREE.Vector3(0, 0, 1)
                this.damagePlayer(BOSS_METEOR_DMG, kd, new THREE.Vector3(m.wx, 0, m.wz))
              }
            }
            this.meteors.splice(i, 1)
          }
        }
      } else if (m.fbObj) {
        m.sphereY -= 84 * delta
        m.fbObj.position.y = m.sphereY
        if (m.fbLight) m.fbLight.position.y = m.sphereY
        m.fbObj.rotation.y += delta * 5
        if (m.fbMixer) m.fbMixer.update(delta)

        if (m.sphereY <= 0) {
          this.scene.remove(m.warningRing)
          this.releaseBossFb(m.poolIdx)
          this.fx.spawnHitOnPos(m.wx, m.wz)
          this.fx.spawnRing(m.wx, m.wz, 0xff4400, 5.0, 0.5)
          this.fx.screenShakeTimer = 0.35
          this.audio.playSound(bangUrl, 0.7)
          if (!m.impactDealt) {
            m.impactDealt = true
            const dx = char.position.x - m.wx, dz = char.position.z - m.wz
            const md = Math.sqrt(dx * dx + dz * dz)
            if (md <= BOSS_METEOR_RADIUS) {
              const kd = md > 0.01 ? new THREE.Vector3(dx / md, 0, dz / md) : new THREE.Vector3(0, 0, 1)
              this.damagePlayer(BOSS_METEOR_DMG, kd, new THREE.Vector3(m.wx, 0, m.wz))
            }
          }
          this.meteors.splice(i, 1)
        }
      }
    }
  }

  private updateStones(delta: number, char: THREE.Group) {
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i]
      s.age += delta
      s.fbObj.position.addScaledVector(s.vel, delta)
      s.fbLight.position.copy(s.fbObj.position)
      s.fbObj.rotation.y += delta * 4
      s.fbObj.rotation.z += delta * 2
      if (!s.hitDealt) {
        const dx = char.position.x - s.fbObj.position.x
        const dz = char.position.z - s.fbObj.position.z
        if (dx * dx + dz * dz <= BOSS_STONE_RADIUS * BOSS_STONE_RADIUS) {
          s.hitDealt = true
          const dmg = this.boss?.awakened ? Math.round(s.baseDmg * BOSS_AWAKEN_DMG_MULT) : s.baseDmg
          const kd = s.vel.clone().setY(0).normalize()
          this.damagePlayer(dmg, kd, s.fbObj.position.clone())
          this.fx.spawnHitOnPos(s.fbObj.position.x, s.fbObj.position.z)
        }
      }
      if (s.age >= 4.0 || s.hitDealt) {
        this.releaseBossFb(s.poolIdx)
        this.stones.splice(i, 1)
      }
    }
  }

  private updateShockwaves(delta: number, char: THREE.Group) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i]
      sw.radius += sw.speed * delta

      // 메시 스케일 업데이트
      const scale = sw.radius
      sw.mesh.scale.setScalar(scale)
      ;(sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - sw.radius / sw.maxRadius)

      // 플레이어 히트 체크: 플레이어가 링 위에 있으면 피격
      if (!sw.hitDealt) {
        const dx = char.position.x - sw.cx
        const dz = char.position.z - sw.cz
        const playerDist = Math.sqrt(dx * dx + dz * dz)
        if (Math.abs(playerDist - sw.radius) < 1.5) {
          sw.hitDealt = true
          const dmg = this.boss?.awakened ? Math.round(BOSS_STOMP_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_STOMP_DMG
          const kd = playerDist > 0.01 ? new THREE.Vector3(dx / playerDist, 0, dz / playerDist) : new THREE.Vector3(0, 0, 1)
          this.damagePlayer(dmg, kd, new THREE.Vector3(sw.cx, 0, sw.cz))
        }
      }

      if (sw.radius >= sw.maxRadius) {
        this.scene.remove(sw.mesh)
        this.shockwaves.splice(i, 1)
      }
    }
  }

  private updateSlamExplosions(delta: number, char: THREE.Group) {
    for (let i = this.slamExplosions.length - 1; i >= 0; i--) {
      const se = this.slamExplosions[i]
      if (!se.activated) {
        se.delay -= delta
        if (se.delay <= 0) {
          se.activated = true
          this.fx.spawnHitOnPos(se.x, se.z)
          this.fx.spawnRing(se.x, se.z, 0xff4400, 4.0, 0.3)

          if (!se.hitDealt) {
            se.hitDealt = true
            const dx = char.position.x - se.x
            const dz = char.position.z - se.z
            const dist = Math.sqrt(dx * dx + dz * dz)
            if (dist <= BOSS_SLAMCHAIN_RADIUS) {
              const dmg = this.boss?.awakened ? Math.round(BOSS_SLAMCHAIN_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_SLAMCHAIN_DMG
              const kd = dist > 0.01 ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1)
              this.damagePlayer(dmg, kd, new THREE.Vector3(se.x, 0, se.z))
            }
          }
        }
      }
      if (se.activated) {
        this.slamExplosions.splice(i, 1)
      }
    }
  }

  private setMaterial(group: THREE.Group, color: number | null) {
    group.traverse((c: THREE.Object3D) => {
      const m = c as THREE.Mesh
      if (m.isMesh && m.material) {
        const mat = m.material as THREE.MeshPhongMaterial
        if (mat.emissive) mat.emissive.setHex(color ?? 0x000000)
      }
    })
  }
}
