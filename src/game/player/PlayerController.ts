import * as THREE from 'three'
import type { PlayerAnimation } from './PlayerAnimation'
import type { EffectSystem } from '../fx/EffectSystem'
import type { HUD } from '../ui/HUD'
import { MOVE_SPEED, BOUNDARY, BLINK_MAX, BLINK_RECHARGE, BLINK_DIST } from '../shared/constants'

export class PlayerController {
  mouse      = new THREE.Vector2()
  moveTarget: THREE.Vector3 | null = null
  isMoving   = false

  isRightMouseDown      = false
  attackRightClickBlock = 0
  stunTimer             = 0
  knockbackVel          = new THREE.Vector3()   // 피격 넉백

  blinkCharges       = BLINK_MAX
  private blinkRechargeTimer = 0

  private raycaster    = new THREE.Raycaster()
  private groundPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private groundHit    = new THREE.Vector3()

  constructor(
    private playerAnim: PlayerAnimation,
    private camera:     THREE.Camera,
    private fx:         EffectSystem,
    private hud:        HUD,
  ) {}

  get character() { return this.playerAnim.character }

  /** 마우스 좌표 기준 지면 교차점 반환 (없으면 null) */
  getGroundHit(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    return this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit)
      ? this.groundHit
      : null
  }

  tryBlink() {
    if (this.blinkCharges <= 0 || this.stunTimer > 0) return
    const hit = this.getGroundHit()
    if (!hit) return

    const cx = this.character.position.x, cz = this.character.position.z
    const dx = hit.x - cx, dz = hit.z - cz
    const dist  = Math.sqrt(dx * dx + dz * dz)
    const ratio = dist > BLINK_DIST ? BLINK_DIST / dist : 1
    const tx = cx + dx * ratio, tz = cz + dz * ratio

    this.fx.spawnBlink(cx, cz)
    this.character.position.x = tx
    this.character.position.z = tz
    this.fx.spawnBlink(tx, tz)

    this.blinkCharges--
    if (this.blinkCharges < BLINK_MAX) this.blinkRechargeTimer = 0
    this.hud.updateBlink(this.blinkCharges)
  }

  /** 피격 넉백 적용 */
  applyKnockback(dir: THREE.Vector3, force: number) {
    this.knockbackVel.set(dir.x * force, 0, dir.z * force)
  }

  update(delta: number, qIsAttacking: boolean, qFiredDirY: number, isShielding = false, skillLocking = false) {
    // 넉백 — 스턴 중에도 적용
    if (this.knockbackVel.lengthSq() > 0.01) {
      this.character.position.addScaledVector(this.knockbackVel, delta)
      this.knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 9))
      // 경계 클램프
      const B = BOUNDARY
      this.character.position.x = Math.max(-B, Math.min(B, this.character.position.x))
      this.character.position.z = Math.max(-B, Math.min(B, this.character.position.z))
    }

    // 기절 — 이동 차단
    if (this.stunTimer > 0) {
      this.stunTimer -= delta
      this.moveTarget = null
      this.isMoving   = false
      return
    }
    if (this.attackRightClickBlock > 0) this.attackRightClickBlock -= delta

    if (this.moveTarget && !qIsAttacking && !skillLocking) {
      const dx   = this.moveTarget.x - this.character.position.x
      const dz   = this.moveTarget.z - this.character.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 0.2) {
        this.moveTarget = null
      } else {
        this.character.position.x += (dx / dist) * MOVE_SPEED * delta
        this.character.position.z += (dz / dist) * MOVE_SPEED * delta
        this.character.rotation.y = Math.atan2(dx / dist, dz / dist)
      }
    } else if (qIsAttacking) {
      this.character.rotation.y = qFiredDirY
    } else if (!isShielding) {
      // 방패 중에는 마우스로 방향 회전 차단
      const hit = this.getGroundHit()
      if (hit) {
        const dx = hit.x - this.character.position.x
        const dz = hit.z - this.character.position.z
        this.character.rotation.y = Math.atan2(dx, dz)
      }
    }

    // 맵 경계 클램프
    const B = BOUNDARY
    this.character.position.x = Math.max(-B, Math.min(B, this.character.position.x))
    this.character.position.z = Math.max(-B, Math.min(B, this.character.position.z))

    this.isMoving = this.moveTarget !== null

    // 점멸 충전
    if (this.blinkCharges < BLINK_MAX) {
      this.blinkRechargeTimer += delta
      if (this.blinkRechargeTimer >= BLINK_RECHARGE) {
        this.blinkCharges++
        this.blinkRechargeTimer = 0
        this.hud.updateBlink(this.blinkCharges)
      } else {
        this.hud.updateBlink(this.blinkCharges, this.blinkRechargeTimer / BLINK_RECHARGE)
      }
    }
  }
}
