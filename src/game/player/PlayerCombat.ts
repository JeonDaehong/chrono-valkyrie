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
  HITSTOP_Q, HITSTOP_W, HITSTOP_E, HITSTOP_R,
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
  private rFirePending = false
  private missiles: MissileInstance[] = []
  private missileGeo: THREE.SphereGeometry | null = null

  // ── 스킬 입력 버퍼 (0.15초 이내 선입력 허용) ─────────────────────
  private qBuffer = 0
  private wBuffer = 0
  private eBuffer = 0
  private rBuffer = 0
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
    if (this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking || this.rIsAttacking || this.isShielding) {
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
    if (this.qIsAttacking || this.isAttacking || this.wIsAttacking || this.eIsAttacking || this.rIsAttacking || this.isShielding) {
      this.qBuffer = 0.15   // 선입력 저장
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
    if (this.wIsAttacking || this.isAttacking || this.qIsAttacking || this.eIsAttacking || this.rIsAttacking || this.isShielding) {
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
    if (this.eIsAttacking || this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.rIsAttacking || this.isShielding) {
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
    if (this.rIsAttacking || this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking || this.isShielding) {
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
    this.rFirePending = true
    this.rCooldown    = R_COOLDOWN

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
    if (this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking || this.rIsAttacking) return
    this.isShielding = true

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

  // ── 버퍼 플러시: 스킬 종료 직후 선입력 소비 ────────────────────────
  private flushBuffer() {
    if (this.wBuffer > 0) { this.wBuffer = 0; this.startWAttack(); return }
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

      if (this.rFirePending && this.rTimer >= 0.2) {
        this.rFirePending = false
        this.spawnMissiles()
      }

      if (this.rTimer >= this.playerAnim.qAttackDuration) {
        this.rIsAttacking = false
        this.rFirePending = false
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
