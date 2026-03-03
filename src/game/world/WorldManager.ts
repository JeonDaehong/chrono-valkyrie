import * as THREE from 'three'

export class WorldManager {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dirLight!: THREE.DirectionalLight
  flickerLights: THREE.PointLight[] = []
  zoomScale = 1.0

  private camLookX = 0
  private camLookZ = 0

  constructor(private mount: HTMLDivElement) {
    const W = window.innerWidth, H = window.innerHeight

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(W, H)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.4
    mount.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0d0f1a)
    this.scene.fog = new THREE.FogExp2(0x0d0f1a, 0.016)

    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200)
    this.camera.position.set(0, 18, 12)
    this.camera.lookAt(0, 0, 0)

    this.initLights()
  }

  private initLights() {
    this.scene.add(new THREE.AmbientLight(0x3a4a66, 6.0))

    this.dirLight = new THREE.DirectionalLight(0xc8e0ff, 5.0)
    this.dirLight.position.set(8, 20, 8)
    this.dirLight.castShadow = true
    this.dirLight.shadow.mapSize.set(1024, 1024)
    this.dirLight.shadow.camera.near = 0.5
    this.dirLight.shadow.camera.far = 80
    this.dirLight.shadow.camera.left = -30
    this.dirLight.shadow.camera.right = 30
    this.dirLight.shadow.camera.top = 30
    this.dirLight.shadow.camera.bottom = -30
    this.dirLight.shadow.bias = -0.001
    this.scene.add(this.dirLight)

    const fillLight = new THREE.DirectionalLight(0xff8844, 2.2)
    fillLight.position.set(-10, 10, -5)
    this.scene.add(fillLight)

    for (const [x, y, z] of [[-12, 5, -12], [12, 5, 12], [-12, 5, 12], [12, 5, -12]] as const) {
      const pl = new THREE.PointLight(0xff6622, 4.5, 32)
      pl.position.set(x, y, z)
      this.scene.add(pl)
      this.flickerLights.push(pl)
    }
  }

  onWheel(e: WheelEvent) {
    e.preventDefault()
    this.zoomScale = Math.max(0.3, Math.min(5.0, this.zoomScale + e.deltaY * 0.001))
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  update(delta: number, t: number, charPos: THREE.Vector3, screenShakeTimer: number) {
    const CB = 22
    const tlx = Math.max(-CB, Math.min(CB, charPos.x))
    const tlz = Math.max(-CB, Math.min(CB, charPos.z))
    const lerpT = Math.min(1, 10 * delta)
    this.camLookX += (tlx - this.camLookX) * lerpT
    this.camLookZ += (tlz - this.camLookZ) * lerpT

    // sine 감쇠 셰이크 — 자연스럽게 흔들리다 사라짐 (random 방식 대체)
    let shakeX = 0, shakeZ = 0
    if (screenShakeTimer > 0) {
      const env = screenShakeTimer * 0.5          // 강도 envelope (timer와 함께 감쇠)
      shakeX = Math.sin(t * 58) * env * 0.9       // 주파수 58 rad/s
      shakeZ = Math.sin(t * 42 + 1.3) * env * 0.6 // 위상 오프셋으로 X/Z 독립
    }

    this.camera.position.x = this.camLookX + shakeX
    this.camera.position.y = 18 * this.zoomScale
    this.camera.position.z = this.camLookZ + 12 * this.zoomScale + shakeZ
    this.camera.lookAt(this.camLookX, 0, this.camLookZ)

    this.dirLight.position.set(this.camLookX + 8, 20, this.camLookZ + 8)
    this.dirLight.target.position.set(this.camLookX, 0, this.camLookZ)
    this.dirLight.target.updateMatrixWorld()

    this.flickerLights.forEach((light, i) => {
      light.intensity = Math.max(0,
        3.5 + Math.sin(t * 2.8 + i * 1.37) * 1.2 +
        (Math.random() < 0.015 ? -(1.5 + Math.random() * 1.5) : 0)
      )
    })
  }

  dispose() {
    this.renderer.dispose()
    if (this.mount.contains(this.renderer.domElement))
      this.mount.removeChild(this.renderer.domElement)
  }
}
