import * as THREE from 'three'

export function buildMap(scene: THREE.Scene) {
  // ── Ground ────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.95, metalness: 0.1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(80, 40, 0x223344, 0x1a2233)
  grid.position.y = 0.01
  scene.add(grid)

  // ── 벙커 구조물 ──────────────────────────────────────────────────────
  const wallMat   = new THREE.MeshStandardMaterial({ color: 0x252528, roughness: 0.9, metalness: 0.2 })
  const metalMat  = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.5, metalness: 0.8 })
  const damageMat = new THREE.MeshStandardMaterial({ color: 0x1a1810, roughness: 1.0, metalness: 0.0 })

  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz
    m.castShadow = true; m.receiveShadow = true
    scene.add(m)
  }

  addBox(0, 2, -28, 56, 4, 1, wallMat); addBox(0, 2, 28, 56, 4, 1, wallMat)
  addBox(-28, 2, 0, 1, 4, 56, wallMat); addBox(28, 2, 0, 1, 4, 56, wallMat)
  addBox(-8, 1.5, -10, 0.5, 3, 8, wallMat); addBox(8, 1.0, 10, 0.5, 2, 6, damageMat); addBox(0, 1.5, -6, 10, 3, 0.5, wallMat)

  for (const [cx, cz] of [[-14, -14], [14, -14], [-14, 14], [14, 14], [-14, 0], [14, 0], [0, -14], [0, 14]] as [number, number][])
    addBox(cx, 2, cz, 1.2, 4, 1.2, metalMat)

  addBox(-5, 0.4, -15, 2, 0.8, 1.2, metalMat); addBox(-4.5, 1.2, -15, 1.8, 0.6, 1.0, damageMat)
  addBox(6, 0.5, 12, 1.5, 1, 1.5, metalMat); addBox(-10, 0.3, 5, 1.8, 0.6, 1.8, damageMat)
  addBox(12, 0.4, -8, 1, 0.8, 2, metalMat); addBox(-6, 0.25, 18, 2.5, 0.5, 1, damageMat, 0, 0.15)
  addBox(3, 0.3, 20, 1.2, 0.6, 1.2, damageMat); addBox(-18, 0.4, -5, 1.5, 0.8, 1.5, metalMat)

  const tankMat = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.6, metalness: 0.6 })
  for (const [x, z, r, h] of [[-15, -18, 1.0, 3.5], [-13, -18, 0.7, 2.8], [16, 15, 0.8, 2.5], [18, 15, 0.5, 1.8]] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), tankMat)
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m)
  }

  addBox(0, 5, -5, 50, 0.3, 0.4, metalMat); addBox(0, 5, 5, 50, 0.3, 0.4, metalMat)
  addBox(-5, 5, 0, 0.4, 0.3, 50, metalMat); addBox(5, 5, 0, 0.4, 0.3, 50, metalMat)

  // ── 램프 ──────────────────────────────────────────────────────────────
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x444450, roughness: 0.6, metalness: 0.9 })
  const lampHoodMat = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.4, metalness: 0.8 })

  for (const [lx, lz, col, intensity] of [
    [-8, -20, 0xffcc66, 6], [8, -20, 0xffcc66, 6], [-20, 0, 0xff8833, 5], [20, 0, 0x66ccff, 5],
    [-8, 20, 0xffcc66, 6], [8, 20, 0xffcc66, 6], [0, -8, 0x88ffcc, 4], [-16, -8, 0xff6633, 5], [16, 8, 0x66aaff, 5],
  ] as [number, number, number, number][]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.5, 8), lampPoleMat)
    pole.position.set(lx, 1.75, lz); pole.castShadow = true; scene.add(pole)
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.15, 0.4, 12, 1, true), lampHoodMat)
    hood.position.set(lx, 3.6, lz); hood.castShadow = true; scene.add(hood)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: col }))
    bulb.position.set(lx, 3.45, lz); scene.add(bulb)
    const pl = new THREE.PointLight(col, intensity, 100)
    pl.position.set(lx, 3.3, lz); scene.add(pl)
  }

  // ── 바닥 발광 스트립 ──────────────────────────────────────────────────
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc })
  for (const [x, z, w, d] of [[0, -14, 20, 0.1], [0, 14, 20, 0.1], [-10, 0, 0.1, 28], [10, 0, 0.1, 28]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), glowMat)
    m.position.set(x, 0.02, z); scene.add(m)
  }
}
