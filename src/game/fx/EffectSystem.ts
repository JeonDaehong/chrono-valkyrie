import * as THREE from 'three'
import type { Fx, SlashFx, RingFx, FlameFx } from '../shared/types'
import { Q_CONE_ANGLE } from '../shared/constants'

const SPARK_POOL_SIZE = 400
const LIGHT_POOL_SIZE = 16
const SLASH_POOL_SIZE = 12
const RING_POOL_SIZE  = 28
const FLAME_POOL_SIZE = 16
const SWING_POOL_SIZE = 6

interface SparkEntry { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; inUse: boolean }

export class EffectSystem {
  screenShakeTimer = 0

  private blinkEffects: Fx[] = []
  private elecFxList:   Fx[] = []
  private hitFxList:    Fx[] = []
  private slashFxList:  SlashFx[] = []
  private ringFxList:   RingFx[]  = []
  private flameFxList:  FlameFx[] = []

  // ── 파이어볼 꼬리 스파크 (라이트 풀 미사용) ──────────────────────────
  private trailSparks: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vel: THREE.Vector3; age: number; dur: number }[] = []

  // ── 무기 스윙 트레일 (풀) ───────────────────────────────────────────
  private swingTrails: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; dur: number; poolIdx: number }[] = []
  private swingPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; inUse: boolean }[] = []
  private swingFree: number[] = []
  private swingGeos: THREE.TorusGeometry[] = []

  private smallGeo       = new THREE.SphereGeometry(0.06, 4, 4)
  private slashArcGeo    = new THREE.TorusGeometry(1, 0.07, 6, 28, Math.PI * 0.75)
  private groundRingGeo  = new THREE.RingGeometry(0.85, 1.0, 36)
  private flameTongueGeo = new THREE.PlaneGeometry(1.0, 3.5)

  // ── 스파크 풀 ────────────────────────────────────────────────────────
  private sparkPool:  SparkEntry[] = []
  private freeSparks: number[]     = []

  // ── PointLight 풀 (고정 크기 → NUM_POINT_LIGHTS 불변 → 셰이더 재컴파일 없음) ──
  private lightPool:  THREE.PointLight[] = []
  private freeLights: number[]           = []

  // ── 슬래시·링·불꽃 메시 풀 (scene.add/remove 제거 → GC 없음) ───────────
  private slashPool:   THREE.Mesh[] = []
  private freeSlashes: number[]     = []

  private ringPool:  THREE.Mesh[] = []
  private freeRings: number[]     = []

  private flamePool:  THREE.Mesh[] = []
  private freeFlames: number[]     = []

  constructor(private scene: THREE.Scene) {
    this.initSparkPool()
    this.initLightPool()
    this.initMeshPools()
    this.initSwingTrailPool()
    this.prewarmShaders()
  }

  // ── 스파크 풀 ─────────────────────────────────────────────────────────
  private initSparkPool() {
    // 단일면 MeshBasicMaterial 셰이더 프리컴파일용 가시 더미
    const warmSpark = new THREE.Mesh(
      this.smallGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    )
    warmSpark.frustumCulled = false
    warmSpark.position.y    = -9999
    this.scene.add(warmSpark)

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
      const mesh = new THREE.Mesh(this.smallGeo, mat)
      mesh.visible            = false
      mesh.frustumCulled      = false
      mesh.userData.poolIndex = i
      this.scene.add(mesh)
      this.sparkPool.push({ mesh, mat, inUse: false })
      this.freeSparks.push(i)
    }
  }

  // ── PointLight 풀 ─────────────────────────────────────────────────────
  private initLightPool() {
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 22)
      light.position.set(0, -9999, 0)
      light.userData.poolIndex = i
      light.userData.released  = true
      this.scene.add(light)
      this.lightPool.push(light)
      this.freeLights.push(i)
    }
  }

  // ── 메시 풀 (Slash / Ring / Flame) ─────────────────────────────────────
  private initMeshPools() {
    const baseMat = () => new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    })

    for (let i = 0; i < SLASH_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.slashArcGeo, baseMat())
      mesh.visible            = false
      mesh.frustumCulled      = false
      mesh.position.y         = -9999
      mesh.userData.poolIndex = i
      this.scene.add(mesh)
      this.slashPool.push(mesh)
      this.freeSlashes.push(i)
    }

    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.groundRingGeo, baseMat())
      mesh.rotation.x         = -Math.PI / 2
      mesh.visible            = false
      mesh.frustumCulled      = false
      mesh.position.y         = -9999
      mesh.userData.poolIndex = i
      this.scene.add(mesh)
      this.ringPool.push(mesh)
      this.freeRings.push(i)
    }

    for (let i = 0; i < FLAME_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.flameTongueGeo, baseMat())
      mesh.visible            = false
      mesh.frustumCulled      = false
      mesh.position.y         = -9999
      mesh.userData.poolIndex = i
      this.scene.add(mesh)
      this.flamePool.push(mesh)
      this.freeFlames.push(i)
    }
  }

  // ── 스윙 트레일 풀 (콤보 단계별 geometry 미리 생성) ─────────────────
  private initSwingTrailPool() {
    for (let step = 0; step < 3; step++) {
      this.swingGeos.push(new THREE.TorusGeometry(
        1.6 + step * 0.3, 0.12 - step * 0.01, 4, 24, Math.PI * 0.9,
      ))
    }
    for (let i = 0; i < SWING_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      })
      const mesh = new THREE.Mesh(this.swingGeos[0], mat)
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.position.y = -9999
      this.scene.add(mesh)
      this.swingPool.push({ mesh, mat, inUse: false })
      this.swingFree.push(i)
    }
  }

  // ── DoubleSide 셰이더 변종 미리 컴파일 ────────────────────────────────
  private prewarmShaders() {
    const warmMat = new THREE.MeshBasicMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0,
    })
    for (const geo of [this.slashArcGeo, this.groundRingGeo, this.flameTongueGeo]) {
      const m = new THREE.Mesh(geo, warmMat.clone())
      m.frustumCulled = false
      m.position.y    = -9999
      this.scene.add(m)
    }
  }

  // ── acquireLight / releaseLight ───────────────────────────────────────
  private acquireLight(
    color: number, intensity: number, distance: number,
    x: number, y: number, z: number,
  ): THREE.PointLight | null {
    if (this.freeLights.length === 0) return null
    const idx   = this.freeLights.pop()!
    const light = this.lightPool[idx]
    light.color.setHex(color)
    light.intensity          = intensity
    light.distance           = distance
    light.position.set(x, y, z)
    light.userData.released  = false
    return light
  }

  private releaseLight(light: THREE.PointLight) {
    if (light.userData.released) return
    const idx = light.userData.poolIndex as number
    light.intensity         = 0
    light.position.set(0, -9999, 0)
    light.userData.released = true
    this.freeLights.push(idx)
  }

  // ── acquireSlash / releaseSlash ───────────────────────────────────────
  private acquireSlash(color: number): THREE.Mesh | null {
    if (this.freeSlashes.length === 0) return null
    const mesh = this.slashPool[this.freeSlashes.pop()!]
    const mat  = mesh.material as THREE.MeshBasicMaterial
    mat.color.setHex(color)
    mat.opacity  = 1.0
    mesh.visible = true
    return mesh
  }

  private releaseSlash(mesh: THREE.Mesh) {
    mesh.visible    = false
    mesh.position.y = -9999
    this.freeSlashes.push(mesh.userData.poolIndex as number)
  }

  // ── acquireRing / releaseRing ─────────────────────────────────────────
  private acquireRing(color: number): THREE.Mesh | null {
    if (this.freeRings.length === 0) return null
    const mesh = this.ringPool[this.freeRings.pop()!]
    const mat  = mesh.material as THREE.MeshBasicMaterial
    mat.color.setHex(color)
    mat.opacity  = 0.9
    mesh.visible = true
    return mesh
  }

  private releaseRing(mesh: THREE.Mesh) {
    mesh.visible    = false
    mesh.position.y = -9999
    this.freeRings.push(mesh.userData.poolIndex as number)
  }

  // ── acquireFlame / releaseFlame ───────────────────────────────────────
  private acquireFlame(color: number): THREE.Mesh | null {
    if (this.freeFlames.length === 0) return null
    const mesh = this.flamePool[this.freeFlames.pop()!]
    const mat  = mesh.material as THREE.MeshBasicMaterial
    mat.color.setHex(color)
    mat.opacity  = 0.92
    mesh.visible = true
    return mesh
  }

  private releaseFlame(mesh: THREE.Mesh) {
    mesh.visible    = false
    mesh.position.y = -9999
    this.freeFlames.push(mesh.userData.poolIndex as number)
  }

  // ── 스파크 ────────────────────────────────────────────────────────────
  private acquireSpark(color: number, x: number, y: number, z: number): THREE.Mesh | null {
    if (this.freeSparks.length === 0) return null
    const idx   = this.freeSparks.pop()!
    const entry = this.sparkPool[idx]
    entry.inUse = true
    entry.mat.color.setHex(color)
    entry.mat.opacity = 1
    entry.mesh.position.set(x, y, z)
    entry.mesh.visible = true
    return entry.mesh
  }

  private releaseSpark(mesh: THREE.Mesh) {
    const idx = mesh.userData.poolIndex as number | undefined
    if (idx === undefined) return
    const entry = this.sparkPool[idx]
    entry.inUse        = false
    entry.mesh.visible = false
    this.freeSparks.push(idx)
  }

  // ── 내부 공통 파티클 스포너 ────────────────────────────────────────────
  private spawnFx(
    list: Fx[], x: number, z: number,
    color1: number, color2: number, count: number,
    dirY: number, spread: number,
    lightColor: number, lightInt: number,
  ) {
    const light = this.acquireLight(lightColor, lightInt, 12, x, 1.2, z)
    if (!light) return

    const sparks: Fx['sparks'] = []
    for (let i = 0; i < count; i++) {
      const color = i % 3 === 0 ? color1 : color2
      const mesh  = this.acquireSpark(color, x, 0.6 + Math.random() * 0.8, z)
      if (!mesh) continue
      const angle = dirY + (Math.random() - 0.5) * spread
      const spd   = 5 + Math.random() * 9
      sparks.push({
        mesh,
        vel: new THREE.Vector3(Math.sin(angle) * spd, 1.5 + Math.random() * 3.5, Math.cos(angle) * spd),
        age: 0,
      })
    }
    list.push({ light, age: 0, sparks })
  }

  // ── 공개 스포너 ───────────────────────────────────────────────────────
  spawnBlink(x: number, z: number) {
    this.spawnFx(this.blinkEffects, x, z, 0x00eeff, 0x00eeff, 18, 0, Math.PI * 2, 0x00ccff, 10)
  }

  spawnHit(pos: THREE.Vector3) {
    this.spawnFx(this.hitFxList, pos.x, pos.z, 0xff8800, 0xffcc00, 16, 0, Math.PI * 2, 0xff4400, 10)
  }

  spawnHitOnPos(x: number, z: number) {
    this.spawnFx(this.hitFxList, x, z, 0xff2200, 0xff8800, 20, 0, Math.PI * 2, 0xff3300, 14)
  }

  spawnSlash(pos: THREE.Vector3, rotY: number, color: number, size: number, dur: number) {
    const mesh = this.acquireSlash(color)
    if (!mesh) return
    mesh.position.set(pos.x, 1.1, pos.z)
    mesh.rotation.set(Math.PI * 0.35, rotY, 0)
    mesh.scale.setScalar(size)
    this.slashFxList.push({ mesh, age: 0, dur, startS: size })
  }

  spawnRing(x: number, z: number, color: number, maxS: number, dur: number) {
    const mesh = this.acquireRing(color)
    if (!mesh) return
    mesh.position.set(x, 0.06, z)
    mesh.scale.setScalar(0.1)
    this.ringFxList.push({ mesh, age: 0, dur, maxS })
  }

  spawnAttack(pos: THREE.Vector3, dirY: number) {
    this.spawnFx(this.elecFxList, pos.x, pos.z, 0xffffff, 0x00ccff, 28, dirY, 1.4, 0x00ccff, 14)
    this.spawnSlash(pos, dirY, 0x00ffff, 1.3, 0.22)
    this.spawnSlash(pos, dirY + 0.25, 0x8844ff, 1.1, 0.18)
    this.spawnSlash(pos, dirY - 0.2, 0xffffff, 0.9, 0.16)
  }

  // ── W 스킬 1타: 지면 내리찍기 ────────────────────────────────────────
  spawnWSlamImpact(x: number, z: number) {
    // 주황/빨간 파편 + 황금 섬광
    this.spawnFx(this.hitFxList,  x, z, 0xff6600, 0xffcc00, 55, 0, Math.PI * 2, 0xff4400, 22)
    this.spawnFx(this.elecFxList, x, z, 0xff2200, 0xffaa00, 32, 0, Math.PI * 2, 0xff8800, 18)
    // 3겹 충격파 링
    this.spawnRing(x, z, 0xffdd00, 3.5, 0.28)
    this.spawnRing(x, z, 0xff6600, 6.0, 0.42)
    this.spawnRing(x, z, 0xff2200, 8.5, 0.55)
    // 12방향 불꽃 혀
    for (let i = 0; i < 12; i++) {
      const a    = (i / 12) * Math.PI * 2
      const mesh = this.acquireFlame(i % 2 === 0 ? 0xff5500 : 0xffcc00)
      if (!mesh) continue
      mesh.scale.set(0.9 + Math.random() * 0.7, 1.0 + Math.random() * 0.9, 1)
      mesh.position.set(x, 0.5, z)
      mesh.rotation.y = a
      mesh.rotation.x = -0.35
      this.flameFxList.push({ mesh, age: 0, dur: 0.55, vx: Math.sin(a) * 11, vz: Math.cos(a) * 11 })
    }
  }

  // ── W 스킬 2타: 마법 폭발 ─────────────────────────────────────────────
  spawnWExplosion(x: number, z: number) {
    // 보라/시안/흰색 에너지 폭발
    this.spawnFx(this.elecFxList, x, z, 0xffffff, 0xcc44ff, 70, 0, Math.PI * 2, 0xaa00ff, 28)
    this.spawnFx(this.hitFxList,  x, z, 0x66ffff, 0xffffff, 48, 0, Math.PI * 2, 0x00aaff, 22)
    // 4겹 팽창 링 (크기·타이밍 차이로 박력감)
    this.spawnRing(x, z, 0xffffff, 4.5,  0.35)
    this.spawnRing(x, z, 0xcc00ff, 8.0,  0.50)
    this.spawnRing(x, z, 0x44ffff, 11.0, 0.62)
    this.spawnRing(x, z, 0xaa00ff, 14.0, 0.75)
  }

  // ── R 미사일 폭발 ────────────────────────────────────────────────────
  spawnRExplosion(pos: THREE.Vector3) {
    const x = pos.x, z = pos.z
    // 시안/파란 파티클 폭발
    this.spawnFx(this.hitFxList,  x, z, 0x00ccff, 0x0088ff, 36, 0, Math.PI * 2, 0x00aaff, 18)
    this.spawnFx(this.elecFxList, x, z, 0x4488ff, 0xffffff, 24, 0, Math.PI * 2, 0x0066ff, 14)
    // 충격파 링
    this.spawnRing(x, z, 0x00ccff, 3.0, 0.3)
    this.spawnRing(x, z, 0x4488ff, 5.0, 0.45)
    // 화면 흔들림
    this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.15)
  }

  // ── 적 사망 폭발 ─────────────────────────────────────────────────────
  spawnDeathExplosion(pos: THREE.Vector3, isBoss = false) {
    const x = pos.x, z = pos.z
    if (isBoss) {
      // 보스: 강렬한 다크레드 + 보라 대폭발
      this.spawnFx(this.hitFxList,  x, z, 0xff2200, 0xff6600, 80, 0, Math.PI * 2, 0xff1100, 28)
      this.spawnFx(this.elecFxList, x, z, 0xaa00ff, 0xffffff, 60, 0, Math.PI * 2, 0x880099, 22)
      this.spawnRing(x, z, 0xff4400, 5.0,  0.35)
      this.spawnRing(x, z, 0xff2200, 9.0,  0.50)
      this.spawnRing(x, z, 0xcc0000, 13.0, 0.65)
      this.spawnRing(x, z, 0x660000, 18.0, 0.80)
      for (let i = 0; i < 16; i++) {
        const a    = (i / 16) * Math.PI * 2
        const mesh = this.acquireFlame(i % 2 === 0 ? 0xff2200 : 0xcc0000)
        if (!mesh) continue
        mesh.scale.set(1.2 + Math.random() * 1.0, 1.5 + Math.random() * 1.5, 1)
        mesh.position.set(x, 0.5, z)
        mesh.rotation.y = a; mesh.rotation.x = -0.35
        this.flameFxList.push({ mesh, age: 0, dur: 0.75, vx: Math.sin(a) * 14, vz: Math.cos(a) * 14 })
      }
      this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.8)
    } else {
      // 일반 적: 주황/빨간 중간 폭발
      this.spawnFx(this.hitFxList,  x, z, 0xff4400, 0xffaa00, 40, 0, Math.PI * 2, 0xff3300, 18)
      this.spawnFx(this.elecFxList, x, z, 0xff8800, 0xffdd00, 24, 0, Math.PI * 2, 0xff6600, 14)
      this.spawnRing(x, z, 0xff6600, 3.5, 0.28)
      this.spawnRing(x, z, 0xff2200, 6.0, 0.40)
      for (let i = 0; i < 8; i++) {
        const a    = (i / 8) * Math.PI * 2
        const mesh = this.acquireFlame(i % 2 === 0 ? 0xff4400 : 0xffaa00)
        if (!mesh) continue
        mesh.scale.set(0.8 + Math.random() * 0.6, 1.0 + Math.random() * 0.8, 1)
        mesh.position.set(x, 0.4, z)
        mesh.rotation.y = a; mesh.rotation.x = -0.3
        this.flameFxList.push({ mesh, age: 0, dur: 0.55, vx: Math.sin(a) * 9, vz: Math.cos(a) * 9 })
      }
      this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.3)
    }
  }

  // ── 파이어볼 꼬리 파티클 (라이트 없음, 스파크 풀만 사용) ─────────────
  spawnTrailPuff(x: number, y: number, z: number) {
    const colors = [0xff4400, 0xff8800, 0xffcc00]
    for (let i = 0; i < 4; i++) {
      const mesh = this.acquireSpark(colors[i % colors.length], x, y, z)
      if (!mesh) continue
      const angle = Math.random() * Math.PI * 2
      const spd   = 0.3 + Math.random() * 1.0
      const mat   = this.sparkPool[mesh.userData.poolIndex as number].mat
      this.trailSparks.push({
        mesh, mat,
        vel: new THREE.Vector3(Math.sin(angle) * spd, 0.5 + Math.random() * 1.5, Math.cos(angle) * spd),
        age: 0, dur: 0.22,
      })
    }
  }

  /** 무기 스윙 트레일 (콤보 단계별 색상, 풀 사용) */
  spawnSwingTrail(pos: THREE.Vector3, dirY: number, comboStep: number) {
    if (this.swingFree.length === 0) return
    const idx = this.swingFree.pop()!
    const entry = this.swingPool[idx]
    entry.inUse = true

    const colors = [0x00ccff, 0x44aaff, 0xff8844]
    const color = colors[Math.min(comboStep, colors.length - 1)]
    const geoIdx = Math.min(comboStep, this.swingGeos.length - 1)

    entry.mesh.geometry = this.swingGeos[geoIdx]
    entry.mat.color.setHex(color)
    entry.mat.opacity = 0.85
    entry.mesh.visible = true
    entry.mesh.position.set(pos.x + Math.sin(dirY) * 1.2, 1.0 + comboStep * 0.15, pos.z + Math.cos(dirY) * 1.2)
    entry.mesh.rotation.set(Math.PI * 0.3 + comboStep * 0.1, dirY + (comboStep % 2 === 0 ? 0 : Math.PI * 0.15), 0)
    entry.mesh.scale.setScalar(0.8 + comboStep * 0.2)

    this.swingTrails.push({ mesh: entry.mesh, mat: entry.mat, age: 0, dur: 0.2, poolIdx: idx })
  }

  spawnFireCone(ox: number, oz: number, dirY: number) {
    const fwdX = Math.sin(dirY), fwdZ = Math.cos(dirY)

    const flash  = this.acquireLight(0xff4400, 28, 22, ox + fwdX * 2,   1.5, oz + fwdZ * 2)
    const flash2 = this.acquireLight(0xff9900, 16, 18, ox + fwdX * 4.5, 1.0, oz + fwdZ * 4.5)

    const fireColors = [0xff1100, 0xff4400, 0xff7700, 0xffaa00, 0xffdd00]
    const fireSparks: Fx['sparks'] = []
    for (let i = 0; i < 90; i++) {
      const angle = dirY + (Math.random() - 0.5) * Q_CONE_ANGLE
      const spd   = 5 + Math.random() * 15
      const col   = fireColors[Math.floor(Math.random() * fireColors.length)]
      const mesh  = this.acquireSpark(col, ox, 0.3 + Math.random() * 2.2, oz)
      if (!mesh) continue
      fireSparks.push({ mesh, vel: new THREE.Vector3(Math.sin(angle) * spd, 0.3 + Math.random() * 5, Math.cos(angle) * spd), age: 0 })
    }

    if (flash) {
      this.elecFxList.push({ light: flash, age: 0, sparks: fireSparks })
    } else {
      // 풀 소진 시 스파크 반환
      for (const s of fireSparks) this.releaseSpark(s.mesh)
    }
    if (flash2) this.elecFxList.push({ light: flash2, age: 0, sparks: [] })

    const tongueColors = [0xff1100, 0xff4400, 0xff6600, 0xff9900, 0xffbb00]
    for (let i = 0; i < 11; i++) {
      const t  = i / 10
      const a  = dirY + (t - 0.5) * Q_CONE_ANGLE
      const vx = Math.sin(a), vz = Math.cos(a)
      const startDist = 0.4 + Math.random() * 0.6
      const col  = tongueColors[Math.floor(Math.random() * tongueColors.length)]
      const mesh = this.acquireFlame(col)
      if (!mesh) continue
      mesh.scale.set(0.6 + Math.random() * 0.8, 0.6 + Math.random() * 0.7, 1)
      mesh.position.set(ox + vx * startDist, 1.2 + Math.random() * 0.6, oz + vz * startDist)
      mesh.rotation.y = a
      mesh.rotation.x = -0.1 + Math.random() * 0.2
      this.flameFxList.push({ mesh, age: 0, dur: 0.4 + Math.random() * 0.1, vx: vx * 10, vz: vz * 10 })
    }

    this.screenShakeTimer = 0.2
  }

  // ── 수류탄 폭발 ─────────────────────────────────────────────────────
  spawnGrenadeExplosion(x: number, z: number) {
    const flash = this.acquireLight(0xff6600, 20, 18, x, 1.5, z)
    if (flash) this.hitFxList.push({ light: flash, age: 0, sparks: [] })
    const flash2 = this.acquireLight(0xffaa00, 14, 14, x, 2.5, z)
    if (flash2) this.elecFxList.push({ light: flash2, age: 0, sparks: [] })

    const colors = [0xff6600, 0xff8800, 0xffaa00, 0xff4400]
    const sparks: Fx['sparks'] = []
    for (let i = 0; i < 50; i++) {
      const col  = colors[Math.floor(Math.random() * colors.length)]
      const mesh = this.acquireSpark(col, x, 0.4 + Math.random() * 2, z)
      if (!mesh) continue
      const angle = Math.random() * Math.PI * 2
      const spd   = 3 + Math.random() * 10
      sparks.push({ mesh, vel: new THREE.Vector3(Math.sin(angle) * spd, 1 + Math.random() * 6, Math.cos(angle) * spd), age: 0 })
    }
    if (flash) this.hitFxList[this.hitFxList.length - 1].sparks = sparks
    else for (const s of sparks) this.releaseSpark(s.mesh)

    this.spawnRing(x, z, 0xff8800, 4.0, 0.35)
    this.spawnRing(x, z, 0xff4400, 6.5, 0.50)
    this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.4)
  }

  // ── 검기 트레일 ────────────────────────────────────────────────────
  spawnBladeTrail(x: number, y: number, z: number) {
    const colors = [0x00ffee, 0x00ccff, 0x44ddff]
    for (let i = 0; i < 3; i++) {
      const mesh = this.acquireSpark(colors[i], x, y, z)
      if (!mesh) continue
      const angle = Math.random() * Math.PI * 2
      const spd   = 0.2 + Math.random() * 0.6
      const mat   = this.sparkPool[mesh.userData.poolIndex as number].mat
      this.trailSparks.push({
        mesh, mat,
        vel: new THREE.Vector3(Math.sin(angle) * spd, 0.3 + Math.random() * 1.0, Math.cos(angle) * spd),
        age: 0, dur: 0.18,
      })
    }
  }

  // ── D스킬: 검에서 빛 뿜는 슬래시 빔 ─────────────────────────────────
  spawnSwordBeamSlash(x: number, z: number, dirY: number, length: number) {
    const fwdX = Math.sin(dirY), fwdZ = Math.cos(dirY)

    // 강렬한 광원 2개 (시작점 + 끝점)
    const flash1 = this.acquireLight(0xffdd44, 28, 20, x + fwdX * 2, 2, z + fwdZ * 2)
    const flash2 = this.acquireLight(0xffffff, 18, 18, x + fwdX * length * 0.6, 1.5, z + fwdZ * length * 0.6)
    if (flash1) this.elecFxList.push({ light: flash1, age: 0, sparks: [] })
    if (flash2) this.elecFxList.push({ light: flash2, age: 0, sparks: [] })

    // 3겹 슬래시 아크 (검에서 뿜어나가는 느낌)
    const slashColors = [0xffdd44, 0xffffff, 0xffaa00]
    for (let s = 0; s < 3; s++) {
      const offset = s * 0.12
      const dist = 1.5 + s * 1.8
      const mesh = this.acquireSlash(slashColors[s])
      if (!mesh) continue
      mesh.position.set(x + fwdX * dist, 1.0 + s * 0.15, z + fwdZ * dist)
      mesh.rotation.set(Math.PI * 0.3 + s * 0.08, dirY + (s - 1) * 0.15, offset)
      mesh.scale.setScalar(1.5 + s * 0.5)
      this.slashFxList.push({ mesh, age: 0, dur: 0.25 + s * 0.05, startS: 1.5 + s * 0.5 })
    }

    // 빔 경로를 따라 촤좌작! 에너지 파티클 (밀도 높게)
    const sparkColors = [0xffdd44, 0xffffff, 0xffee88, 0xffcc00]
    for (let d = 0; d < length; d += 0.8) {
      const bx = x + fwdX * d, bz = z + fwdZ * d
      for (let i = 0; i < 6; i++) {
        const col  = sparkColors[Math.floor(Math.random() * sparkColors.length)]
        // 좌우로 퍼지는 스파크
        const perpX = -fwdZ, perpZ = fwdX
        const spread = (Math.random() - 0.5) * 2.5
        const mesh = this.acquireSpark(col,
          bx + perpX * spread, 0.3 + Math.random() * 2.0,
          bz + perpZ * spread,
        )
        if (!mesh) continue
        const mat = this.sparkPool[mesh.userData.poolIndex as number].mat
        // 바깥+위로 퍼지는 속도
        this.trailSparks.push({
          mesh, mat,
          vel: new THREE.Vector3(
            perpX * spread * 3 + fwdX * 2,
            2 + Math.random() * 4,
            perpZ * spread * 3 + fwdZ * 2,
          ),
          age: 0, dur: 0.25 + Math.random() * 0.15,
        })
      }
    }

    // 빔 끝 충격파 링
    this.spawnRing(x + fwdX * length * 0.5, z + fwdZ * length * 0.5, 0xffdd44, 4.0, 0.35)
    this.spawnRing(x + fwdX * length * 0.7, z + fwdZ * length * 0.7, 0xffffff, 2.5, 0.25)
    // 시작점 링 (검에서 방출)
    this.spawnRing(x + fwdX * 1.5, z + fwdZ * 1.5, 0xffaa00, 2.0, 0.2)

    this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.35)
  }

  // ── 공중 폭격 착탄 ─────────────────────────────────────────────────
  spawnBombardmentStrike(x: number, z: number) {
    const flash = this.acquireLight(0xff4400, 16, 14, x, 1.5, z)
    if (flash) this.hitFxList.push({ light: flash, age: 0, sparks: [] })

    const colors = [0xff4400, 0xff8800, 0xff2200]
    const sparks: Fx['sparks'] = []
    for (let i = 0; i < 30; i++) {
      const col  = colors[Math.floor(Math.random() * colors.length)]
      const mesh = this.acquireSpark(col, x, 0.3 + Math.random() * 1.5, z)
      if (!mesh) continue
      const angle = Math.random() * Math.PI * 2
      const spd   = 2 + Math.random() * 8
      sparks.push({ mesh, vel: new THREE.Vector3(Math.sin(angle) * spd, 1 + Math.random() * 4, Math.cos(angle) * spd), age: 0 })
    }
    if (flash) this.hitFxList[this.hitFxList.length - 1].sparks = sparks
    else for (const s of sparks) this.releaseSpark(s.mesh)

    this.spawnRing(x, z, 0xff6600, 2.5, 0.25)
    this.spawnRing(x, z, 0xff2200, 4.0, 0.35)
    this.screenShakeTimer = Math.max(this.screenShakeTimer, 0.12)
  }

  // ── 보이드 스톰 폭발 ───────────────────────────────────────────────
  spawnVoidExplosion(x: number, z: number) {
    const flash  = this.acquireLight(0x8800ff, 28, 25, x, 2, z)
    const flash2 = this.acquireLight(0xcc00ff, 18, 20, x, 3, z)
    if (flash)  this.elecFxList.push({ light: flash,  age: 0, sparks: [] })
    if (flash2) this.elecFxList.push({ light: flash2, age: 0, sparks: [] })

    const colors = [0x8800ff, 0x4400aa, 0xcc00ff, 0xffffff]
    const sparks: Fx['sparks'] = []
    for (let i = 0; i < 80; i++) {
      const col  = colors[Math.floor(Math.random() * colors.length)]
      const mesh = this.acquireSpark(col, x, 0.5 + Math.random() * 3, z)
      if (!mesh) continue
      const angle = Math.random() * Math.PI * 2
      const spd   = 4 + Math.random() * 12
      sparks.push({ mesh, vel: new THREE.Vector3(Math.sin(angle) * spd, 1 + Math.random() * 6, Math.cos(angle) * spd), age: 0 })
    }
    if (flash) this.elecFxList[this.elecFxList.length - 2].sparks = sparks
    else for (const s of sparks) this.releaseSpark(s.mesh)

    this.spawnRing(x, z, 0x8800ff, 5.0, 0.4)
    this.spawnRing(x, z, 0x4400aa, 10.0, 0.6)
    this.spawnRing(x, z, 0x220044, 15.0, 0.8)
    this.screenShakeTimer = Math.max(this.screenShakeTimer, 1.0)
  }

  // ── 보이드 펄스 (지속 중 주기적) ────────────────────────────────────
  spawnVoidPulse(x: number, z: number, radius: number) {
    this.spawnRing(x, z, 0x8800ff, radius, 0.3)
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist  = radius * (0.5 + Math.random() * 0.5)
      const sx    = x + Math.cos(angle) * dist
      const sz    = z + Math.sin(angle) * dist
      const mesh  = this.acquireSpark(0xaa00ff, sx, 0.5 + Math.random(), sz)
      if (!mesh) continue
      const toCenterX = x - sx, toCenterZ = z - sz
      const len = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ) || 1
      const mat = this.sparkPool[mesh.userData.poolIndex as number].mat
      this.trailSparks.push({
        mesh, mat,
        vel: new THREE.Vector3(toCenterX / len * 6, 1.5, toCenterZ / len * 6),
        age: 0, dur: 0.4,
      })
    }
  }

  // ── 업데이트 ──────────────────────────────────────────────────────────
  private updateFxList(list: Fx[], dur: number, maxInt: number, dt: number) {
    for (let i = list.length - 1; i >= 0; i--) {
      const fx = list[i]; fx.age += dt
      fx.light.intensity = maxInt * Math.max(0, 1 - fx.age / dur)
      if (fx.age >= dur) this.releaseLight(fx.light)
      for (let j = fx.sparks.length - 1; j >= 0; j--) {
        const s = fx.sparks[j]; s.age += dt
        if (s.age >= dur) { this.releaseSpark(s.mesh); fx.sparks.splice(j, 1) }
        else {
          s.vel.y -= 14 * dt
          s.mesh.position.addScaledVector(s.vel, dt)
          ;(s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - s.age / dur
        }
      }
      if (fx.age >= dur && fx.sparks.length === 0) list.splice(i, 1)
    }
  }

  update(delta: number) {
    if (this.screenShakeTimer > 0) this.screenShakeTimer -= delta

    this.updateFxList(this.blinkEffects, 0.45, 10, delta)
    this.updateFxList(this.elecFxList,   0.35, 14, delta)
    this.updateFxList(this.hitFxList,    0.4,  10, delta)

    for (let i = this.slashFxList.length - 1; i >= 0; i--) {
      const fx = this.slashFxList[i]; fx.age += delta
      const p  = Math.min(1, fx.age / fx.dur)
      fx.mesh.scale.setScalar(fx.startS * (1 + p * 0.8))
      ;(fx.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p * p * 1.4)
      if (p >= 1) { this.releaseSlash(fx.mesh); this.slashFxList.splice(i, 1) }
    }

    for (let i = this.ringFxList.length - 1; i >= 0; i--) {
      const fx = this.ringFxList[i]; fx.age += delta
      const p  = Math.min(1, fx.age / fx.dur)
      fx.mesh.scale.setScalar(p * fx.maxS + 0.1)
      ;(fx.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - p))
      if (p >= 1) { this.releaseRing(fx.mesh); this.ringFxList.splice(i, 1) }
    }

    for (let i = this.flameFxList.length - 1; i >= 0; i--) {
      const fx = this.flameFxList[i]; fx.age += delta
      const p  = Math.min(1, fx.age / fx.dur)
      fx.mesh.position.x += fx.vx * delta
      fx.mesh.position.z += fx.vz * delta
      fx.mesh.scale.y = (1 + p * 2.5)
      ;(fx.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92 * Math.pow(1 - p, 1.5)
      if (p >= 1) { this.releaseFlame(fx.mesh); this.flameFxList.splice(i, 1) }
    }

    // 스윙 트레일 (풀 반환)
    for (let i = this.swingTrails.length - 1; i >= 0; i--) {
      const st = this.swingTrails[i]; st.age += delta
      const p = st.age / st.dur
      st.mat.opacity = 0.85 * Math.max(0, 1 - p)
      st.mesh.scale.multiplyScalar(1 + delta * 3)
      if (p >= 1) {
        st.mesh.visible = false
        st.mesh.position.y = -9999
        this.swingPool[st.poolIdx].inUse = false
        this.swingFree.push(st.poolIdx)
        this.swingTrails.splice(i, 1)
      }
    }

    for (let i = this.trailSparks.length - 1; i >= 0; i--) {
      const s = this.trailSparks[i]; s.age += delta
      const p = s.age / s.dur
      s.vel.y -= 6 * delta
      s.mesh.position.addScaledVector(s.vel, delta)
      s.mat.opacity = Math.max(0, 1 - p)
      if (p >= 1) { this.releaseSpark(s.mesh); this.trailSparks.splice(i, 1) }
    }
  }
}
