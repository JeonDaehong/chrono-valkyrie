import * as THREE from 'three'
import slashUrl from '@assets/sound/slash.mp3?url'
import bangUrl  from '@assets/sound/bang.mp3?url'
import type { PlayerAnimation } from './PlayerAnimation'
import type { PlayerController } from './PlayerController'
import type { EnemySource } from '../shared/types'
import type { EffectSystem } from '../fx/EffectSystem'
import type { AudioManager } from '../audio/AudioManager'
import type { HUD } from '../ui/HUD'
import type { BossManager } from '../enemy/BossManager'
import {
  PLAYER_ATTACK_RANGE,
  Q_COOLDOWN, Q_ATTACK_RANGE, Q_CONE_ANGLE, Q_ATTACK_DMG, Q_KNOCKBACK_FORCE,
  W_COOLDOWN, W_DMG, W_DMG2, W_RANGE, BLINK_DIST,
  E_COOLDOWN, E_DMG, E_RANGE, E_KNOCKBACK,
  SHIELD_MAX_GAUGE, SHIELD_DRAIN_RATE, SHIELD_REGEN_RATE, SHIELD_REGEN_DELAY, SHIELD_BLOCK_COST,
  R_COOLDOWN, R_MISSILE_COUNT, R_MISSILE_DMG, R_MISSILE_SPEED, R_MISSILE_RANGE, R_HIT_RADIUS, R_EXPLODE_RADIUS,
  A_COOLDOWN, A_DMG, A_RANGE, A_BLAST_RADIUS, A_STUN_DUR, A_ARC_HEIGHT, A_FLIGHT_TIME,
  S_COOLDOWN, S_DMG, S_RANGE, S_SPEED, S_WIDTH,
  D_COOLDOWN, D_DMG, D_DOT_DMG, D_DOT_DUR, D_DOT_TICK, D_RANGE, D_WIDTH,
  F_COOLDOWN, F_DMG, F_STRIKE_COUNT, F_STRIKE_INTERVAL, F_BLAST_RADIUS, F_AREA_RADIUS,
  T_COOLDOWN, T_DMG, T_DOT_DMG, T_DOT_TICK, T_RADIUS, T_EXPAND_TIME, T_LINGER_DUR, T_PULL_FORCE, T_CHANNEL_TIME,
  HITSTOP_Q, HITSTOP_W, HITSTOP_E, HITSTOP_R, HITSTOP_A, HITSTOP_S, HITSTOP_D, HITSTOP_F, HITSTOP_T,
  COMBO_WINDOW, COMBO_DMG, COMBO_LUNGE, COMBO_HITSTOP,
} from '../shared/constants'

interface MissileInstance {
  mesh: THREE.Mesh
  light: THREE.PointLight
  vel: THREE.Vector3
  lateral: THREE.Vector3  // 좌우 흔들림 방향
  phase: number
  age: number
  hitDealt: boolean
  baseDir: THREE.Vector3
}

export class PlayerCombat {
  isAttacking  = false
  attackTimer  = 0
  comboStep    = 0          // 0=1타, 1=2타, 2=3타
  private comboWindow = 0   // 콤보 연결 허용 시간
  private lungeVel    = new THREE.Vector3()

  qIsAttacking  = false
  qAttackTimer  = 0
  qCooldown     = 0
  qFiredDirY    = 0
  private qFirePending = false

  // ── W 스킬: 점프 내리찍기 ──────────────────────────────────────────
  wIsAttacking   = false
  wMoveLocked    = false   // 점프 구간만 이동 잠금 (착지 후 해제)
  private wTimer        = 0
  wCooldown      = 0
  private wFirePending1 = false
  private wJumpY        = 0
  private wSlamX        = 0   // 1타 착지 위치 저장
  private wSlamZ        = 0
  // W 2타 폭발: 독립 타이머 (1타 후 캔슬해도 2타 폭발은 발생)
  private wExplosionTimer = -1   // <0이면 비활성

  // ── E 스킬: 전기 폭발 ──────────────────────────────────────────────
  eIsAttacking   = false
  private eTimer        = 0
  eCooldown      = 0
  private eFirePending  = false

  // ── C 쉴드 (게이지 기반, 전방 방어) ─────────────────────────────────
  isShielding    = false
  shieldGauge    = SHIELD_MAX_GAUGE
  private shieldRegenDelay = 0
  private shieldMesh: THREE.Mesh | null = null
  private shieldLight: THREE.PointLight | null = null

  // ── R 미사일 스킬 ─────────────────────────────────────────────────
  rIsAttacking   = false
  private rTimer = 0
  rCooldown      = 0
  // rFirePending 제거 — 즉시 발사
  private missiles: MissileInstance[] = []
  private missileGeo: THREE.SphereGeometry | null = null

  // ── A 수류탄 스킬 ─────────────────────────────────────────────────
  aIsAttacking   = false
  private aTimer = 0
  aCooldown      = 0
  private grenade: {
    mesh: THREE.Mesh; light: THREE.PointLight
    startPos: THREE.Vector3; targetPos: THREE.Vector3; progress: number
  } | null = null

  // ── S 에너지 검기 스킬 ───────────────────────────────────────────
  sIsAttacking   = false
  private sTimer = 0
  sCooldown      = 0
  private energyBlade: {
    mesh: THREE.Mesh; light: THREE.PointLight
    dir: THREE.Vector3; traveled: number
    hitEnemies: Set<object>
  } | null = null

  // ── D 성스러운 빔 + DOT 스킬 ────────────────────────────────────
  dIsAttacking   = false
  private dTimer = 0
  dCooldown      = 0
  private dFirePending = false
  private groundScars: Array<{
    mesh: THREE.Mesh; light: THREE.PointLight
    originX: number; originZ: number; dirX: number; dirZ: number; length: number
    age: number; dotTimer: number
  }> = []

  // ── F 공중 폭격 스킬 ────────────────────────────────────────────
  fIsAttacking   = false
  private fTimer = 0
  fCooldown      = 0
  private fPendingStrikes: Array<{ x: number; z: number; delay: number; warned: boolean }> = []

  // ── T 보이드 스톰 (궁극기) ──────────────────────────────────────
  tIsAttacking   = false
  private tTimer = 0
  tCooldown      = 0
  private voidStorm: {
    outerSphere: THREE.Mesh; innerSphere: THREE.Mesh; light: THREE.PointLight
    x: number; z: number; age: number; dotTimer: number
    initialHit: boolean; currentRadius: number
  } | null = null

  // ── 스킬 입력 버퍼 (0.15초 이내 선입력 허용) ─────────────────────
  private qBuffer = 0
  private wBuffer = 0
  private eBuffer = 0
  private rBuffer = 0
  private aBuffer = 0
  private sBuffer = 0
  private dBuffer = 0
  private fBuffer = 0
  private tBuffer = 0
  private attackBuffer = 0

  constructor(
    private playerAnim:    PlayerAnimation,
    private controller:    PlayerController,
    private scene:         THREE.Scene,
    private enemySources:  EnemySource[],
    private fx:            EffectSystem,
    private audio:         AudioManager,
    private hud:           HUD,
    private spawnDmgNum:   (pos: THREE.Vector3, amount: number, isPlayer: boolean) => void,
    private bossManager:   BossManager | null = null,
  ) {
    this.missileGeo = new THREE.SphereGeometry(0.3, 8, 8)
  }

  // ── 기본 공격 (3-hit 콤보) ─────────────────────────────────────────
  startAttack() {
    if (!this.playerAnim.mesh || !this.playerAnim.attackAction) return
    if (this.anySkillActive) {
      this.attackBuffer = 0.15
      return
    }

    // 콤보 윈도우 내면 다음 단계, 아니면 1타로 리셋
    if (this.comboWindow > 0 && this.comboStep < 2) {
      this.comboStep++
    } else {
      this.comboStep = 0
    }

    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - this.controller.character.position.x
      const dz = hit.z - this.controller.character.position.z
      this.controller.character.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.isAttacking = true
    this.attackTimer = 0
    this.comboWindow = 0
    this.controller.attackRightClickBlock = 0.2

    this.playerAnim.switchAction(this.playerAnim.attackAction, 0.05)
    // 콤보 단계별 timeScale 변경 (1타 빠름, 3타 느림+강력)
    if (this.playerAnim.attackAction) {
      this.playerAnim.attackAction.timeScale = [3.0, 2.8, 2.2][this.comboStep]
    }
    this.audio.playSound(slashUrl, 0.6 + this.comboStep * 0.1, 0.15)

    const char  = this.controller.character
    const fwdX  = Math.sin(char.rotation.y)
    const fwdZ  = Math.cos(char.rotation.y)

    // 공격 런지 (전진)
    const lunge = COMBO_LUNGE[this.comboStep]
    this.lungeVel.set(fwdX * lunge / 0.1, 0, fwdZ * lunge / 0.1)

    // 이펙트
    const effectPos = new THREE.Vector3(char.position.x + fwdX * 2.0, char.position.y, char.position.z + fwdZ * 2.0)
    this.fx.spawnAttack(effectPos, char.rotation.y)
    this.fx.spawnSwingTrail(char.position, char.rotation.y, this.comboStep)
    // 3타에 추가 이펙트
    if (this.comboStep === 2) {
      this.fx.spawnRing(char.position.x, char.position.z, 0x00ccff, 4.0, 0.3)
      this.fx.screenShakeTimer = Math.max(this.fx.screenShakeTimer, 0.15)
    }

    // 데미지 판정
    const dmg = COMBO_DMG[this.comboStep]
    let hitCount = 0

    for (const src of this.enemySources) {
      for (const enemy of src.enemies) {
        if (enemy.isDead) continue
        const dx   = enemy.group.position.x - char.position.x
        const dz   = enemy.group.position.z - char.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= PLAYER_ATTACK_RANGE && dist > 0) {
          const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ
          if (dot >= 0.35) { src.damageEnemy(enemy, dmg); hitCount++ }
        }
      }
    }

    if (this.bossManager?.isActive) {
      const bpos = this.bossManager.bossPosition
      if (bpos) {
        const dx   = bpos.x - char.position.x
        const dz   = bpos.z - char.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= PLAYER_ATTACK_RANGE && dist > 0) {
          const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ
          if (dot >= 0.35) { this.bossManager.takeDamage(dmg); hitCount++ }
        }
      }
    }

    // 공격자 히트스톱 (적중 시에만)
    if (hitCount > 0) {
      this.playerAnim.triggerHitStop(COMBO_HITSTOP[this.comboStep])
    }
  }

  cancelAttack() {
    if (!this.isAttacking) return
    this.isAttacking = false
    if (this.playerAnim.runAction) this.playerAnim.switchAction(this.playerAnim.runAction, 0.08)
    else if (this.playerAnim.idleAction) this.playerAnim.switchAction(this.playerAnim.idleAction, 0.08)
  }

  // ── Q 스킬 ─────────────────────────────────────────────────────────
  startQAttack() {
    if (this.qCooldown > 0 || !this.playerAnim.qAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) {
      this.qBuffer = 0.15
      return
    }

    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - this.controller.character.position.x
      const dz = hit.z - this.controller.character.position.z
      this.controller.character.rotation.y = Math.atan2(dx, dz)
    }

    this.qFiredDirY = this.controller.character.rotation.y
    this.controller.moveTarget = null
    this.qIsAttacking  = true
    this.qAttackTimer  = 0
    this.qFirePending  = true
    this.qCooldown     = Q_COOLDOWN

    this.hud.updateQ(this.qCooldown, Q_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.qAttackAction, 0.05)
    this.playerAnim.swapHandItems()
  }

  // ── W 스킬: 점프 내리찍기 ──────────────────────────────────────────
  startWAttack() {
    if (this.wCooldown > 0 || !this.playerAnim.wAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) {
      this.wBuffer = 0.15
      return
    }

    const char = this.controller.character
    const hit  = this.controller.getGroundHit()
    if (hit) {
      const cx = char.position.x, cz = char.position.z
      const dx = hit.x - cx, dz = hit.z - cz
      const dist  = Math.sqrt(dx * dx + dz * dz)
      const ratio = dist > BLINK_DIST ? BLINK_DIST / dist : 1
      const tx = cx + dx * ratio, tz = cz + dz * ratio
      // 출발지 + 도착지 점멸 이펙트
      this.fx.spawnBlink(cx, cz)
      char.position.x = tx
      char.position.z = tz
      this.fx.spawnBlink(tx, tz)
      if (dist > 0.1) char.rotation.y = Math.atan2(dx, dz)
    }
    this.controller.moveTarget = null

    this.wIsAttacking  = true
    this.wMoveLocked   = true
    this.wTimer        = 0
    this.wFirePending1 = true
    this.wJumpY        = 0
    this.wCooldown     = W_COOLDOWN

    this.hud.updateSkillW(this.wCooldown, W_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.wAttackAction, 0.05)
    this.playerAnim.setRightHandVisible(false)
  }

  // ── E 스킬: 전기 폭발 ──────────────────────────────────────────────
  startEAttack() {
    if (this.eCooldown > 0 || !this.playerAnim.eAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) {
      this.eBuffer = 0.15
      return
    }

    this.eIsAttacking = true
    this.eTimer       = 0
    this.eFirePending = true
    this.eCooldown    = E_COOLDOWN

    this.hud.updateSkillE(this.eCooldown, E_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.eAttackAction, 0.05)
  }

  // ── R 미사일 스킬 ─────────────────────────────────────────────────
  startRAttack() {
    if (this.rCooldown > 0 || !this.playerAnim.qAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) {
      this.rBuffer = 0.15
      return
    }

    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - this.controller.character.position.x
      const dz = hit.z - this.controller.character.position.z
      this.controller.character.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.rIsAttacking = true
    this.rTimer       = 0
    this.rCooldown    = R_COOLDOWN
    this.spawnMissiles()   // 즉시 발사 (딜레이 제거)

    this.hud.updateSkillR(this.rCooldown, R_COOLDOWN)
    // Q 모션 재사용
    this.playerAnim.switchAction(this.playerAnim.qAttackAction, 0.05)
    this.playerAnim.swapHandItems()
    this.audio.playSound(bangUrl, 0.7, 0.1)
  }

  private spawnMissiles() {
    const char = this.controller.character
    const dirY = char.rotation.y
    const fwdX = Math.sin(dirY)
    const fwdZ = Math.cos(dirY)
    const angles = [-15, 0, 15]  // degrees

    for (let i = 0; i < R_MISSILE_COUNT; i++) {
      const a = dirY + (angles[i] * Math.PI / 180)
      const bx = Math.sin(a)
      const bz = Math.cos(a)

      const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.9 })
      const mesh = new THREE.Mesh(this.missileGeo!, mat)
      mesh.frustumCulled = false
      mesh.position.set(
        char.position.x + fwdX * 1.0,
        1.2,
        char.position.z + fwdZ * 1.0,
      )
      this.scene.add(mesh)

      const light = new THREE.PointLight(0x00ccff, 4, 8)
      light.position.copy(mesh.position)
      this.scene.add(light)

      // 좌우 방향 (baseDir에 수직)
      const lateral = new THREE.Vector3(-bz, 0, bx)

      this.missiles.push({
        mesh, light,
        vel: new THREE.Vector3(bx, 0, bz),
        lateral,
        phase: Math.random() * Math.PI * 2,
        age: 0,
        hitDealt: false,
        baseDir: new THREE.Vector3(bx, 0, bz),
      })
    }
  }

  // ── C 쉴드 활성/비활성 ──────────────────────────────────────────────
  activateShield() {
    if (this.shieldGauge <= 0 || this.isShielding) return
    if (this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking || this.rIsAttacking || this.aIsAttacking || this.sIsAttacking || this.dIsAttacking || this.fIsAttacking || this.tIsAttacking) return
    this.isShielding = true
    this.controller.moveTarget = null

    const char = this.controller.character
    const fwdX = Math.sin(char.rotation.y)
    const fwdZ = Math.cos(char.rotation.y)

    // 파란 성스러운 쉴드 — 캐릭터 전방에 수직 배치
    const geo = new THREE.CircleGeometry(1.2, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    })
    this.shieldMesh = new THREE.Mesh(geo, mat)
    this.shieldMesh.frustumCulled = false
    this.shieldMesh.position.set(
      char.position.x + fwdX * 1.5,
      1.0,
      char.position.z + fwdZ * 1.5,
    )
    this.shieldMesh.rotation.y = char.rotation.y
    this.scene.add(this.shieldMesh)

    // 성스러운 빛
    this.shieldLight = new THREE.PointLight(0x4488ff, 3, 6)
    this.shieldLight.position.copy(this.shieldMesh.position)
    this.scene.add(this.shieldLight)

    // E 모션 사용 (LoopRepeat)
    if (this.playerAnim.eAttackAction) {
      this.playerAnim.eAttackAction.loop = THREE.LoopRepeat
      this.playerAnim.eAttackAction.clampWhenFinished = false
      this.playerAnim.switchAction(this.playerAnim.eAttackAction, 0.1)
    }
  }

  deactivateShield() {
    if (!this.isShielding) return
    this.isShielding = false
    if (this.shieldMesh) {
      this.scene.remove(this.shieldMesh)
      this.shieldMesh.geometry.dispose()
      ;(this.shieldMesh.material as THREE.Material).dispose()
      this.shieldMesh = null
    }
    if (this.shieldLight) {
      this.scene.remove(this.shieldLight)
      this.shieldLight.dispose()
      this.shieldLight = null
    }
    this.shieldRegenDelay = SHIELD_REGEN_DELAY

    // E 애니메이션 원래 설정 복원 (LoopOnce)
    if (this.playerAnim.eAttackAction) {
      this.playerAnim.eAttackAction.loop = THREE.LoopOnce
      this.playerAnim.eAttackAction.clampWhenFinished = true
    }
    // idle 복귀
    if (this.playerAnim.idleAction) this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
  }

  /** 전방 방어 체크 — 공격 원점과 dot product > 0.3이면 막힘 */
  tryBlockDamage(attackOrigin: THREE.Vector3): boolean {
    if (!this.isShielding || this.shieldGauge <= 0) return false
    const char = this.controller.character
    const fwd = new THREE.Vector3(Math.sin(char.rotation.y), 0, Math.cos(char.rotation.y))
    const toAttacker = new THREE.Vector3(
      attackOrigin.x - char.position.x, 0, attackOrigin.z - char.position.z,
    ).normalize()
    if (fwd.dot(toAttacker) > 0.3) {
      this.shieldGauge = Math.max(0, this.shieldGauge - SHIELD_BLOCK_COST)
      this.hud.updateShieldGauge(this.shieldGauge / SHIELD_MAX_GAUGE)
      // 방어 이펙트
      this.fx.spawnRing(char.position.x, char.position.z, 0x4488ff, 2.0, 0.2)
      return true
    }
    return false
  }

  /** 어떤 스킬이든 활성 중인지 체크 */
  private get anySkillActive() {
    return this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking
      || this.rIsAttacking || this.isShielding || this.aIsAttacking || this.sIsAttacking
      || this.dIsAttacking || this.fIsAttacking || this.tIsAttacking
  }

  // ── 버퍼 플러시: 스킬 종료 직후 선입력 소비 ────────────────────────
  private flushBuffer() {
    if (this.wBuffer > 0) { this.wBuffer = 0; this.startWAttack(); return }
    if (this.tBuffer > 0) { this.tBuffer = 0; this.startTAttack(); return }
    if (this.fBuffer > 0) { this.fBuffer = 0; this.startFAttack(); return }
    if (this.dBuffer > 0) { this.dBuffer = 0; this.startDAttack(); return }
    if (this.aBuffer > 0) { this.aBuffer = 0; this.startAAttack(); return }
    if (this.sBuffer > 0) { this.sBuffer = 0; this.startSAttack(); return }
    if (this.eBuffer > 0) { this.eBuffer = 0; this.startEAttack(); return }
    if (this.qBuffer > 0) { this.qBuffer = 0; this.startQAttack(); return }
    if (this.rBuffer > 0) { this.rBuffer = 0; this.startRAttack(); return }
    if (this.attackBuffer > 0) { this.attackBuffer = 0; this.startAttack() }
  }

  // ── 메인 업데이트 ──────────────────────────────────────────────────
  update(delta: number) {
    // 버퍼 타이머 감소
    if (this.qBuffer > 0) this.qBuffer = Math.max(0, this.qBuffer - delta)
    if (this.wBuffer > 0) this.wBuffer = Math.max(0, this.wBuffer - delta)
    if (this.eBuffer > 0) this.eBuffer = Math.max(0, this.eBuffer - delta)
    if (this.rBuffer > 0) this.rBuffer = Math.max(0, this.rBuffer - delta)
    if (this.aBuffer > 0) this.aBuffer = Math.max(0, this.aBuffer - delta)
    if (this.sBuffer > 0) this.sBuffer = Math.max(0, this.sBuffer - delta)
    if (this.dBuffer > 0) this.dBuffer = Math.max(0, this.dBuffer - delta)
    if (this.fBuffer > 0) this.fBuffer = Math.max(0, this.fBuffer - delta)
    if (this.tBuffer > 0) this.tBuffer = Math.max(0, this.tBuffer - delta)
    if (this.attackBuffer > 0) this.attackBuffer = Math.max(0, this.attackBuffer - delta)

    // 콤보 윈도우 감소
    if (this.comboWindow > 0) this.comboWindow -= delta

    // 기본 공격 + 런지
    if (this.isAttacking) {
      this.attackTimer += delta

      // 런지 이동 (처음 0.1초)
      if (this.lungeVel.lengthSq() > 0.01) {
        this.controller.character.position.addScaledVector(this.lungeVel, delta)
        this.lungeVel.multiplyScalar(Math.max(0, 1 - delta * 18))
      }

      if (this.attackTimer >= this.playerAnim.attackDuration) {
        this.isAttacking = false
        this.comboWindow = COMBO_WINDOW  // 콤보 연결 허용
        this.lungeVel.set(0, 0, 0)
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.1)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
        this.flushBuffer()
      }
    }

    // Q 스킬
    if (this.qIsAttacking) {
      this.qAttackTimer += delta

      if (this.qFirePending && this.qAttackTimer >= 0.25) {
        this.qFirePending = false
        const char  = this.controller.character
        const qFwdX = Math.sin(this.qFiredDirY)
        const qFwdZ = Math.cos(this.qFiredDirY)
        this.fx.spawnFireCone(char.position.x + qFwdX, char.position.z + qFwdZ, this.qFiredDirY)
        this.audio.playSound(bangUrl, 0.8, 0.1)
        this.playerAnim.triggerHitStop(HITSTOP_Q)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const ex   = enemy.group.position.x - char.position.x
            const ez   = enemy.group.position.z - char.position.z
            const dist = Math.sqrt(ex * ex + ez * ez)
            if (dist <= Q_ATTACK_RANGE && dist > 0) {
              const dot = (ex / dist) * qFwdX + (ez / dist) * qFwdZ
              if (dot >= Math.cos(Q_CONE_ANGLE / 2)) {
                src.damageEnemy(enemy, Q_ATTACK_DMG)
                if (dist > 0.01)
                  enemy.knockbackVel.set((ex / dist) * Q_KNOCKBACK_FORCE, 0, (ez / dist) * Q_KNOCKBACK_FORCE)
              }
            }
          }
        }

        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const ex   = bpos.x - char.position.x
            const ez   = bpos.z - char.position.z
            const dist = Math.sqrt(ex * ex + ez * ez)
            if (dist <= Q_ATTACK_RANGE && dist > 0) {
              const dot = (ex / dist) * qFwdX + (ez / dist) * qFwdZ
              if (dot >= Math.cos(Q_CONE_ANGLE / 2))
                this.bossManager.takeDamage(Q_ATTACK_DMG, new THREE.Vector3(ex / dist, 0, ez / dist))
            }
          }
        }
      }

      if (this.qAttackTimer >= this.playerAnim.qAttackDuration) {
        this.qIsAttacking = false
        this.qFirePending = false
        this.playerAnim.swapHandItems()
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
        this.flushBuffer()
      }
    }

    if (this.qCooldown > 0) {
      this.qCooldown = Math.max(0, this.qCooldown - delta)
      this.hud.updateQ(this.qCooldown, Q_COOLDOWN)
    }

    // ── W 스킬 업데이트 ──────────────────────────────────────────────
    if (this.wIsAttacking) {
      this.wTimer += delta

      const RISE = 0.45, SLAM = 0.75    // 상승 0.45s → 착지 0.75s
      if (this.wTimer < RISE) {
        this.wJumpY = (this.wTimer / RISE) * 3.5
      } else if (this.wTimer < SLAM) {
        const t = (this.wTimer - RISE) / (SLAM - RISE)
        this.wJumpY = 3.5 * (1 - t)
      } else {
        this.wJumpY = 0
      }
      this.controller.character.position.y = this.wJumpY

      // 착지 1타: AoE 데미지 → 즉시 W 종료 (이동/스킬 가능) + 2타 독립 타이머 시작
      if (this.wFirePending1 && this.wTimer >= SLAM) {
        this.wFirePending1 = false
        this.wMoveLocked   = false
        this.controller.character.position.y = 0
        this.wJumpY = 0
        const char = this.controller.character
        this.wSlamX = char.position.x
        this.wSlamZ = char.position.z
        this.fx.screenShakeTimer = 0.7
        this.fx.spawnWSlamImpact(this.wSlamX, this.wSlamZ)
        this.audio.playSound(bangUrl, 0.9, 0.1)
        this.playerAnim.triggerHitStop(HITSTOP_W)
        this.hud.triggerScreenFlash('#ff8844', 0.08)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - this.wSlamX
            const dz = enemy.group.position.z - this.wSlamZ
            if (dx * dx + dz * dz <= W_RANGE * W_RANGE) src.damageEnemy(enemy, W_DMG)
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - this.wSlamX
            const dz = bpos.z - this.wSlamZ
            if (dx * dx + dz * dz <= W_RANGE * W_RANGE) this.bossManager.takeDamage(W_DMG)
          }
        }

        // W 1타 종료 → 즉시 해방, 2타 폭발 독립 타이머 시작
        this.wExplosionTimer = 1.0
        this.wIsAttacking  = false
        this.wMoveLocked   = false
        this.controller.character.position.y = 0
        this.playerAnim.setRightHandVisible(true)
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.1)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
        this.flushBuffer()
      }
    }

    // ── W 2타: 독립 폭발 타이머 (1타 후 캔슬해도 발동) ──────────────
    if (this.wExplosionTimer >= 0) {
      this.wExplosionTimer -= delta
      if (this.wExplosionTimer < 0) {
        this.fx.screenShakeTimer = 0.6
        this.fx.spawnWExplosion(this.wSlamX, this.wSlamZ)
        this.audio.playSound(bangUrl, 0.85, 0.1)
        this.hud.triggerScreenFlash('#cc44ff', 0.08)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - this.wSlamX
            const dz = enemy.group.position.z - this.wSlamZ
            if (dx * dx + dz * dz <= W_RANGE * W_RANGE) src.damageEnemy(enemy, W_DMG2)
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - this.wSlamX
            const dz = bpos.z - this.wSlamZ
            if (dx * dx + dz * dz <= W_RANGE * W_RANGE) this.bossManager.takeDamage(W_DMG2)
          }
        }
      }
    }

    if (this.wCooldown > 0) {
      this.wCooldown = Math.max(0, this.wCooldown - delta)
      this.hud.updateSkillW(this.wCooldown, W_COOLDOWN)
    }

    // ── E 스킬 업데이트 ──────────────────────────────────────────────
    if (this.eIsAttacking) {
      this.eTimer += delta

      if (this.eFirePending && this.eTimer >= 0.25) {
        this.eFirePending = false
        const char = this.controller.character
        this.fx.spawnRing(char.position.x, char.position.z, 0x44ffff, E_RANGE, 0.5)
        this.fx.spawnRing(char.position.x, char.position.z, 0xaa44ff, E_RANGE * 0.55, 0.5)
        this.fx.spawnHitOnPos(char.position.x, char.position.z)
        this.fx.screenShakeTimer = 0.4
        this.audio.playSound(bangUrl, 0.9, 0.1)
        this.playerAnim.triggerHitStop(HITSTOP_E)
        this.hud.triggerScreenFlash('#44ffff', 0.06)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx   = enemy.group.position.x - char.position.x
            const dz   = enemy.group.position.z - char.position.z
            const dist = Math.sqrt(dx * dx + dz * dz)
            if (dist <= E_RANGE) {
              src.damageEnemy(enemy, E_DMG)
              if (dist > 0.1)
                enemy.knockbackVel.set((dx / dist) * E_KNOCKBACK, 0, (dz / dist) * E_KNOCKBACK)
            }
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx   = bpos.x - char.position.x
            const dz   = bpos.z - char.position.z
            const dist = Math.sqrt(dx * dx + dz * dz)
            if (dist <= E_RANGE && dist > 0)
              this.bossManager.takeDamage(E_DMG, new THREE.Vector3(dx / dist, 0, dz / dist))
          }
        }
      }

      if (this.eTimer >= this.playerAnim.eAttackDuration) {
        this.eIsAttacking = false
        this.eFirePending = false
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
        this.flushBuffer()
      }
    }

    if (this.eCooldown > 0) {
      this.eCooldown = Math.max(0, this.eCooldown - delta)
      this.hud.updateSkillE(this.eCooldown, E_COOLDOWN)
    }

    // ── R 스킬 업데이트 ──────────────────────────────────────────────
    if (this.rIsAttacking) {
      this.rTimer += delta

      if (this.rTimer >= this.playerAnim.qAttackDuration) {
        this.rIsAttacking = false
        this.playerAnim.swapHandItems()
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
        this.flushBuffer()
      }
    }

    if (this.rCooldown > 0) {
      this.rCooldown = Math.max(0, this.rCooldown - delta)
      this.hud.updateSkillR(this.rCooldown, R_COOLDOWN)
    }

    // ── 미사일 업데이트 (R 스킬 발사 후 독립) ──────────────────────────
    this.updateMissiles(delta)

    // ── A/S/D/F/T 스킬 업데이트 ─────────────────────────────────────
    this.updateASkill(delta)
    this.updateSSkill(delta)
    this.updateDSkill(delta)
    this.updateFSkill(delta)
    this.updateTSkill(delta)

    // ── 방패 업데이트 ─────────────────────────────────────────────────
    if (this.isShielding) {
      // 게이지 소모
      this.shieldGauge = Math.max(0, this.shieldGauge - SHIELD_DRAIN_RATE * delta)
      this.hud.updateShieldGauge(this.shieldGauge / SHIELD_MAX_GAUGE)

      // 게이지 0이면 자동 해제
      if (this.shieldGauge <= 0) {
        this.deactivateShield()
      } else if (this.shieldMesh) {
        // 쉴드 위치 + 비주얼 업데이트
        const char = this.controller.character
        const fwdX = Math.sin(char.rotation.y)
        const fwdZ = Math.cos(char.rotation.y)
        this.shieldMesh.position.set(
          char.position.x + fwdX * 1.5,
          1.0,
          char.position.z + fwdZ * 1.5,
        )
        this.shieldMesh.rotation.y = char.rotation.y
        const mat = this.shieldMesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.4 + 0.3 * Math.abs(Math.sin(Date.now() * 0.004))
        // 게이지 비율에 따라 밝기
        const gaugeRatio = this.shieldGauge / SHIELD_MAX_GAUGE
        mat.color.setRGB(0.27 * gaugeRatio, 0.53 * gaugeRatio, 1.0)

        if (this.shieldLight) {
          this.shieldLight.position.copy(this.shieldMesh.position)
          this.shieldLight.intensity = 2 + gaugeRatio * 2
        }
      }
    } else {
      // 비방어 시 게이지 재생
      if (this.shieldRegenDelay > 0) {
        this.shieldRegenDelay -= delta
      } else if (this.shieldGauge < SHIELD_MAX_GAUGE) {
        this.shieldGauge = Math.min(SHIELD_MAX_GAUGE, this.shieldGauge + SHIELD_REGEN_RATE * delta)
        this.hud.updateShieldGauge(this.shieldGauge / SHIELD_MAX_GAUGE)
      }
    }
  }

  // ── 미사일 업데이트 ─────────────────────────────────────────────────
  private updateMissiles(delta: number) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]
      m.age += delta

      // 속도 증가 (느리게 시작 → 가속)
      const speed = R_MISSILE_SPEED * (0.7 + m.age * 2)
      // 좌우 흔들림
      const wobble = Math.sin(m.age * 8 + m.phase) * 1.5

      const moveX = m.baseDir.x * speed + m.lateral.x * wobble
      const moveZ = m.baseDir.z * speed + m.lateral.z * wobble
      m.mesh.position.x += moveX * delta
      m.mesh.position.z += moveZ * delta
      // 약간 위아래도 흔들림
      m.mesh.position.y = 1.2 + Math.sin(m.age * 6 + m.phase) * 0.3

      m.light.position.copy(m.mesh.position)

      // 꼬리 이펙트
      this.fx.spawnTrailPuff(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z)

      // 이동 거리 체크 (최대 사거리)
      const traveled = m.age * R_MISSILE_SPEED * (0.7 + m.age)
      let explode = traveled >= R_MISSILE_RANGE

      // 적 히트 체크
      if (!m.hitDealt) {
        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - m.mesh.position.x
            const dz = enemy.group.position.z - m.mesh.position.z
            if (dx * dx + dz * dz <= R_HIT_RADIUS * R_HIT_RADIUS) {
              m.hitDealt = true
              explode = true
              break
            }
          }
          if (explode) break
        }
        if (!explode && this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - m.mesh.position.x
            const dz = bpos.z - m.mesh.position.z
            if (dx * dx + dz * dz <= R_HIT_RADIUS * R_HIT_RADIUS) {
              m.hitDealt = true
              explode = true
            }
          }
        }
      }

      if (explode) {
        // 폭발!
        this.explodeMissile(m)
        // 정리
        this.scene.remove(m.mesh)
        ;(m.mesh.material as THREE.Material).dispose()
        this.scene.remove(m.light)
        m.light.dispose()
        this.missiles.splice(i, 1)
      }
    }
  }

  private explodeMissile(m: MissileInstance) {
    const pos = m.mesh.position
    // AOE 데미지
    for (const src of this.enemySources) {
      for (const enemy of src.enemies) {
        if (enemy.isDead) continue
        const dx = enemy.group.position.x - pos.x
        const dz = enemy.group.position.z - pos.z
        if (dx * dx + dz * dz <= R_EXPLODE_RADIUS * R_EXPLODE_RADIUS) {
          src.damageEnemy(enemy, R_MISSILE_DMG)
        }
      }
    }
    if (this.bossManager?.isActive) {
      const bpos = this.bossManager.bossPosition
      if (bpos) {
        const dx = bpos.x - pos.x
        const dz = bpos.z - pos.z
        if (dx * dx + dz * dz <= R_EXPLODE_RADIUS * R_EXPLODE_RADIUS)
          this.bossManager.takeDamage(R_MISSILE_DMG)
      }
    }

    // 이펙트
    this.fx.spawnRExplosion(pos)
    this.audio.playSound(bangUrl, 0.7, 0.15)
    this.playerAnim.triggerHitStop(HITSTOP_R)
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ A 스킬: 수류탄 발사 (포물선 → 폭발 → 기절)
  // ══════════════════════════════════════════════════════════════════════
  startAAttack() {
    if (this.aCooldown > 0 || !this.playerAnim.qAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) { this.aBuffer = 0.15; return }

    const char = this.controller.character
    const hit  = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - char.position.x, dz = hit.z - char.position.z
      char.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.aIsAttacking = true
    this.aTimer       = 0
    this.aCooldown    = A_COOLDOWN
    this.hud.updateSkillA(this.aCooldown, A_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.qAttackAction, 0.05)
    this.playerAnim.swapHandItems()
  }

  private updateASkill(delta: number) {
    // 수류탄 비행 업데이트 (독립 — 스킬 종료 후에도 비행 가능)
    if (this.grenade) {
      this.grenade.progress += delta / A_FLIGHT_TIME
      const p = Math.min(1, this.grenade.progress)
      const g = this.grenade
      g.mesh.position.lerpVectors(g.startPos, g.targetPos, p)
      g.mesh.position.y = A_ARC_HEIGHT * Math.sin(p * Math.PI)
      g.light.position.copy(g.mesh.position)
      g.mesh.rotation.x += delta * 12
      g.mesh.rotation.z += delta * 8

      if (p >= 1) {
        // 착탄 폭발
        const tx = g.targetPos.x, tz = g.targetPos.z
        this.scene.remove(g.mesh); g.mesh.geometry.dispose(); (g.mesh.material as THREE.Material).dispose()
        this.scene.remove(g.light); g.light.dispose()
        this.grenade = null

        this.fx.spawnGrenadeExplosion(tx, tz)
        this.audio.playSound(bangUrl, 0.9, 0.1)
        this.playerAnim.triggerHitStop(HITSTOP_A)
        this.hud.triggerScreenFlash('#ff8844', 0.08)

        // AOE 데미지 + 기절
        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - tx, dz = enemy.group.position.z - tz
            if (dx * dx + dz * dz <= A_BLAST_RADIUS * A_BLAST_RADIUS) {
              src.damageEnemy(enemy, A_DMG)
              enemy.stunTimer = Math.max(enemy.stunTimer, A_STUN_DUR)
            }
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - tx, dz = bpos.z - tz
            if (dx * dx + dz * dz <= A_BLAST_RADIUS * A_BLAST_RADIUS)
              this.bossManager.takeDamage(A_DMG)
          }
        }
      }
    }

    if (!this.aIsAttacking) {
      if (this.aCooldown > 0) {
        this.aCooldown = Math.max(0, this.aCooldown - delta)
        this.hud.updateSkillA(this.aCooldown, A_COOLDOWN)
      }
      return
    }

    this.aTimer += delta

    // 0.2초에 수류탄 스폰
    if (!this.grenade && this.aTimer >= 0.2) {
      const char = this.controller.character
      const fwdX = Math.sin(char.rotation.y), fwdZ = Math.cos(char.rotation.y)
      const startPos = new THREE.Vector3(char.position.x + fwdX, 1.5, char.position.z + fwdZ)
      const targetPos = new THREE.Vector3(char.position.x + fwdX * A_RANGE, 0, char.position.z + fwdZ * A_RANGE)

      // 마우스 조준이면 마우스 위치로
      const ghit = this.controller.getGroundHit()
      if (ghit) {
        const dx = ghit.x - char.position.x, dz = ghit.z - char.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const ratio = dist > A_RANGE ? A_RANGE / dist : 1
        targetPos.set(char.position.x + dx * ratio, 0, char.position.z + dz * ratio)
      }

      const geo = new THREE.SphereGeometry(0.25, 8, 8)
      const mat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.position.copy(startPos)
      this.scene.add(mesh)
      const light = new THREE.PointLight(0xff6600, 3, 6)
      light.position.copy(startPos)
      this.scene.add(light)

      this.grenade = { mesh, light, startPos, targetPos, progress: 0 }
    }

    // 애니메이션 종료
    if (this.aTimer >= this.playerAnim.qAttackDuration) {
      this.aIsAttacking = false
      this.playerAnim.swapHandItems()
      if (this.controller.isMoving && this.playerAnim.runAction)
        this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
      else if (this.playerAnim.idleAction)
        this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
      this.flushBuffer()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ S 스킬: 에너지 검기 (관통 직선 투사체)
  // ══════════════════════════════════════════════════════════════════════
  startSAttack() {
    if (this.sCooldown > 0 || !this.playerAnim.attackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) { this.sBuffer = 0.15; return }

    const char = this.controller.character
    const hit  = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - char.position.x, dz = hit.z - char.position.z
      char.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.sIsAttacking = true
    this.sTimer       = 0
    this.sCooldown    = S_COOLDOWN
    this.hud.updateSkillS(this.sCooldown, S_COOLDOWN)

    this.playerAnim.switchAction(this.playerAnim.attackAction, 0.05)
    if (this.playerAnim.attackAction) this.playerAnim.attackAction.timeScale = 2.5
    this.audio.playSound(slashUrl, 0.8, 0.1)
  }

  private updateSSkill(delta: number) {
    // 검기 비행 업데이트 (독립)
    if (this.energyBlade) {
      const b = this.energyBlade
      const move = S_SPEED * delta
      b.mesh.position.addScaledVector(b.dir, move)
      b.light.position.copy(b.mesh.position)
      b.traveled += move

      // 약간 크기 증가
      b.mesh.scale.x *= 1 + delta * 0.5
      // 트레일
      this.fx.spawnBladeTrail(b.mesh.position.x, 1.0, b.mesh.position.z)

      // 적 히트 (관통)
      for (const src of this.enemySources) {
        for (const enemy of src.enemies) {
          if (enemy.isDead || b.hitEnemies.has(enemy)) continue
          const dx = enemy.group.position.x - b.mesh.position.x
          const dz = enemy.group.position.z - b.mesh.position.z
          if (dx * dx + dz * dz <= (S_WIDTH * 0.7) * (S_WIDTH * 0.7)) {
            src.damageEnemy(enemy, S_DMG)
            b.hitEnemies.add(enemy)
            this.playerAnim.triggerHitStop(HITSTOP_S)
          }
        }
      }
      if (this.bossManager?.isActive) {
        const bpos = this.bossManager.bossPosition
        if (bpos && !b.hitEnemies.has(this.bossManager)) {
          const dx = bpos.x - b.mesh.position.x, dz = bpos.z - b.mesh.position.z
          if (dx * dx + dz * dz <= (S_WIDTH * 0.7) * (S_WIDTH * 0.7)) {
            this.bossManager.takeDamage(S_DMG)
            b.hitEnemies.add(this.bossManager)
            this.playerAnim.triggerHitStop(HITSTOP_S)
          }
        }
      }

      if (b.traveled >= S_RANGE) {
        this.scene.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as THREE.Material).dispose()
        this.scene.remove(b.light); b.light.dispose()
        this.energyBlade = null
      }
    }

    if (!this.sIsAttacking) {
      if (this.sCooldown > 0) {
        this.sCooldown = Math.max(0, this.sCooldown - delta)
        this.hud.updateSkillS(this.sCooldown, S_COOLDOWN)
      }
      return
    }

    this.sTimer += delta

    // 0.15초에 검기 스폰
    if (!this.energyBlade && this.sTimer >= 0.15) {
      const char = this.controller.character
      const dirY = char.rotation.y
      const fwdX = Math.sin(dirY), fwdZ = Math.cos(dirY)

      const geo = new THREE.BoxGeometry(S_WIDTH, 0.15, 0.5)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffee, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.position.set(char.position.x + fwdX * 2, 1.0, char.position.z + fwdZ * 2)
      mesh.rotation.y = dirY
      this.scene.add(mesh)

      const light = new THREE.PointLight(0x00ffee, 5, 10)
      light.position.copy(mesh.position)
      this.scene.add(light)

      this.energyBlade = {
        mesh, light,
        dir: new THREE.Vector3(fwdX, 0, fwdZ),
        traveled: 0,
        hitEnemies: new Set(),
      }

      this.fx.spawnRing(char.position.x, char.position.z, 0x00ffee, 3.0, 0.25)
    }

    if (this.sTimer >= this.playerAnim.attackDuration) {
      this.sIsAttacking = false
      if (this.controller.isMoving && this.playerAnim.runAction)
        this.playerAnim.switchAction(this.playerAnim.runAction, 0.1)
      else if (this.playerAnim.idleAction)
        this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
      this.flushBuffer()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ D 스킬: 성스러운 빔 + 지면 상흔 DOT
  // ══════════════════════════════════════════════════════════════════════
  startDAttack() {
    if (this.dCooldown > 0 || !this.playerAnim.eAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) { this.dBuffer = 0.15; return }

    const char = this.controller.character
    const hit  = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - char.position.x, dz = hit.z - char.position.z
      char.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.dIsAttacking  = true
    this.dTimer        = 0
    this.dFirePending  = true
    this.dCooldown     = D_COOLDOWN
    this.hud.updateSkillD(this.dCooldown, D_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.eAttackAction, 0.05)
  }

  private updateDSkill(delta: number) {
    // 상흔 DOT 업데이트 (항상 독립)
    for (let i = this.groundScars.length - 1; i >= 0; i--) {
      const scar = this.groundScars[i]
      scar.age += delta
      scar.dotTimer += delta

      if (scar.dotTimer >= D_DOT_TICK) {
        scar.dotTimer -= D_DOT_TICK
        // 상흔 위의 적 피해
        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const ex = enemy.group.position.x, ez = enemy.group.position.z
            // 라인 위에 있는지 체크 (수직 거리)
            const toEx = ex - scar.originX, toEz = ez - scar.originZ
            const proj = toEx * scar.dirX + toEz * scar.dirZ
            if (proj < 0 || proj > scar.length) continue
            const perpX = toEx - scar.dirX * proj, perpZ = toEz - scar.dirZ * proj
            if (perpX * perpX + perpZ * perpZ <= (D_WIDTH * 0.7) * (D_WIDTH * 0.7))
              src.damageEnemy(enemy, D_DOT_DMG)
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const toEx = bpos.x - scar.originX, toEz = bpos.z - scar.originZ
            const proj = toEx * scar.dirX + toEz * scar.dirZ
            if (proj >= 0 && proj <= scar.length) {
              const perpX = toEx - scar.dirX * proj, perpZ = toEz - scar.dirZ * proj
              if (perpX * perpX + perpZ * perpZ <= (D_WIDTH * 0.7) * (D_WIDTH * 0.7))
                this.bossManager.takeDamage(D_DOT_DMG)
            }
          }
        }
      }

      // 시각 업데이트
      const mat = scar.mesh.material as THREE.MeshBasicMaterial
      const fade = 1 - scar.age / D_DOT_DUR
      mat.opacity = 0.4 * fade * (0.7 + 0.3 * Math.sin(scar.age * 8))
      scar.light.intensity = 3 * fade

      if (scar.age >= D_DOT_DUR) {
        this.scene.remove(scar.mesh); scar.mesh.geometry.dispose(); mat.dispose()
        this.scene.remove(scar.light); scar.light.dispose()
        this.groundScars.splice(i, 1)
      }
    }

    if (!this.dIsAttacking) {
      if (this.dCooldown > 0) {
        this.dCooldown = Math.max(0, this.dCooldown - delta)
        this.hud.updateSkillD(this.dCooldown, D_COOLDOWN)
      }
      return
    }

    this.dTimer += delta

    // 0.25초에 빔 발사 + 상흔 생성
    if (this.dFirePending && this.dTimer >= 0.25) {
      this.dFirePending = false
      const char = this.controller.character
      const dirY = char.rotation.y
      const fwdX = Math.sin(dirY), fwdZ = Math.cos(dirY)
      const ox = char.position.x, oz = char.position.z

      // 빔 이펙트
      this.fx.spawnHolyBeam(ox, oz, dirY, D_RANGE)
      this.audio.playSound(bangUrl, 0.85, 0.1)
      this.playerAnim.triggerHitStop(HITSTOP_D)
      this.hud.triggerScreenFlash('#ffdd44', 0.06)

      // 빔 비주얼 메시 (0.3초 후 페이드 — trailSparks로 충분하므로 간단 링만)
      this.fx.spawnRing(ox + fwdX * D_RANGE * 0.5, oz + fwdZ * D_RANGE * 0.5, 0xffdd44, D_WIDTH, 0.3)

      // 즉시 라인 판정
      for (const src of this.enemySources) {
        for (const enemy of src.enemies) {
          if (enemy.isDead) continue
          const ex = enemy.group.position.x - ox, ez = enemy.group.position.z - oz
          const proj = ex * fwdX + ez * fwdZ
          if (proj < 0 || proj > D_RANGE) continue
          const perpX = ex - fwdX * proj, perpZ = ez - fwdZ * proj
          if (perpX * perpX + perpZ * perpZ <= (D_WIDTH / 2) * (D_WIDTH / 2)) {
            src.damageEnemy(enemy, D_DMG)
          }
        }
      }
      if (this.bossManager?.isActive) {
        const bpos = this.bossManager.bossPosition
        if (bpos) {
          const ex = bpos.x - ox, ez = bpos.z - oz
          const proj = ex * fwdX + ez * fwdZ
          if (proj >= 0 && proj <= D_RANGE) {
            const perpX = ex - fwdX * proj, perpZ = ez - fwdZ * proj
            if (perpX * perpX + perpZ * perpZ <= (D_WIDTH / 2) * (D_WIDTH / 2))
              this.bossManager.takeDamage(D_DMG)
          }
        }
      }

      // 지면 상흔 생성
      const scarGeo = new THREE.PlaneGeometry(D_WIDTH * 0.8, D_RANGE)
      const scarMat = new THREE.MeshBasicMaterial({
        color: 0xffdd44, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      })
      const scarMesh = new THREE.Mesh(scarGeo, scarMat)
      scarMesh.frustumCulled = false
      scarMesh.rotation.x = -Math.PI / 2
      scarMesh.rotation.z = -dirY
      scarMesh.position.set(ox + fwdX * D_RANGE * 0.5, 0.05, oz + fwdZ * D_RANGE * 0.5)
      this.scene.add(scarMesh)

      const scarLight = new THREE.PointLight(0xffdd44, 3, D_RANGE)
      scarLight.position.set(ox + fwdX * D_RANGE * 0.5, 1, oz + fwdZ * D_RANGE * 0.5)
      this.scene.add(scarLight)

      this.groundScars.push({
        mesh: scarMesh, light: scarLight,
        originX: ox, originZ: oz, dirX: fwdX, dirZ: fwdZ, length: D_RANGE,
        age: 0, dotTimer: 0,
      })
    }

    if (this.dTimer >= this.playerAnim.eAttackDuration) {
      this.dIsAttacking = false
      this.dFirePending = false
      if (this.controller.isMoving && this.playerAnim.runAction)
        this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
      else if (this.playerAnim.idleAction)
        this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
      this.flushBuffer()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ F 스킬: 공중 폭격 10발
  // ══════════════════════════════════════════════════════════════════════
  startFAttack() {
    if (this.fCooldown > 0 || !this.playerAnim.qAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) { this.fBuffer = 0.15; return }

    const char = this.controller.character
    let targetX = char.position.x, targetZ = char.position.z
    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - char.position.x, dz = hit.z - char.position.z
      char.rotation.y = Math.atan2(dx, dz)
      targetX = hit.x; targetZ = hit.z
    } else {
      targetX = char.position.x + Math.sin(char.rotation.y) * 8
      targetZ = char.position.z + Math.cos(char.rotation.y) * 8
    }

    this.controller.moveTarget = null
    this.fIsAttacking = true
    this.fTimer       = 0
    this.fCooldown    = F_COOLDOWN
    this.hud.updateSkillF(this.fCooldown, F_COOLDOWN)

    // 폭격 위치 생성
    this.fPendingStrikes = []
    for (let i = 0; i < F_STRIKE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist  = Math.random() * F_AREA_RADIUS
      this.fPendingStrikes.push({
        x: targetX + Math.cos(angle) * dist,
        z: targetZ + Math.sin(angle) * dist,
        delay: 0.3 + i * F_STRIKE_INTERVAL,
        warned: false,
      })
    }

    this.playerAnim.switchAction(this.playerAnim.qAttackAction, 0.05)
    this.playerAnim.swapHandItems()
    this.audio.playSound(bangUrl, 0.7, 0.1)
  }

  private updateFSkill(delta: number) {
    // 폭격 착탄 (독립 타이머)
    for (let i = this.fPendingStrikes.length - 1; i >= 0; i--) {
      const strike = this.fPendingStrikes[i]
      strike.delay -= delta

      // 경고 링 (착탄 0.3초 전)
      if (!strike.warned && strike.delay <= 0.3) {
        strike.warned = true
        this.fx.spawnRing(strike.x, strike.z, 0xff2200, F_BLAST_RADIUS, 0.3)
      }

      if (strike.delay <= 0) {
        // 착탄!
        this.fx.spawnBombardmentStrike(strike.x, strike.z)
        this.audio.playSound(bangUrl, 0.6, 0.15)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - strike.x, dz = enemy.group.position.z - strike.z
            if (dx * dx + dz * dz <= F_BLAST_RADIUS * F_BLAST_RADIUS)
              src.damageEnemy(enemy, F_DMG)
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - strike.x, dz = bpos.z - strike.z
            if (dx * dx + dz * dz <= F_BLAST_RADIUS * F_BLAST_RADIUS)
              this.bossManager.takeDamage(F_DMG)
          }
        }
        this.fPendingStrikes.splice(i, 1)
      }
    }

    if (!this.fIsAttacking) {
      if (this.fCooldown > 0) {
        this.fCooldown = Math.max(0, this.fCooldown - delta)
        this.hud.updateSkillF(this.fCooldown, F_COOLDOWN)
      }
      return
    }

    this.fTimer += delta

    if (this.fTimer >= this.playerAnim.qAttackDuration) {
      this.fIsAttacking = false
      this.playerAnim.swapHandItems()
      if (this.controller.isMoving && this.playerAnim.runAction)
        this.playerAnim.switchAction(this.playerAnim.runAction, 0.15)
      else if (this.playerAnim.idleAction)
        this.playerAnim.switchAction(this.playerAnim.idleAction, 0.15)
      this.flushBuffer()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ T 스킬: 보이드 스톰 (궁극기)
  // ══════════════════════════════════════════════════════════════════════
  startTAttack() {
    if (this.tCooldown > 0 || !this.playerAnim.wAttackAction || !this.playerAnim.mesh) return
    if (this.anySkillActive) { this.tBuffer = 0.15; return }

    const char = this.controller.character
    this.controller.moveTarget = null
    this.tIsAttacking = true
    this.tTimer       = 0
    this.tCooldown    = T_COOLDOWN
    this.hud.updateSkillT(this.tCooldown, T_COOLDOWN)

    this.playerAnim.switchAction(this.playerAnim.wAttackAction, 0.05)
    this.playerAnim.setRightHandVisible(false)
    this.audio.playSound(bangUrl, 1.0, 0.05)

    // 보이드 구체는 채널링 후 생성
    this.voidStorm = null
    // 시전 위치 기억 (마우스 방향)
    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - char.position.x, dz = hit.z - char.position.z
      char.rotation.y = Math.atan2(dx, dz)
    }
  }

  private updateTSkill(delta: number) {
    // 보이드 스톰 업데이트 (독립)
    if (this.voidStorm) {
      const v = this.voidStorm
      v.age += delta
      v.dotTimer += delta

      const expandEnd = T_EXPAND_TIME
      const lingerEnd = expandEnd + T_LINGER_DUR

      if (v.age <= expandEnd) {
        // 팽창 단계
        const t = v.age / expandEnd
        v.currentRadius = t * T_RADIUS
        const s = Math.max(0.1, v.currentRadius)
        v.outerSphere.scale.setScalar(s)
        v.innerSphere.scale.setScalar(s * 0.85)
        v.light.intensity = 10 * t
      } else if (v.age <= lingerEnd) {
        // 지속 단계
        v.currentRadius = T_RADIUS
        v.outerSphere.scale.setScalar(T_RADIUS)
        v.innerSphere.scale.setScalar(T_RADIUS * 0.85)
        const linger = (v.age - expandEnd) / T_LINGER_DUR
        // 마지막 0.5초 페이드
        if (linger > 1 - 0.5 / T_LINGER_DUR) {
          const fade = (1 - linger) / (0.5 / T_LINGER_DUR)
          ;(v.outerSphere.material as THREE.MeshBasicMaterial).opacity = 0.3 * fade
          ;(v.innerSphere.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade
          v.light.intensity = 10 * fade
        }
      }

      // 초기 버스트 데미지
      if (!v.initialHit && v.age >= expandEnd * 0.5) {
        v.initialHit = true
        this.hud.triggerScreenFlash('#6600aa', 0.1)
        this.fx.spawnVoidExplosion(v.x, v.z)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = enemy.group.position.x - v.x, dz = enemy.group.position.z - v.z
            if (dx * dx + dz * dz <= T_RADIUS * T_RADIUS)
              src.damageEnemy(enemy, T_DMG)
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - v.x, dz = bpos.z - v.z
            if (dx * dx + dz * dz <= T_RADIUS * T_RADIUS)
              this.bossManager.takeDamage(T_DMG)
          }
        }
      }

      // DOT + 끌어당김
      if (v.age > expandEnd && v.dotTimer >= T_DOT_TICK) {
        v.dotTimer -= T_DOT_TICK
        this.fx.spawnVoidPulse(v.x, v.z, v.currentRadius)

        for (const src of this.enemySources) {
          for (const enemy of src.enemies) {
            if (enemy.isDead) continue
            const dx = v.x - enemy.group.position.x, dz = v.z - enemy.group.position.z
            const dist = Math.sqrt(dx * dx + dz * dz)
            if (dist < v.currentRadius && dist > 0.5) {
              src.damageEnemy(enemy, T_DOT_DMG)
              enemy.knockbackVel.set(dx / dist * T_PULL_FORCE, 0, dz / dist * T_PULL_FORCE)
            }
          }
        }
        if (this.bossManager?.isActive) {
          const bpos = this.bossManager.bossPosition
          if (bpos) {
            const dx = bpos.x - v.x, dz = bpos.z - v.z
            if (dx * dx + dz * dz < v.currentRadius * v.currentRadius)
              this.bossManager.takeDamage(T_DOT_DMG)
          }
        }
      }

      // 내부 구체 회전
      v.innerSphere.rotation.x += delta * 2
      v.innerSphere.rotation.y += delta * 3
      v.innerSphere.rotation.z += delta * 1.5

      // 소멸
      if (v.age >= lingerEnd) {
        this.scene.remove(v.outerSphere); v.outerSphere.geometry.dispose(); (v.outerSphere.material as THREE.Material).dispose()
        this.scene.remove(v.innerSphere); v.innerSphere.geometry.dispose(); (v.innerSphere.material as THREE.Material).dispose()
        this.scene.remove(v.light); v.light.dispose()
        this.voidStorm = null
      }
    }

    if (!this.tIsAttacking) {
      if (this.tCooldown > 0) {
        this.tCooldown = Math.max(0, this.tCooldown - delta)
        this.hud.updateSkillT(this.tCooldown, T_COOLDOWN)
      }
      return
    }

    this.tTimer += delta

    // 채널링 동안 상승
    if (this.tTimer < T_CHANNEL_TIME) {
      this.controller.character.position.y = (this.tTimer / T_CHANNEL_TIME) * 2
      return
    }

    // 슬램 + 보이드 구체 생성
    if (!this.voidStorm && this.tTimer >= T_CHANNEL_TIME) {
      this.controller.character.position.y = 0
      const char = this.controller.character
      const cx = char.position.x, cz = char.position.z

      const outerGeo = new THREE.SphereGeometry(1, 32, 32)
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x220044, transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false,
      })
      const outerSphere = new THREE.Mesh(outerGeo, outerMat)
      outerSphere.frustumCulled = false
      outerSphere.position.set(cx, 2, cz)
      outerSphere.scale.setScalar(0.1)
      this.scene.add(outerSphere)

      const innerGeo = new THREE.SphereGeometry(1, 16, 16)
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x8800ff, transparent: true, opacity: 0.5, wireframe: true, depthWrite: false,
      })
      const innerSphere = new THREE.Mesh(innerGeo, innerMat)
      innerSphere.frustumCulled = false
      innerSphere.position.set(cx, 2, cz)
      innerSphere.scale.setScalar(0.1)
      this.scene.add(innerSphere)

      const light = new THREE.PointLight(0x8800ff, 1, 25)
      light.position.set(cx, 3, cz)
      this.scene.add(light)

      this.voidStorm = {
        outerSphere, innerSphere, light,
        x: cx, z: cz, age: 0, dotTimer: 0,
        initialHit: false, currentRadius: 0.1,
      }

      this.fx.screenShakeTimer = Math.max(this.fx.screenShakeTimer, 1.0)
      this.playerAnim.triggerHitStop(HITSTOP_T)
    }

    // 애니메이션 종료 (W 모션과 비슷한 타이밍 사용)
    const tAnimDur = Math.max(T_CHANNEL_TIME + 0.5, this.playerAnim.wAttackDuration || 2.0)
    if (this.tTimer >= tAnimDur) {
      this.tIsAttacking = false
      this.controller.character.position.y = 0
      this.playerAnim.setRightHandVisible(true)
      if (this.controller.isMoving && this.playerAnim.runAction)
        this.playerAnim.switchAction(this.playerAnim.runAction, 0.1)
      else if (this.playerAnim.idleAction)
        this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
      this.flushBuffer()
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ██ 프로젝타일 정리 (스테이지 전환용)
  // ══════════════════════════════════════════════════════════════════════
  clearProjectiles() {
    this.clearMissiles()
    if (this.grenade) {
      this.scene.remove(this.grenade.mesh); this.grenade.mesh.geometry.dispose(); (this.grenade.mesh.material as THREE.Material).dispose()
      this.scene.remove(this.grenade.light); this.grenade.light.dispose()
      this.grenade = null
    }
    if (this.energyBlade) {
      this.scene.remove(this.energyBlade.mesh); this.energyBlade.mesh.geometry.dispose(); (this.energyBlade.mesh.material as THREE.Material).dispose()
      this.scene.remove(this.energyBlade.light); this.energyBlade.light.dispose()
      this.energyBlade = null
    }
    for (const scar of this.groundScars) {
      this.scene.remove(scar.mesh); scar.mesh.geometry.dispose(); (scar.mesh.material as THREE.Material).dispose()
      this.scene.remove(scar.light); scar.light.dispose()
    }
    this.groundScars = []
    this.fPendingStrikes = []
    if (this.voidStorm) {
      this.scene.remove(this.voidStorm.outerSphere); this.voidStorm.outerSphere.geometry.dispose(); (this.voidStorm.outerSphere.material as THREE.Material).dispose()
      this.scene.remove(this.voidStorm.innerSphere); this.voidStorm.innerSphere.geometry.dispose(); (this.voidStorm.innerSphere.material as THREE.Material).dispose()
      this.scene.remove(this.voidStorm.light); this.voidStorm.light.dispose()
      this.voidStorm = null
    }
  }

  // ── 미사일 정리 (스테이지 전환 등) ──────────────────────────────────
  clearMissiles() {
    for (const m of this.missiles) {
      this.scene.remove(m.mesh)
      ;(m.mesh.material as THREE.Material).dispose()
      this.scene.remove(m.light)
      m.light.dispose()
    }
    this.missiles = []
  }
}
