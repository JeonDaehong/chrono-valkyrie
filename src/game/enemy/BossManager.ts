import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import enemyHitUrl   from '@assets/sound/enemy_hit.mp3?url'
import enemyDeathUrl from '@assets/sound/enemy_death.mp3?url'
import bangUrl       from '@assets/sound/bang.mp3?url'
import {
  boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
  boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
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
  BOSS_AWAKEN_RATIO, BOSS_AWAKEN_DMG_MULT,
  BOSS_METEOR_DMG, BOSS_METEOR_RADIUS,
  BOUNDARY,
} from '../shared/constants'

// ── 상태 타입 ──────────────────────────────────────────────────────────
type BossState =
  | 'inactive' | 'idle' | 'run'
  | 'attack1' | 'attack2' | 'jump_attack' | 'stone_throw' | 'charge'
  | 'awakening' | 'death'

// ── 보스 데이터 ───────────────────────────────────────────────────────
interface BossData {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  idleAction:    THREE.AnimationAction
  deathAction:   THREE.AnimationAction
  attack1Action: THREE.AnimationAction
  attack2Action: THREE.AnimationAction
  jumpAction:    THREE.AnimationAction
  chargeAction:  THREE.AnimationAction  // run 애니메이션 재사용

  state: BossState
  hp: number
  maxHp: number
  isDead: boolean
  hitFlash: number

  awakened: boolean
  awakeningTriggered: boolean

  stateTimer: number
  hitDealt: boolean
  hitDealt2: boolean          // 2타 공격용

  // 공격 범위/루트 표시 메시 (world-space)
  attackRangeMesh: THREE.Mesh | null

  // 돌진
  chargeDir: THREE.Vector3
  chargeDistLeft: number
  chargeWarningMesh: THREE.Mesh | null

  // 점프
  jumpY: number
  jumpPhase: number
  jumpOriginX: number
  jumpOriginZ: number
  jumpTargetX: number
  jumpTargetZ: number
  jumpLanded: boolean
  jumpSecondHitDealt: boolean
  jumpSecondHitAt: number

  // 각성 시퀀스
  awakePhase: number
  awakeTimer: number
  meteorSpawnCd: number

  // 넉백
  knockbackVel: THREE.Vector3

  deathTimer: number
}

// ── 돌 투사체 ─────────────────────────────────────────────────────────
interface StoneProjectile {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  age: number
  hitDealt: boolean
}

// ── 운석 ──────────────────────────────────────────────────────────────
interface MeteorState {
  wx: number; wz: number
  warningRing: THREE.Mesh
  timer: number
  fallen: boolean
  sphere: THREE.Mesh | null
  sphereY: number
  impactDealt: boolean
}

export class BossManager {
  private boss:    BossData | null = null
  private hasSpawned = false

  private baseGroup:    THREE.Group | null = null
  private idleClip:     THREE.AnimationClip | null = null
  private runClip:      THREE.AnimationClip | null = null
  private attackClip:   THREE.AnimationClip | null = null
  private attack2Clip:  THREE.AnimationClip | null = null
  private jumpClip:     THREE.AnimationClip | null = null
  private deathClip:    THREE.AnimationClip | null = null

  private stones:  StoneProjectile[] = []
  private meteors: MeteorState[]     = []

  private meteorRingGeo   = new THREE.RingGeometry(BOSS_METEOR_RADIUS - 0.15, BOSS_METEOR_RADIUS, 40)
  private stoneGeo        = new THREE.SphereGeometry(1.2, 8, 8)
  private stoneMat        = new THREE.MeshPhongMaterial({ color: 0x665544, emissive: 0x221100 })
  private meteorSphereMat = new THREE.MeshPhongMaterial({ color: 0x884422, emissive: 0x441100 })

  constructor(
    private scene:        THREE.Scene,
    private getCharacter: () => THREE.Group,
    private fx:           EffectSystem,
    private audio:        AudioManager,
    private damagePlayer: (amount: number) => void,
    private spawnDmgNum:  (pos: THREE.Vector3, amount: number, isPlayer: boolean) => void,
    private hud:          HUD,
    private stunPlayer:   (dur: number) => void,
    private isMounted:    () => boolean,
  ) {
    this.loadFBXs()
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
  }

  // ── 스폰 시도 ─────────────────────────────────────────────────────
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
      awakened: false, awakeningTriggered: false,
      stateTimer: 1.5,
      hitDealt: false, hitDealt2: false,
      attackRangeMesh: null,
      chargeDir: new THREE.Vector3(), chargeDistLeft: 0,
      chargeWarningMesh: null,
      jumpY: 0, jumpPhase: 0,
      jumpOriginX: 0, jumpOriginZ: 0,
      jumpTargetX: 0, jumpTargetZ: 0,
      jumpLanded: false,
      jumpSecondHitDealt: false, jumpSecondHitAt: 0,
      awakePhase: 0, awakeTimer: 0, meteorSpawnCd: 0,
      knockbackVel: new THREE.Vector3(),
      deathTimer: 0,
    }

    this.hud.showBossHP()
    this.hud.updateBossHP(BOSS_HP, BOSS_HP)
  }

  // ── 공개 프로퍼티 ─────────────────────────────────────────────────
  get isActive(): boolean {
    return this.boss !== null && !this.boss.isDead
  }

  get bossPosition(): THREE.Vector3 | null {
    if (!this.boss) return null
    return this.boss.group.position
  }

  // ── 피해 처리 ─────────────────────────────────────────────────────
  takeDamage(amount: number, knockDir?: THREE.Vector3) {
    const b = this.boss
    if (!b || b.isDead || b.state === 'death') return

    b.hp = Math.max(0, b.hp - amount)
    this.hud.updateBossHP(b.hp, b.maxHp)
    this.spawnDmgNum(b.group.position, amount, false)
    this.fx.spawnHit(b.group.position)
    b.hitFlash = 0.15
    this.setMaterial(b.group, 0xff4444)
    this.audio.playSound(enemyHitUrl, 0.6)

    if (knockDir) {
      b.knockbackVel.set(knockDir.x * 6, 0, knockDir.z * 6)
    }

    if (b.hp <= 0) { this.killBoss(); return }

    if (!b.awakeningTriggered && b.hp / b.maxHp <= BOSS_AWAKEN_RATIO) {
      b.awakeningTriggered = true
      this.setState(b, 'awakening')
    }
  }

  private killBoss() {
    const b = this.boss!
    b.isDead = true
    b.state = 'death'
    this.cleanupBattleMeshes(b)
    b.mixer.stopAllAction()
    b.deathAction.reset().play()
    b.deathTimer = 4
    this.audio.playSound(enemyDeathUrl, 0.8)
    this.hud.hideBossHP()
  }

  // 전투 중 생성된 임시 메시 정리
  private cleanupBattleMeshes(b: BossData) {
    if (b.attackRangeMesh)  { this.scene.remove(b.attackRangeMesh);  b.attackRangeMesh  = null }
    if (b.chargeWarningMesh){ this.scene.remove(b.chargeWarningMesh); b.chargeWarningMesh = null }
  }

  // ── 범위 표시 메시 생성 헬퍼 ──────────────────────────────────────
  private createRangeRing(innerR: number, outerR: number, color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.RingGeometry(innerR, outerR, 40)
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.frustumCulled = false
    return mesh
  }

  // ── 상태 전환 ─────────────────────────────────────────────────────
  private setState(b: BossData, state: BossState) {
    this.cleanupBattleMeshes(b)
    b.state      = state
    b.stateTimer = 0
    b.hitDealt   = false
    b.hitDealt2  = false
    b.mixer.stopAllAction()

    switch (state) {
      case 'idle':
        b.idleAction.reset().play()
        break

      case 'run':
        b.chargeAction.timeScale = 1.0
        b.chargeAction.reset().play()
        break

      // ── 공격1: 휘두르기 — 전방 넓은 링 표시 ──────────────────────
      case 'attack1': {
        b.attack1Action.reset().play()
        const ring = this.createRangeRing(BOSS_MELEE_RANGE * 0.55, BOSS_MELEE_RANGE, 0xff6600, 0.45)
        ring.position.set(b.group.position.x, 0.12, b.group.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      // ── 공격2: 펀치 — 좁은 전방 링 표시 ─────────────────────────
      case 'attack2': {
        b.attack2Action.reset().play()
        const ring = this.createRangeRing(0, BOSS_MELEE_RANGE * 0.88, 0xff8800, 0.38)
        ring.position.set(b.group.position.x, 0.12, b.group.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      // ── 점프: 착지 예정 지점 표시 ────────────────────────────────
      case 'jump_attack': {
        b.jumpAction.reset().play()
        b.jumpY = 0; b.jumpPhase = 0; b.jumpLanded = false
        b.jumpSecondHitDealt = false; b.jumpSecondHitAt = 0
        const char = this.getCharacter()
        b.jumpOriginX = b.group.position.x; b.jumpOriginZ = b.group.position.z
        b.jumpTargetX = char.position.x;    b.jumpTargetZ = char.position.z
        // 착지 예고 링
        const ring = this.createRangeRing(BOSS_JUMP_RADIUS * 0.7, BOSS_JUMP_RADIUS + 0.4, 0xff2200, 0.5)
        ring.position.set(b.jumpTargetX, 0.12, b.jumpTargetZ)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      // ── 돌 던지기: 타겟 위치 크로스헤어 ─────────────────────────
      case 'stone_throw': {
        b.attack1Action.reset().play()
        const char = this.getCharacter()
        const ring = this.createRangeRing(3.6, 7.8, 0xff2200, 0.5)
        ring.position.set(char.position.x, 0.12, char.position.z)
        this.scene.add(ring)
        b.attackRangeMesh = ring
        break
      }

      // ── 돌진: 경로 표시 ──────────────────────────────────────────
      case 'charge': {
        b.chargeAction.timeScale = 3.0
        b.chargeAction.reset().play()
        const char = this.getCharacter()
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        const len = Math.sqrt(dx * dx + dz * dz)
        b.chargeDir.set(len > 0 ? dx / len : 0, 0, len > 0 ? dz / len : 1)
        b.chargeDistLeft = 60

        const WARN_LEN = 46
        const warnGeo  = new THREE.BoxGeometry(BOSS_MELEE_RANGE * 2, 0.06, WARN_LEN)
        const warnMat  = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5 })
        const warnMesh = new THREE.Mesh(warnGeo, warnMat)
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

      case 'awakening':
        b.idleAction.reset().play()
        b.awakePhase = 0
        b.awakeTimer = 0
        b.meteorSpawnCd = 0
        this.fx.screenShakeTimer = 1.0
        break

      case 'death':
        break
    }
  }

  // ── 공격 선택 ─────────────────────────────────────────────────────
  private pickAttack(dist: number): BossState {
    const r = Math.random()
    if (dist > 12) return r < 0.65 ? 'charge' : 'stone_throw'
    if (dist > BOSS_MELEE_RANGE) {
      if (r < 0.25) return 'stone_throw'
      if (r < 0.85) return 'charge'
      return 'jump_attack'
    }
    if (r < 0.25) return 'attack1'
    if (r < 0.45) return 'attack2'
    if (r < 0.70) return 'charge'
    if (r < 0.85) return 'stone_throw'
    return 'jump_attack'
  }

  // ── 메인 업데이트 ─────────────────────────────────────────────────
  update(delta: number) {
    if (!this.boss) return
    const b    = this.boss
    const char = this.getCharacter()

    this.updateStones(delta, char)
    this.updateMeteors(delta, char)

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

    // hit flash 해제 — 각성 후에는 빨간 emissive 유지
    if (b.hitFlash > 0) {
      b.hitFlash -= delta
      if (b.hitFlash <= 0) this.setMaterial(b.group, b.awakened ? 0x880000 : null)
    }

    b.stateTimer += delta

    switch (b.state) {
      case 'idle':        this.updateIdle(b, char, delta);          break
      case 'run':         this.updateRun(b, char, delta);           break
      case 'attack1':     this.updateAttack1(b, char);              break
      case 'attack2':     this.updateAttack2(b, char);              break
      case 'jump_attack': this.updateJumpAttack(b, char, delta);    break
      case 'stone_throw': this.updateStoneThrow(b, char);           break
      case 'charge':      this.updateCharge(b, char, delta);        break
      case 'awakening':   this.updateAwakening(b, char, delta);     break
    }

    b.mixer.update(delta)
  }

  // ── 개별 상태 업데이트 ────────────────────────────────────────────
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

  // ── 휘두르기: 0.7s 1타, 범위 링 표시 ─────────────────────────────
  private updateAttack1(b: BossData, char: THREE.Group) {
    const clipDur = (this.attackClip?.duration ?? 1.5) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    // 링 위치를 보스에 맞춰 갱신 + 펄스
    if (b.attackRangeMesh) {
      b.attackRangeMesh.position.x = b.group.position.x
      b.attackRangeMesh.position.z = b.group.position.z
      const mat = b.attackRangeMesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 + 0.2 * Math.abs(Math.sin(b.stateTimer * 8))
    }

    const dist = Math.sqrt(dx * dx + dz * dz)
    const dmg1 = b.awakened ? Math.round(BOSS_ATTACK1_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_ATTACK1_DMG

    if (!b.hitDealt && b.stateTimer >= 1) {
      b.hitDealt = true
      if (dist <= BOSS_MELEE_RANGE) {
        this.damagePlayer(dmg1)
        this.fx.spawnRing(char.position.x, char.position.z, 0xff2200, 3.5, 0.3)
        this.fx.spawnHitOnPos(char.position.x, char.position.z)
      }
    }

    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  // ── 펀치: 0.75s 1타 ─────────────────────────────────────────────
  private updateAttack2(b: BossData, char: THREE.Group) {
    const clipDur = (this.attack2Clip?.duration ?? 1.2) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    if (b.attackRangeMesh) {
      b.attackRangeMesh.position.x = b.group.position.x
      b.attackRangeMesh.position.z = b.group.position.z
      const mat = b.attackRangeMesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.28 + 0.18 * Math.abs(Math.sin(b.stateTimer * 10))
    }

    const dist = Math.sqrt(dx * dx + dz * dz)
    const dmg1 = b.awakened ? Math.round(BOSS_ATTACK2_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_ATTACK2_DMG

    if (!b.hitDealt && b.stateTimer >= 0.25) {
      b.hitDealt = true
      if (dist <= BOSS_MELEE_RANGE * 0.88) {
        this.damagePlayer(dmg1)
        this.fx.spawnHitOnPos(char.position.x, char.position.z)
      }
    }

    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  // ── 점프 공격: 1타 기절, 0.8초 후 2타 ──────────────────────────
  private updateJumpAttack(b: BossData, char: THREE.Group, delta: number) {
    const RISE_TIME = 0.5, FALL_TIME = 0.3

    // 착지 후
    if (b.jumpLanded) {
      // 착지 예고 링 펄스
      if (b.attackRangeMesh) {
        const mat = b.attackRangeMesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.3 + 0.2 * Math.abs(Math.sin(b.stateTimer * 6))
      }

      if (!b.jumpSecondHitDealt && b.stateTimer >= b.jumpSecondHitAt) {
        b.jumpSecondHitDealt = true
        // 착지 링 제거
        if (b.attackRangeMesh) {
          this.scene.remove(b.attackRangeMesh)
          b.attackRangeMesh = null
        }
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff6600, 8.0, 0.5)
        this.fx.spawnHitOnPos(b.group.position.x, b.group.position.z)
        this.audio.playSound(bangUrl, 0.7)
        const dx = char.position.x - b.group.position.x
        const dz = char.position.z - b.group.position.z
        if (dx * dx + dz * dz <= (BOSS_JUMP_RADIUS * 1.4) * (BOSS_JUMP_RADIUS * 1.4)) {
          const dmg2 = b.awakened
            ? Math.round(BOSS_JUMP_DMG * 0.65 * BOSS_AWAKEN_DMG_MULT)
            : Math.round(BOSS_JUMP_DMG * 0.65)
          this.damagePlayer(dmg2)
        }
      }

      if (b.stateTimer >= (this.jumpClip?.duration ?? 1.2)) this.setState(b, 'idle')
      return
    }

    if (b.jumpPhase === 0) {
      // 상승 — 착지 예정 링 팔로우
      const t = Math.min(1, b.stateTimer / RISE_TIME)
      b.jumpY = t * 4.5
      const speed = b.awakened ? BOSS_AWAKENED_SPEED : BOSS_SPEED
      const tx = b.jumpTargetX - b.group.position.x
      const tz = b.jumpTargetZ - b.group.position.z
      const tl = Math.sqrt(tx * tx + tz * tz)
      if (tl > 0.2) {
        b.group.position.x += (tx / tl) * speed * 2 * delta
        b.group.position.z += (tz / tl) * speed * 2 * delta
        b.group.rotation.y  = Math.atan2(tx, tz)
      }
      b.group.position.y = b.jumpY
      if (b.stateTimer >= RISE_TIME) b.jumpPhase = 1
    } else {
      // 하강
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
        b.jumpSecondHitAt = b.stateTimer + 1.0  // 2타 타이밍

        this.fx.screenShakeTimer = 0.5
        this.fx.spawnRing(b.group.position.x, b.group.position.z, 0xff4400, 6.5, 0.5)
        this.fx.spawnHitOnPos(b.group.position.x, b.group.position.z)
        this.audio.playSound(bangUrl, 0.9)

        const dx   = char.position.x - b.group.position.x
        const dz   = char.position.z - b.group.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= BOSS_JUMP_RADIUS) {
          const dmg = b.awakened ? Math.round(BOSS_JUMP_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_JUMP_DMG
          this.damagePlayer(dmg)
          this.stunPlayer(1.0)   // 1초 기절
        }
      }
    }
  }

  // ── 돌 던지기: 0.6s 1발, 1.1s 2발, 타겟 크로스헤어 표시 ─────────
  private updateStoneThrow(b: BossData, char: THREE.Group) {
    const clipDur = (this.attackClip?.duration ?? 1.2) * 1.2
    const dx = char.position.x - b.group.position.x
    const dz = char.position.z - b.group.position.z
    b.group.rotation.y = Math.atan2(dx, dz)

    // 크로스헤어를 플레이어 따라가게
    if (b.attackRangeMesh && !b.hitDealt) {
      b.attackRangeMesh.position.x = char.position.x
      b.attackRangeMesh.position.z = char.position.z
      const mat = b.attackRangeMesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.35 + 0.2 * Math.abs(Math.sin(b.stateTimer * 12))
    }

    if (!b.hitDealt && b.stateTimer >= 0.6) {
      b.hitDealt = true
      this.fireStone(b, char)
      // 돌 던지면 크로스헤어 제거
      if (b.attackRangeMesh) {
        this.scene.remove(b.attackRangeMesh)
        b.attackRangeMesh = null
      }
    }

    if (b.stateTimer >= clipDur) this.setState(b, 'idle')
  }

  private fireStone(b: BossData, char: THREE.Group) {
    const ox = b.group.position.x + Math.sin(b.group.rotation.y) * 1.5
    const oz = b.group.position.z + Math.cos(b.group.rotation.y) * 1.5
    const tdx0 = char.position.x - ox
    const tdz0 = char.position.z - oz
    const tl0  = Math.sqrt(tdx0 * tdx0 + tdz0 * tdz0)
    const baseAngle = tl0 > 0 ? Math.atan2(tdx0, tdz0) : b.group.rotation.y

    // 부채꼴 5발 (-40°, -20°, 0°, +20°, +40°)
    const SPREAD = [-0.698, -0.349, 0, 0.349, 0.698]
    for (const offset of SPREAD) {
      const angle = baseAngle + offset
      const stone = new THREE.Mesh(this.stoneGeo, this.stoneMat)
      stone.position.set(ox, 2.0, oz)
      stone.castShadow = true
      stone.frustumCulled = false
      this.scene.add(stone)
      this.stones.push({
        mesh: stone,
        vel: new THREE.Vector3(
          Math.sin(angle) * BOSS_STONE_SPEED,
          0,
          Math.cos(angle) * BOSS_STONE_SPEED,
        ),
        age: 0, hitDealt: false,
      })
    }
  }

  // ── 돌진: 0.5s 경고 후 이동 ─────────────────────────────────────
  private updateCharge(b: BossData, _char: THREE.Group, delta: number) {
    const WINDUP     = 0.5
    const CHARGE_DUR = 1.2 + WINDUP

    if (b.stateTimer < WINDUP) {
      // 경고 메시 펄스
      if (b.chargeWarningMesh) {
        const mat = b.chargeWarningMesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.35 + 0.2 * Math.sin((WINDUP - b.stateTimer) * 30)
      }
      b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
      return
    }

    // 윈드업 끝 → 경고 메시 제거
    if (b.chargeWarningMesh) {
      this.scene.remove(b.chargeWarningMesh)
      b.chargeWarningMesh = null
    }

    b.group.rotation.y = Math.atan2(b.chargeDir.x, b.chargeDir.z)
    const speed = b.awakened ? BOSS_CHARGE_SPEED * 1.15 : BOSS_CHARGE_SPEED
    const move  = speed * delta
    b.group.position.x += b.chargeDir.x * move
    b.group.position.z += b.chargeDir.z * move
    b.chargeDistLeft -= move

    b.group.position.x = Math.max(-BOUNDARY + 1, Math.min(BOUNDARY - 1, b.group.position.x))
    b.group.position.z = Math.max(-BOUNDARY + 1, Math.min(BOUNDARY - 1, b.group.position.z))

    const char = this.getCharacter()
    const pdx  = char.position.x - b.group.position.x
    const pdz  = char.position.z - b.group.position.z
    if (!b.hitDealt && Math.sqrt(pdx * pdx + pdz * pdz) <= BOSS_MELEE_RANGE) {
      b.hitDealt = true
      const dmg = b.awakened ? Math.round(BOSS_CHARGE_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_CHARGE_DMG
      this.damagePlayer(dmg)
      this.fx.spawnHitOnPos(char.position.x, char.position.z)
      this.fx.screenShakeTimer = 0.3
    }

    if (b.stateTimer >= CHARGE_DUR || b.chargeDistLeft <= 0) this.setState(b, 'idle')
  }

  // ── 각성기: Phase0 인트로 → Phase1 10초 운석 → 각성 완료 ─────────
  private updateAwakening(b: BossData, char: THREE.Group, delta: number) {
    b.awakeTimer += delta

    if (b.awakePhase === 0) {
      const flash = Math.sin(b.awakeTimer * 20) > 0 ? 0xff4400 : 0x441100
      this.setMaterial(b.group, flash)
      this.fx.screenShakeTimer = 0.1
      if (b.awakeTimer >= 1.5) {
        b.awakePhase    = 1
        b.awakeTimer    = 0
        b.meteorSpawnCd = 0.3
        this.setMaterial(b.group, null)
      }
      return
    }

    if (b.awakePhase === 1) {
      // 운석 스폰 — 플레이어 주변 3~10 유닛 내, 한 번에 5개
      b.meteorSpawnCd -= delta
      if (b.meteorSpawnCd <= 0) {
        for (let k = 0; k < 5; k++) {
          const angle = Math.random() * Math.PI * 2
          const dist  = 3 + Math.random() * 7   // 3~10 유닛
          const wx = Math.max(-BOUNDARY + 2, Math.min(BOUNDARY - 2, char.position.x + Math.cos(angle) * dist))
          const wz = Math.max(-BOUNDARY + 2, Math.min(BOUNDARY - 2, char.position.z + Math.sin(angle) * dist))
          this.spawnSingleMeteor(wx, wz)
        }
        b.meteorSpawnCd = 0.7 + Math.random() * 0.8
      }

      // 10초 후 각성 완료
      if (b.awakeTimer >= 10.0) {
        b.awakened = true
        this.setMaterial(b.group, 0x880000)  // 빨간 몸 유지
        this.setState(b, 'idle')
      }
    }
  }

  private spawnSingleMeteor(wx: number, wz: number) {
    const mat  = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(this.meteorRingGeo, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(wx, 0.08, wz)
    ring.frustumCulled = false
    this.scene.add(ring)
    this.meteors.push({ wx, wz, warningRing: ring, timer: 1.5, fallen: false, sphere: null, sphereY: 0, impactDealt: false })
  }

  private updateMeteors(delta: number, char: THREE.Group) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      if (!m.fallen) {
        m.timer -= delta
        m.warningRing.scale.setScalar(0.85 + 0.15 * Math.sin(m.timer * 20))
        if (m.timer <= 0) {
          m.fallen = true
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), this.meteorSphereMat)
          sphere.position.set(m.wx, 22, m.wz)
          sphere.frustumCulled = false; sphere.castShadow = true
          this.scene.add(sphere)
          m.sphere = sphere; m.sphereY = 22
        }
      } else if (m.sphere) {
        m.sphereY -= 84 * delta
        m.sphere.position.y = m.sphereY
        if (m.sphereY <= 0) {
          this.scene.remove(m.sphere); this.scene.remove(m.warningRing); m.sphere = null
          this.fx.spawnHitOnPos(m.wx, m.wz)
          this.fx.spawnRing(m.wx, m.wz, 0xff4400, 5.0, 0.5)
          this.fx.screenShakeTimer = 0.35
          this.audio.playSound(bangUrl, 0.7)
          if (!m.impactDealt) {
            m.impactDealt = true
            const dx = char.position.x - m.wx, dz = char.position.z - m.wz
            if (dx * dx + dz * dz <= BOSS_METEOR_RADIUS * BOSS_METEOR_RADIUS) this.damagePlayer(BOSS_METEOR_DMG)
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
      s.mesh.position.addScaledVector(s.vel, delta)
      s.mesh.rotation.y += delta * 3
      if (!s.hitDealt) {
        const dx = char.position.x - s.mesh.position.x
        const dz = char.position.z - s.mesh.position.z
        if (dx * dx + dz * dz <= BOSS_STONE_RADIUS * BOSS_STONE_RADIUS) {
          s.hitDealt = true
          const dmg = this.boss?.awakened ? Math.round(BOSS_STONE_DMG * BOSS_AWAKEN_DMG_MULT) : BOSS_STONE_DMG
          this.damagePlayer(dmg)
          this.fx.spawnHitOnPos(s.mesh.position.x, s.mesh.position.z)
        }
      }
      if (s.age >= 4.0 || s.hitDealt) { this.scene.remove(s.mesh); this.stones.splice(i, 1) }
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
