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
  PLAYER_ATTACK_RANGE, PLAYER_ATTACK_DMG,
  Q_COOLDOWN, Q_ATTACK_RANGE, Q_CONE_ANGLE, Q_ATTACK_DMG, Q_KNOCKBACK_FORCE,
  W_COOLDOWN, W_DMG, W_DMG2, W_RANGE, BLINK_DIST,
  E_COOLDOWN, E_DMG, E_RANGE, E_KNOCKBACK,
  SHIELD_COOLDOWN,
} from '../shared/constants'

export class PlayerCombat {
  isAttacking  = false
  attackTimer  = 0

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
  private wFirePending2 = false
  private wJumpY        = 0
  private wSlamX        = 0   // 1타 착지 위치 저장
  private wSlamZ        = 0

  // ── E 스킬: 전기 폭발 ──────────────────────────────────────────────
  eIsAttacking   = false
  private eTimer        = 0
  eCooldown      = 0
  private eFirePending  = false

  // ── Ctrl 방패 ──────────────────────────────────────────────────────
  isShielding    = false
  shieldCooldown = 0
  private shieldMesh: THREE.Mesh | null = null

  // ── 스킬 입력 버퍼 (0.15초 이내 선입력 허용) ─────────────────────
  private qBuffer = 0
  private wBuffer = 0
  private eBuffer = 0

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
  ) {}

  // ── 기본 공격 ──────────────────────────────────────────────────────
  startAttack() {
    if (!this.playerAnim.mesh || !this.playerAnim.attackAction || this.isAttacking || this.qIsAttacking
        || this.wIsAttacking || this.eIsAttacking || this.isShielding) return

    const hit = this.controller.getGroundHit()
    if (hit) {
      const dx = hit.x - this.controller.character.position.x
      const dz = hit.z - this.controller.character.position.z
      this.controller.character.rotation.y = Math.atan2(dx, dz)
    }

    this.controller.moveTarget = null
    this.isAttacking = true
    this.attackTimer = 0
    this.controller.attackRightClickBlock = 0.2

    this.playerAnim.switchAction(this.playerAnim.attackAction, 0.05)
    this.audio.playSound(slashUrl, 0.7)

    const char  = this.controller.character
    const fwdX  = Math.sin(char.rotation.y)
    const fwdZ  = Math.cos(char.rotation.y)
    const effectPos = new THREE.Vector3(char.position.x + fwdX * 2.0, char.position.y, char.position.z + fwdZ * 2.0)
    this.fx.spawnAttack(effectPos, char.rotation.y)

    for (const src of this.enemySources) {
      for (const enemy of src.enemies) {
        if (enemy.isDead) continue
        const dx   = enemy.group.position.x - char.position.x
        const dz   = enemy.group.position.z - char.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= PLAYER_ATTACK_RANGE && dist > 0) {
          const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ
          if (dot >= 0.35) src.damageEnemy(enemy, PLAYER_ATTACK_DMG)
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
          if (dot >= 0.35) this.bossManager.takeDamage(PLAYER_ATTACK_DMG)
        }
      }
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
    if (this.qIsAttacking || this.isAttacking || this.wIsAttacking || this.eIsAttacking || this.isShielding) {
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
    if (this.wIsAttacking || this.isAttacking || this.qIsAttacking || this.eIsAttacking || this.isShielding) {
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
    this.wFirePending2 = true
    this.wJumpY        = 0
    this.wCooldown     = W_COOLDOWN

    this.hud.updateSkillW(this.wCooldown, W_COOLDOWN)
    this.playerAnim.switchAction(this.playerAnim.wAttackAction, 0.05)
    this.playerAnim.setRightHandVisible(false)
  }

  // ── E 스킬: 전기 폭발 ──────────────────────────────────────────────
  startEAttack() {
    if (this.eCooldown > 0 || !this.playerAnim.eAttackAction || !this.playerAnim.mesh) return
    if (this.eIsAttacking || this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.isShielding) {
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

  // ── Ctrl 방패 활성/비활성 ──────────────────────────────────────────
  activateShield() {
    if (this.shieldCooldown > 0 || this.isShielding) return
    if (this.isAttacking || this.qIsAttacking || this.wIsAttacking || this.eIsAttacking) return
    this.isShielding = true

    const geo = new THREE.RingGeometry(0.85, 1.25, 36)
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    this.shieldMesh = new THREE.Mesh(geo, mat)
    this.shieldMesh.rotation.x = -Math.PI / 2
    this.shieldMesh.frustumCulled = false
    this.scene.add(this.shieldMesh)
  }

  deactivateShield() {
    if (!this.isShielding) return
    this.isShielding = false
    if (this.shieldMesh) {
      this.scene.remove(this.shieldMesh)
      this.shieldMesh = null
    }
    this.shieldCooldown = SHIELD_COOLDOWN
    this.hud.updateSkillCtrl(this.shieldCooldown, SHIELD_COOLDOWN)
  }

  // ── 버퍼 플러시: 스킬 종료 직후 선입력 소비 ────────────────────────
  private flushBuffer() {
    if (this.wBuffer > 0) { this.wBuffer = 0; this.startWAttack(); return }
    if (this.eBuffer > 0) { this.eBuffer = 0; this.startEAttack(); return }
    if (this.qBuffer > 0) { this.qBuffer = 0; this.startQAttack() }
  }

  // ── 메인 업데이트 ──────────────────────────────────────────────────
  update(delta: number) {
    // 버퍼 타이머 감소
    if (this.qBuffer > 0) this.qBuffer = Math.max(0, this.qBuffer - delta)
    if (this.wBuffer > 0) this.wBuffer = Math.max(0, this.wBuffer - delta)
    if (this.eBuffer > 0) this.eBuffer = Math.max(0, this.eBuffer - delta)

    // 기본 공격 종료
    if (this.isAttacking) {
      this.attackTimer += delta
      if (this.attackTimer >= this.playerAnim.attackDuration) {
        this.isAttacking = false
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
        this.audio.playSound(bangUrl, 0.8)

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

      // 착지 1타: AoE 데미지 + 위치 저장 + 이동 잠금 해제
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
        this.audio.playSound(bangUrl, 0.9)

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
      }

      // 착지 2타: 마법 폭발 (착지 위치에서 1.0s 후)
      if (this.wFirePending2 && this.wTimer >= SLAM + 1.0) {
        this.wFirePending2 = false
        this.fx.screenShakeTimer = 0.6
        this.fx.spawnWExplosion(this.wSlamX, this.wSlamZ)
        this.audio.playSound(bangUrl, 0.85)

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

      if (this.wTimer >= Math.max(this.playerAnim.wAttackDuration, SLAM + 1.3)) {
        this.wIsAttacking  = false
        this.wMoveLocked   = false
        this.wFirePending1 = false
        this.wFirePending2 = false
        this.controller.character.position.y = 0
        this.playerAnim.setRightHandVisible(true)
        if (this.controller.isMoving && this.playerAnim.runAction)
          this.playerAnim.switchAction(this.playerAnim.runAction, 0.1)
        else if (this.playerAnim.idleAction)
          this.playerAnim.switchAction(this.playerAnim.idleAction, 0.1)
        this.flushBuffer()
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
        this.audio.playSound(bangUrl, 0.9)

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

    // ── 방패 업데이트 ─────────────────────────────────────────────────
    if (this.isShielding && this.shieldMesh) {
      const char = this.controller.character
      this.shieldMesh.position.set(char.position.x, 0.08, char.position.z)
      const mat = this.shieldMesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.5 + 0.3 * Math.abs(Math.sin(Date.now() * 0.004))
    }

    if (this.shieldCooldown > 0) {
      this.shieldCooldown = Math.max(0, this.shieldCooldown - delta)
      this.hud.updateSkillCtrl(this.shieldCooldown, SHIELD_COOLDOWN)
    }
  }
}
