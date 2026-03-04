import * as THREE from 'three'
import type { PlayerAnimation } from './PlayerAnimation'
import type { EffectSystem } from '../fx/EffectSystem'
import type { HUD } from '../ui/HUD'
import { MOVE_SPEED, BOUNDARY, BLINK_MAX, BLINK_RECHARGE, BLINK_DIST } from '../shared/constants'
import { clampToZones, type WalkableZone } from '../stage/StageConfig'

export class PlayerController {
  mouse      = new THREE.Vector2()
  moveTarget: THREE.Vector3 | null = null
  isMoving   = false

  isRightMouseDown      = false
  attackRightClickBlock = 0
  stunTimer             = 0
  knockbackVel          = new THREE.Vector3()   // 피격 넉백

  // ── 입력 모드 ───────────────────────────────────────────────────────
  inputMode: 'mouse' | 'keyboard' = (localStorage.getItem('inputMode') as 'mouse' | 'keyboard') || 'mouse'
  private dirInput = { x: 0, z: 0 }

  blinkCharges       = BLINK_MAX
  private blinkRechargeTimer = 0
  private _boundary  = BOUNDARY
  private _zones: WalkableZone[] | null = null

  private raycaster    = new THREE.Raycaster()
  private groundPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private groundHit    = new THREE.Vector3()

  setBoundary(b: number) { this._boundary = b }
  setWalkableZones(zones: WalkableZone[]) { this._zones = zones }

  setDirectionInput(dx: number, dz: number) { this.dirInput.x = dx; this.dirInput.z = dz }
  toggleInputMode() {
    this.inputMode = this.inputMode === 'mouse' ? 'keyboard' : 'mouse'
    localStorage.setItem('inputMode', this.inputMode)
    this.moveTarget = null
    this.dirInput.x = 0; this.dirInput.z = 0
  }

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
    let tx = cx + dx * ratio, tz = cz + dz * ratio

    // 블링크 도착점도 워커블 존 클램프
    if (this._zones) [tx, tz] = clampToZones(tx, tz, this._zones)

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

  /** 워커블 존 클램프 적용 */
  private clampPosition() {
    if (this._zones) {
      const [cx, cz] = clampToZones(
        this.character.position.x,
        this.character.position.z,
        this._zones,
      )
      this.character.position.x = cx
      this.character.position.z = cz
    } else {
      const B = this._boundary
      this.character.position.x = Math.max(-B, Math.min(B, this.character.position.x))
      this.character.position.z = Math.max(-B, Math.min(B, this.character.position.z))
    }
  }

  update(delta: number, qIsAttacking: boolean, qFiredDirY: number, isShielding = false, skillLocking = false) {
    // 넉백 — 스턴 중에도 적용
    if (this.knockbackVel.lengthSq() > 0.01) {
      this.character.position.addScaledVector(this.knockbackVel, delta)
      this.knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 9))
      this.clampPosition()
    }

    // 기절 — 이동 차단
    if (this.stunTimer > 0) {
      this.stunTimer -= delta
      this.moveTarget = null
      this.isMoving   = false
      return
    }
    if (this.attackRightClickBlock > 0) this.attackRightClickBlock -= delta

    // ── 키보드 모드: 방향키 이동 ────────────────────────────────────────
    if (this.inputMode === 'keyboard' && !qIsAttacking && !skillLocking && !isShielding) {
      const { x: dix, z: diz } = this.dirInput
      if (dix !== 0 || diz !== 0) {
        const len = Math.sqrt(dix * dix + diz * diz)
        this.character.position.x += (dix / len) * MOVE_SPEED * delta
        this.character.position.z += (diz / len) * MOVE_SPEED * delta
        this.character.rotation.y = Math.atan2(dix / len, diz / len)
      }
    }

    // ── 마우스 모드: 클릭-투-무브 ─────────────────────────────────────
    if (this.moveTarget && !qIsAttacking && !skillLocking && !isShielding) {
      const dx   = this.moveTarget.x - this.character.position.x
      const dz   = this.moveTarget.z - this.character.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      const ARRIVAL_ZONE = 1.5
      const MIN_STOP = 0.12
      if (dist < MIN_STOP) {
        this.moveTarget = null
      } else {
        const speedFactor = dist < ARRIVAL_ZONE
          ? 0.25 + 0.75 * ((dist - MIN_STOP) / (ARRIVAL_ZONE - MIN_STOP))
          : 1.0
        this.character.position.x += (dx / dist) * MOVE_SPEED * speedFactor * delta
        this.character.position.z += (dz / dist) * MOVE_SPEED * speedFactor * delta
        this.character.rotation.y = Math.atan2(dx / dist, dz / dist)
      }
    } else if (qIsAttacking) {
      this.character.rotation.y = qFiredDirY
    } else if (!isShielding && this.inputMode === 'mouse') {
      // 마우스 모드에서만 마우스 방향 추적 (키보드 모드는 이동 방향으로 회전)
      const hit = this.getGroundHit()
      if (hit) {
        const dx = hit.x - this.character.position.x
        const dz = hit.z - this.character.position.z
        this.character.rotation.y = Math.atan2(dx, dz)
      }
    }

    // 맵 경계 클램프
    this.clampPosition()

    // 키보드 모드에서는 방향 입력이 있으면 이동 중
    const keyboardMoving = this.inputMode === 'keyboard' && (this.dirInput.x !== 0 || this.dirInput.z !== 0)
    this.isMoving = this.moveTarget !== null || keyboardMoving

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
