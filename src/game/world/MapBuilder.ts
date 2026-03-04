import * as THREE from 'three'

// ── 공통 재질 ────────────────────────────────────────────────────────────
const wallMat   = new THREE.MeshStandardMaterial({ color: 0x252528, roughness: 0.9, metalness: 0.2 })
const metalMat  = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.5, metalness: 0.8 })
const damageMat = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 1.0, metalness: 0.0 })
const tankMat   = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6, metalness: 0.6 })
const glowMat   = new THREE.MeshBasicMaterial({ color: 0x00ffcc })
const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x444450, roughness: 0.6, metalness: 0.9 })
const lampHoodMat = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.4, metalness: 0.8 })

// ── 헬퍼 ─────────────────────────────────────────────────────────────────
function addBox(
  scene: THREE.Scene, objs: THREE.Object3D[],
  x: number, y: number, z: number, w: number, h: number, d: number,
  mat: THREE.Material, rx = 0, rz = 0,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz
  m.castShadow = true; m.receiveShadow = true
  scene.add(m); objs.push(m)
}

function addGround(scene: THREE.Scene, objs: THREE.Object3D[], w: number, d: number) {
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.95, metalness: 0.1 })
  groundMat.userData.perCall = true
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground); objs.push(ground)

  const grid = new THREE.GridHelper(Math.max(w, d), Math.floor(Math.max(w, d) / 2), 0x223344, 0x1a2233)
  grid.position.y = 0.01
  scene.add(grid); objs.push(grid)
}

function addLamp(
  scene: THREE.Scene, objs: THREE.Object3D[],
  lx: number, lz: number, col: number, intensity: number,
) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.5, 8), lampPoleMat)
  pole.position.set(lx, 1.75, lz); pole.castShadow = true; scene.add(pole); objs.push(pole)
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.15, 0.4, 12, 1, true), lampHoodMat)
  hood.position.set(lx, 3.6, lz); hood.castShadow = true; scene.add(hood); objs.push(hood)
  const bulbMat = new THREE.MeshBasicMaterial({ color: col })
  bulbMat.userData.perCall = true
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), bulbMat)
  bulb.position.set(lx, 3.45, lz); scene.add(bulb); objs.push(bulb)
  const pl = new THREE.PointLight(col, intensity, 100)
  pl.position.set(lx, 3.3, lz); scene.add(pl); objs.push(pl as unknown as THREE.Object3D)
}

function addGlowStrip(
  scene: THREE.Scene, objs: THREE.Object3D[],
  x: number, z: number, w: number, d: number,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), glowMat)
  m.position.set(x, 0.02, z); scene.add(m); objs.push(m)
}

function addTank(
  scene: THREE.Scene, objs: THREE.Object3D[],
  x: number, z: number, r: number, h: number,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), tankMat)
  m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true
  scene.add(m); objs.push(m)
}

// ══════════════════════════════════════════════════════════════════════════
// 0: 시작방 — 작은 밀폐 공간
// ══════════════════════════════════════════════════════════════════════════
export function buildWakeupRoom(scene: THREE.Scene): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  addGround(scene, objs, 14, 14)

  // 벽 4면 (포탈 쪽은 조금 열려있음)
  addBox(scene, objs, 0, 2, -6, 14, 4, 0.5, wallMat)   // 뒤
  addBox(scene, objs, 0, 2, 6, 14, 4, 0.5, wallMat)     // 앞
  addBox(scene, objs, -6, 2, 0, 0.5, 4, 12, wallMat)     // 왼쪽
  // 오른쪽: 포탈 공간 확보, 위아래로 나뉨
  addBox(scene, objs, 6, 2, -4, 0.5, 4, 4, wallMat)
  addBox(scene, objs, 6, 2, 4, 0.5, 4, 4, wallMat)

  // 어두운 분위기 연출용 램프
  addLamp(scene, objs, 0, 0, 0x88aaff, 4)
  addLamp(scene, objs, -3, -3, 0xffcc66, 3)

  // 바닥 글로우
  addGlowStrip(scene, objs, 0, -5, 8, 0.1)

  return objs
}

// ══════════════════════════════════════════════════════════════════════════
// 1: ㄱ자 골목 (수평 → 수직 꺾임)
//    수평 복도: x[-22,22]  z[-22,-12]
//    수직 복도: x[12,22]   z[-12,22]
// ══════════════════════════════════════════════════════════════════════════
export function buildAlleyL(scene: THREE.Scene): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []

  // ── 복도 바닥 (ㄱ자 형태만) ─────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.95, metalness: 0.1 })
  floorMat.userData.perCall = true
  // 수평 바닥
  const hFloor = new THREE.Mesh(new THREE.PlaneGeometry(44, 10), floorMat)
  hFloor.rotation.x = -Math.PI / 2; hFloor.position.set(0, 0, -17); hFloor.receiveShadow = true
  scene.add(hFloor); objs.push(hFloor)
  // 수직 바닥
  const vFloor = new THREE.Mesh(new THREE.PlaneGeometry(10, 34), floorMat)
  vFloor.rotation.x = -Math.PI / 2; vFloor.position.set(17, 0, 5); vFloor.receiveShadow = true
  scene.add(vFloor); objs.push(vFloor)
  // 그리드
  const grid1 = new THREE.GridHelper(50, 25, 0x223344, 0x1a2233)
  grid1.position.y = 0.01; scene.add(grid1); objs.push(grid1)

  // ── 외벽 ────────────────────────────────────────────────────────
  // 수평 복도 외벽
  addBox(scene, objs, 0, 2, -22.5, 44, 4, 1, wallMat)     // 위쪽 벽 (z=-22)
  addBox(scene, objs, -5, 2, -11.5, 34, 4, 1, wallMat)     // 아래쪽 벽 (z=-12), 코너까지만
  addBox(scene, objs, -22.5, 2, -17, 1, 4, 10, wallMat)     // 왼쪽 끝 벽

  // 수직 복도 외벽
  addBox(scene, objs, 22.5, 2, 5, 1, 4, 34, wallMat)        // 오른쪽 벽 (x=22)
  addBox(scene, objs, 11.5, 2, 5, 1, 4, 34, wallMat)        // 왼쪽 벽 (x=12)
  addBox(scene, objs, 17, 2, 22.5, 10, 4, 1, wallMat)       // 윗끝 벽 (z=22)

  // ── 코너 채움: 복도 외 영역 차단용 큰 벽 블록 ──────────────────
  // x[12,22] z[-22,-12] 는 양 복도 교차 → 벽 불필요
  // x[-22,12] z[-12,22] 는 비워야 할 영역 → 큰 벽으로 채움
  addBox(scene, objs, -5, 2, 5, 34, 4, 34, wallMat)  // 왼쪽 위 큰 벽 블록

  // ── 장애물 ──────────────────────────────────────────────────────
  addBox(scene, objs, -14, 0.5, -17, 1.5, 1, 1.5, metalMat)
  addBox(scene, objs, -4, 0.4, -19, 1.2, 0.8, 1.2, damageMat)
  addBox(scene, objs, 6, 0.5, -15, 1.5, 1, 1.5, metalMat)
  addTank(scene, objs, 17, -4, 0.8, 2.5)
  addBox(scene, objs, 19, 0.4, 10, 1.8, 0.8, 1.2, damageMat)

  // ── 램프 ────────────────────────────────────────────────────────
  addLamp(scene, objs, -16, -17, 0xffcc66, 5)
  addLamp(scene, objs, 0, -17, 0xff8833, 4)
  addLamp(scene, objs, 10, -17, 0x66ccff, 5)
  addLamp(scene, objs, 17, 0, 0xffcc66, 5)
  addLamp(scene, objs, 17, 14, 0xff8833, 5)

  // ── 글로우 스트립 ──────────────────────────────────────────────
  addGlowStrip(scene, objs, -5, -17, 20, 0.1)
  addGlowStrip(scene, objs, 17, 5, 0.1, 20)

  return objs
}

// ══════════════════════════════════════════════════════════════════════════
// 2: ㄴ자 골목 (수직 → 수평 꺾임)
//    수직 복도: x[-22,-12]  z[-22,22]
//    수평 복도: x[-12,22]   z[-22,-12]
// ══════════════════════════════════════════════════════════════════════════
export function buildAlleyReverse(scene: THREE.Scene): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []

  // ── 복도 바닥 (ㄴ자 형태만) ─────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.95, metalness: 0.1 })
  floorMat.userData.perCall = true
  // 수직 바닥
  const vFloor = new THREE.Mesh(new THREE.PlaneGeometry(10, 44), floorMat)
  vFloor.rotation.x = -Math.PI / 2; vFloor.position.set(-17, 0, 0); vFloor.receiveShadow = true
  scene.add(vFloor); objs.push(vFloor)
  // 수평 바닥
  const hFloor = new THREE.Mesh(new THREE.PlaneGeometry(34, 10), floorMat)
  hFloor.rotation.x = -Math.PI / 2; hFloor.position.set(5, 0, -17); hFloor.receiveShadow = true
  scene.add(hFloor); objs.push(hFloor)
  // 그리드
  const grid2 = new THREE.GridHelper(50, 25, 0x223344, 0x1a2233)
  grid2.position.y = 0.01; scene.add(grid2); objs.push(grid2)

  // ── 외벽 ────────────────────────────────────────────────────────
  // 수직 복도 외벽
  addBox(scene, objs, -22.5, 2, 0, 1, 4, 44, wallMat)       // 왼쪽 벽 (x=-22)
  addBox(scene, objs, -11.5, 2, 5, 1, 4, 34, wallMat)       // 오른쪽 벽 (x=-12), 코너까지
  addBox(scene, objs, -17, 2, 22.5, 10, 4, 1, wallMat)      // 윗끝 벽 (z=22)

  // 수평 복도 외벽
  addBox(scene, objs, 5, 2, -22.5, 34, 4, 1, wallMat)       // 아래쪽 벽 (z=-22)
  addBox(scene, objs, 5, 2, -11.5, 34, 4, 1, wallMat)       // 위쪽 벽 (z=-12)
  addBox(scene, objs, 22.5, 2, -17, 1, 4, 10, wallMat)      // 오른쪽 끝 벽

  // ── 코너 채움: 복도 외 영역 차단 ───────────────────────────────
  // x[-22,-12] z[-22,-12] 는 양 복도 교차 → 벽 불필요
  // x[-12,22] z[-12,22] 는 비워야 할 영역 → 큰 벽으로 채움
  addBox(scene, objs, 5, 2, 5, 34, 4, 34, wallMat)

  // ── 장애물 ──────────────────────────────────────────────────────
  addBox(scene, objs, -17, 0.5, 14, 1.5, 1, 1.5, metalMat)
  addBox(scene, objs, -19, 0.4, 4, 1.2, 0.8, 1.2, damageMat)
  addTank(scene, objs, -17, -4, 0.8, 2.5)
  addBox(scene, objs, 2, 0.5, -17, 1.5, 1, 1.5, metalMat)
  addBox(scene, objs, 12, 0.4, -19, 1.8, 0.8, 1.2, damageMat)
  addTank(scene, objs, 18, -17, 0.6, 1.8)

  // ── 램프 ────────────────────────────────────────────────────────
  addLamp(scene, objs, -17, 16, 0xffcc66, 5)
  addLamp(scene, objs, -17, 0, 0xff8833, 4)
  addLamp(scene, objs, -17, -10, 0x66ccff, 5)
  addLamp(scene, objs, 4, -17, 0xffcc66, 5)
  addLamp(scene, objs, 14, -17, 0xff8833, 5)

  // ── 글로우 스트립 ──────────────────────────────────────────────
  addGlowStrip(scene, objs, -17, 5, 0.1, 20)
  addGlowStrip(scene, objs, 5, -17, 20, 0.1)

  return objs
}

// ══════════════════════════════════════════════════════════════════════════
// 3: 광장 — 넓은 개방 공간
// ══════════════════════════════════════════════════════════════════════════
export function buildPlaza(scene: THREE.Scene): THREE.Object3D[] {
  const objs: THREE.Object3D[] = []
  addGround(scene, objs, 80, 80)

  // 외벽
  addBox(scene, objs, 0, 2, -28, 56, 4, 1, wallMat)
  addBox(scene, objs, 0, 2, 28, 56, 4, 1, wallMat)
  addBox(scene, objs, -28, 2, 0, 1, 4, 56, wallMat)
  addBox(scene, objs, 28, 2, 0, 1, 4, 56, wallMat)

  // 중앙 분수/구조물 (원형 장식)
  const fountainMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.7 })
  fountainMat.userData.perCall = true
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 24), fountainMat)
  fountain.position.set(0, 0.25, 0); fountain.receiveShadow = true
  scene.add(fountain); objs.push(fountain)

  const fInner = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.8, 24), metalMat)
  fInner.position.set(0, 0.4, 0)
  scene.add(fInner); objs.push(fInner)

  // 산개된 장애물 (벤치/상자)
  addBox(scene, objs, -12, 0.4, -12, 3, 0.8, 1, metalMat)
  addBox(scene, objs, 12, 0.4, -12, 3, 0.8, 1, metalMat)
  addBox(scene, objs, -12, 0.4, 12, 3, 0.8, 1, metalMat)
  addBox(scene, objs, 12, 0.4, 12, 3, 0.8, 1, metalMat)

  // 모서리 장애물
  for (const [cx, cz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]])
    addBox(scene, objs, cx, 1, cz, 2, 2, 2, damageMat)

  addTank(scene, objs, -18, 0, 1.0, 3.0)
  addTank(scene, objs, 18, 0, 1.0, 3.0)
  addTank(scene, objs, 0, -18, 0.8, 2.5)
  addTank(scene, objs, 0, 18, 0.8, 2.5)

  // 램프 (8개, 외곽)
  addLamp(scene, objs, -15, -15, 0xffcc66, 6)
  addLamp(scene, objs, 15, -15, 0xffcc66, 6)
  addLamp(scene, objs, -15, 15, 0xffcc66, 6)
  addLamp(scene, objs, 15, 15, 0xffcc66, 6)
  addLamp(scene, objs, 0, -20, 0xff8833, 5)
  addLamp(scene, objs, 0, 20, 0x66ccff, 5)
  addLamp(scene, objs, -20, 0, 0xff6633, 5)
  addLamp(scene, objs, 20, 0, 0x66aaff, 5)

  // 바닥 글로우
  addGlowStrip(scene, objs, 0, -14, 20, 0.1)
  addGlowStrip(scene, objs, 0, 14, 20, 0.1)
  addGlowStrip(scene, objs, -14, 0, 0.1, 20)
  addGlowStrip(scene, objs, 14, 0, 0.1, 20)

  return objs
}

// ══════════════════════════════════════════════════════════════════════════
// 4: 핵심 연구소 (기존 buildMap) — 파괴 가능 오브젝트 태깅
// ══════════════════════════════════════════════════════════════════════════
export interface MapBuildResult {
  allObjects: THREE.Object3D[]
  destructibles: THREE.Object3D[]
}

export function buildCoreLab(scene: THREE.Scene): MapBuildResult {
  const objs: THREE.Object3D[] = []
  const destructibles: THREE.Object3D[] = []
  addGround(scene, objs, 80, 80)

  // 외벽 (파괴 불가)
  addBox(scene, objs, 0, 2, -28, 56, 4, 1, wallMat)
  addBox(scene, objs, 0, 2, 28, 56, 4, 1, wallMat)
  addBox(scene, objs, -28, 2, 0, 1, 4, 56, wallMat)
  addBox(scene, objs, 28, 2, 0, 1, 4, 56, wallMat)

  // 내부 벽 (파괴 가능)
  const preD = objs.length
  addBox(scene, objs, -8, 1.5, -10, 0.5, 3, 8, wallMat)
  addBox(scene, objs, 8, 1.0, 10, 0.5, 2, 6, damageMat)
  addBox(scene, objs, 0, 1.5, -6, 10, 3, 0.5, wallMat)
  destructibles.push(...objs.slice(preD))

  // 기둥 (파괴 가능)
  const preP = objs.length
  for (const [cx, cz] of [[-14, -14], [14, -14], [-14, 14], [14, 14], [-14, 0], [14, 0], [0, -14], [0, 14]] as [number, number][])
    addBox(scene, objs, cx, 2, cz, 1.2, 4, 1.2, metalMat)
  destructibles.push(...objs.slice(preP))

  // 잔해 (파괴 가능)
  const preJ = objs.length
  addBox(scene, objs, -5, 0.4, -15, 2, 0.8, 1.2, metalMat)
  addBox(scene, objs, -4.5, 1.2, -15, 1.8, 0.6, 1.0, damageMat)
  addBox(scene, objs, 6, 0.5, 12, 1.5, 1, 1.5, metalMat)
  addBox(scene, objs, -10, 0.3, 5, 1.8, 0.6, 1.8, damageMat)
  addBox(scene, objs, 12, 0.4, -8, 1, 0.8, 2, metalMat)
  addBox(scene, objs, -6, 0.25, 18, 2.5, 0.5, 1, damageMat, 0, 0.15)
  addBox(scene, objs, 3, 0.3, 20, 1.2, 0.6, 1.2, damageMat)
  addBox(scene, objs, -18, 0.4, -5, 1.5, 0.8, 1.5, metalMat)
  destructibles.push(...objs.slice(preJ))

  // 탱크 (파괴 가능)
  const preT = objs.length
  addTank(scene, objs, -15, -18, 1.0, 3.5)
  addTank(scene, objs, -13, -18, 0.7, 2.8)
  addTank(scene, objs, 16, 15, 0.8, 2.5)
  addTank(scene, objs, 18, 15, 0.5, 1.8)
  destructibles.push(...objs.slice(preT))

  // 천장 구조물 (파괴 가능)
  const preC = objs.length
  addBox(scene, objs, 0, 5, -5, 50, 0.3, 0.4, metalMat)
  addBox(scene, objs, 0, 5, 5, 50, 0.3, 0.4, metalMat)
  addBox(scene, objs, -5, 5, 0, 0.4, 0.3, 50, metalMat)
  addBox(scene, objs, 5, 5, 0, 0.4, 0.3, 50, metalMat)
  destructibles.push(...objs.slice(preC))

  // 램프 (파괴 불가)
  for (const [lx, lz, col, intensity] of [
    [-8, -20, 0xffcc66, 6], [8, -20, 0xffcc66, 6], [-20, 0, 0xff8833, 5], [20, 0, 0x66ccff, 5],
    [-8, 20, 0xffcc66, 6], [8, 20, 0xffcc66, 6], [0, -8, 0x88ffcc, 4], [-16, -8, 0xff6633, 5], [16, 8, 0x66aaff, 5],
  ] as [number, number, number, number][])
    addLamp(scene, objs, lx, lz, col, intensity)

  // 바닥 발광 스트립 (파괴 불가)
  addGlowStrip(scene, objs, 0, -14, 20, 0.1)
  addGlowStrip(scene, objs, 0, 14, 20, 0.1)
  addGlowStrip(scene, objs, -10, 0, 0.1, 28)
  addGlowStrip(scene, objs, 10, 0, 0.1, 28)

  return { allObjects: objs, destructibles }
}

// ── 하위 호환 (기존 import용) ───────────────────────────────────────────
export const buildMap = buildCoreLab
