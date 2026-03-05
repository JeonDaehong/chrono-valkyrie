import * as THREE from 'three'

const PORTAL_COLOR = 0x00ffcc
const PORTAL_RADIUS = 1.2
const COLLISION_DIST = 2.0

// ── 공유 지오메트리 (GPU 업로드 1회) ─────────────────────────────────────
const sharedTorusGeo    = new THREE.TorusGeometry(PORTAL_RADIUS, 0.12, 16, 48)
const sharedBeamGeo     = new THREE.CylinderGeometry(PORTAL_RADIUS * 0.8, PORTAL_RADIUS * 0.8, 3.5, 24, 1, true)
const sharedParticleGeo = new THREE.SphereGeometry(0.08, 6, 6)

export class Portal {
  group = new THREE.Group()
  active = false
  private torus: THREE.Mesh
  private beam: THREE.Mesh
  private light: THREE.PointLight
  private particles: THREE.Mesh[] = []
  private age = 0

  constructor(
    private scene: THREE.Scene,
    x: number, z: number,
  ) {
    // 링 (Torus) — 공유 geometry
    const torusMat = new THREE.MeshBasicMaterial({ color: PORTAL_COLOR, transparent: true, opacity: 0.9 })
    this.torus = new THREE.Mesh(sharedTorusGeo, torusMat)
    this.torus.rotation.x = Math.PI / 2  // 수평 → 수직
    this.group.add(this.torus)

    // 빔 (반투명 실린더) — 공유 geometry
    const beamMat = new THREE.MeshBasicMaterial({
      color: PORTAL_COLOR, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide,
    })
    this.beam = new THREE.Mesh(sharedBeamGeo, beamMat)
    this.beam.position.y = 1.75
    this.group.add(this.beam)

    // 포인트 라이트
    this.light = new THREE.PointLight(PORTAL_COLOR, 0, 15)
    this.light.position.y = 1.5
    this.group.add(this.light)

    // 떠다니는 파티클 구체 (6개) — 공유 geometry
    const particleMat = new THREE.MeshBasicMaterial({ color: PORTAL_COLOR, transparent: true, opacity: 0.7 })
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(sharedParticleGeo, particleMat)
      const angle = (i / 6) * Math.PI * 2
      p.position.set(Math.cos(angle) * PORTAL_RADIUS * 0.6, 0.5 + i * 0.4, Math.sin(angle) * PORTAL_RADIUS * 0.6)
      this.group.add(p)
      this.particles.push(p)
    }

    this.group.position.set(x, 0, z)
    this.group.visible = false
    this.scene.add(this.group)
  }

  activate() {
    this.active = true
    this.group.visible = true
    this.light.intensity = 8
    this.age = 0
  }

  update(delta: number) {
    if (!this.active) return
    this.age += delta

    // 토러스 천천히 회전
    this.torus.rotation.z += delta * 1.5

    // 라이트 펄스
    this.light.intensity = 6 + Math.sin(this.age * 3) * 2

    // 빔 투명도 펄스
    ;(this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(this.age * 2) * 0.05

    // 파티클 떠다니기
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      const baseAngle = (i / this.particles.length) * Math.PI * 2 + this.age * 0.8
      p.position.x = Math.cos(baseAngle) * PORTAL_RADIUS * 0.6
      p.position.z = Math.sin(baseAngle) * PORTAL_RADIUS * 0.6
      p.position.y = 0.5 + ((this.age * 0.5 + i * 0.3) % 3)
    }
  }

  checkCollision(playerPos: THREE.Vector3): boolean {
    if (!this.active) return false
    const dx = playerPos.x - this.group.position.x
    const dz = playerPos.z - this.group.position.z
    return dx * dx + dz * dz < COLLISION_DIST * COLLISION_DIST
  }

  dispose() {
    this.scene.remove(this.group)
    this.active = false

    // 공유 geometry는 dispose 하지 않음 — material만 dispose
    ;(this.torus.material as THREE.Material).dispose()
    ;(this.beam.material as THREE.Material).dispose()
    if (this.particles.length > 0)
      (this.particles[0].material as THREE.Material).dispose()
  }
}
