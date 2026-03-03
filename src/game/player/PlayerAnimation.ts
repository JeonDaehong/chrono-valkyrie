import * as THREE from 'three'
import {
  idleGlbPromise, runGlbPromise, attackGlbPromise, qAttackGlbPromise,
  wAttackGlbPromise, eAttackGlbPromise,
} from '../../ui/preloader'

export class PlayerAnimation {
  /** 현재 캐릭터 메시 (처음엔 placeholder, GLB 로드 후 교체) */
  character: THREE.Group

  mesh: THREE.Group | null = null
  mixer: THREE.AnimationMixer | null = null
  idleAction:    THREE.AnimationAction | null = null
  runAction:     THREE.AnimationAction | null = null
  attackAction:  THREE.AnimationAction | null = null
  qAttackAction: THREE.AnimationAction | null = null
  wAttackAction: THREE.AnimationAction | null = null
  eAttackAction: THREE.AnimationAction | null = null
  currentAction: THREE.AnimationAction | null = null
  rootBones: THREE.Bone[] = []

  attackDuration  = 0
  qAttackDuration = 0
  wAttackDuration = 2.0  // fallback — 2nd hit at 1.8s 보장
  eAttackDuration = 0.8  // fallback

  private pendingRunClip:     THREE.AnimationClip | null = null
  private pendingAttackClip:  THREE.AnimationClip | null = null
  private pendingQAttackClip: THREE.AnimationClip | null = null
  private pendingWAttackClip: THREE.AnimationClip | null = null
  private pendingEAttackClip: THREE.AnimationClip | null = null

  private prevIsMoving = false
  hitStopTimer = 0   // >0이면 믹서 정지 (피격 시 타격감)

  constructor(private scene: THREE.Scene, private isMounted: () => boolean) {
    // Placeholder
    const phMat  = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.7 })
    const ph     = new THREE.Group()
    const body   = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10), phMat)
    body.position.y = 0.85; body.castShadow = true; ph.add(body)
    const head   = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), phMat)
    head.position.y = 1.65; head.castShadow = true; ph.add(head)
    scene.add(ph)
    this.character = ph

    this.loadGLBs()
  }

  private setupMesh(group: THREE.Group, scale: number) {
    group.scale.setScalar(scale)
    group.traverse((c: THREE.Object3D) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true; c.receiveShadow = true
        ;(c as THREE.Mesh).frustumCulled = false
      }
    })
  }

  switchAction(next: THREE.AnimationAction, fadeDur = 0.1) {
    if (this.currentAction === next) return
    next.reset().play()
    this.currentAction?.crossFadeTo(next, fadeDur, false)
    this.currentAction = next
  }

  private applyRunClip() {
    if (!this.mixer || !this.pendingRunClip) return
    this.runAction = this.mixer.clipAction(this.pendingRunClip)
    this.runAction.timeScale = 2
  }

  private applyAttackClip() {
    if (!this.mixer || !this.pendingAttackClip) return
    this.attackAction = this.mixer.clipAction(this.pendingAttackClip)
    this.attackAction.timeScale = 3
    this.attackAction.loop = THREE.LoopOnce
    this.attackAction.clampWhenFinished = true
    this.attackDuration = this.pendingAttackClip.duration / 3
  }

  private applyQAttackClip() {
    if (!this.mixer || !this.pendingQAttackClip) return
    this.qAttackAction = this.mixer.clipAction(this.pendingQAttackClip)
    this.qAttackAction.timeScale = 2
    this.qAttackAction.loop = THREE.LoopOnce
    this.qAttackAction.clampWhenFinished = true
    this.qAttackDuration = this.pendingQAttackClip.duration / 2
  }

  private applyWAttackClip() {
    if (!this.mixer || !this.pendingWAttackClip) return
    this.wAttackAction = this.mixer.clipAction(this.pendingWAttackClip)
    this.wAttackAction.timeScale = 1.0
    this.wAttackAction.loop = THREE.LoopOnce
    this.wAttackAction.clampWhenFinished = true
    this.wAttackDuration = Math.max(this.pendingWAttackClip.duration, 2.0)
  }

  private applyEAttackClip() {
    if (!this.mixer || !this.pendingEAttackClip) return
    this.eAttackAction = this.mixer.clipAction(this.pendingEAttackClip)
    this.eAttackAction.timeScale = 1.5
    this.eAttackAction.loop = THREE.LoopOnce
    this.eAttackAction.clampWhenFinished = true
    this.eAttackDuration = Math.max(this.pendingEAttackClip.duration / 1.5, 0.6)
  }

  private loadGLBs() {
    const placeholder = this.character

    idleGlbPromise.then(({ group, animations }) => {
      if (!this.isMounted()) return
      this.setupMesh(group, 1)
      group.position.y = 0
      group.position.x = this.character.position.x
      group.position.z = this.character.position.z
      group.rotation.y = this.character.rotation.y

      this.mesh  = group
      this.mixer = new THREE.AnimationMixer(group)

      group.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Bone).isBone) {
          const n    = child.name.toLowerCase()
          const part = n.includes('|') ? n.split('|').pop()! : n
          if (n.includes('hips') || n.includes('pelvis') || part.startsWith('root'))
            this.rootBones.push(child as THREE.Bone)
        }
      })

      if (animations.length > 0) {
        this.idleAction = this.mixer.clipAction(animations[0])
        this.idleAction.play()
        this.currentAction = this.idleAction
      }

      this.applyRunClip(); this.applyAttackClip(); this.applyQAttackClip()
      this.applyWAttackClip(); this.applyEAttackClip()
      this.scene.remove(placeholder)
      this.scene.add(group)
      this.character = group
    }).catch(err => console.error('[GLB] idle 실패:', err))

    runGlbPromise.then(({ animations }) => {
      if (!this.isMounted()) return
      if (animations.length > 0) { this.pendingRunClip = animations[0]; this.applyRunClip() }
    }).catch(err => console.error('[GLB] run 실패:', err))

    attackGlbPromise.then(({ animations }) => {
      if (!this.isMounted()) return
      if (animations.length > 0) { this.pendingAttackClip = animations[0]; this.applyAttackClip() }
    }).catch(err => console.error('[GLB] attack 실패:', err))

    qAttackGlbPromise.then(({ animations }) => {
      if (!this.isMounted()) return
      if (animations.length > 0) { this.pendingQAttackClip = animations[0]; this.applyQAttackClip() }
    }).catch(err => console.error('[GLB] q_attack 실패:', err))

    wAttackGlbPromise.then(({ animations }) => {
      if (!this.isMounted()) return
      if (animations.length > 0) { this.pendingWAttackClip = animations[0]; this.applyWAttackClip() }
    }).catch(err => console.error('[GLB] w_attack 실패:', err))

    eAttackGlbPromise.then(({ animations }) => {
      if (!this.isMounted()) return
      if (animations.length > 0) { this.pendingEAttackClip = animations[0]; this.applyEAttackClip() }
    }).catch(err => console.error('[GLB] e_attack 실패:', err))
  }

  /** idle ↔ run 자동 전환 (공격 중에는 호출하지 않을 것) */
  syncMovementAnim(isMoving: boolean) {
    if (isMoving === this.prevIsMoving) return
    this.prevIsMoving = isMoving
    if (isMoving && this.runAction) this.switchAction(this.runAction)
    else if (!isMoving && this.idleAction) this.switchAction(this.idleAction)
  }

  /** Q 스킬 시 손 아이템 좌우 교환 */
  swapHandItems() {
    if (!this.mesh) return
    const fingerKw = ['thumb', 'index', 'middle', 'ring', 'pinky', 'finger']
    let rightHand: THREE.Object3D | null = null
    let leftHand:  THREE.Object3D | null = null
    this.mesh.traverse((obj) => {
      const n = obj.name.toLowerCase()
      if (fingerKw.some(k => n.includes(k))) return
      if (!rightHand && n.includes('hand') && (n.includes('right') || n.endsWith('_r') || n.endsWith('.r'))) rightHand = obj
      if (!leftHand  && n.includes('hand') && (n.includes('left')  || n.endsWith('_l') || n.endsWith('.l'))) leftHand  = obj
    })
    if (!rightHand || !leftHand) { console.warn('[Q] hand bones not found'); return }
    const rh = rightHand as THREE.Object3D
    const lh = leftHand  as THREE.Object3D
    const rItems = [...rh.children.filter((c: THREE.Object3D) => !(c instanceof THREE.Bone))]
    const lItems = [...lh.children.filter((c: THREE.Object3D) => !(c instanceof THREE.Bone))]
    rItems.forEach(c => lh.add(c))
    lItems.forEach(c => rh.add(c))
  }

  /** 오른손 아이템(검) 가시성 설정 — W 스킬 중 방패만 보이게 */
  setRightHandVisible(visible: boolean) {
    if (!this.mesh) return
    const fingerKw = ['thumb', 'index', 'middle', 'ring', 'pinky', 'finger']
    this.mesh.traverse((obj) => {
      const n = obj.name.toLowerCase()
      if (fingerKw.some(k => n.includes(k))) return
      if (n.includes('hand') && (n.includes('right') || n.endsWith('_r') || n.endsWith('.r'))) {
        obj.children
          .filter(c => !(c instanceof THREE.Bone))
          .forEach(c => { c.visible = visible })
      }
    })
  }

  /** emissive 색상 설정 (피격 플래시) */
  setEmissive(color: number | null) {
    if (!this.mesh) return
    this.mesh.traverse((c: THREE.Object3D) => {
      const m = c as THREE.Mesh
      if (m.isMesh && m.material) {
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat.emissive) mat.emissive.setHex(color ?? 0x000000)
      }
    })
  }

  /** 피격 히트스톱 트리거 */
  triggerHitStop(duration: number) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration)
  }

  /** 믹서 업데이트 + 루트모션 핀 */
  update(delta: number) {
    if (!this.mixer) return
    const prevPos = this.character.position.clone()

    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - delta)
      this.mixer.update(0)   // 애니메이션 정지
    } else {
      this.mixer.update(delta)
    }

    for (const bone of this.rootBones) { bone.position.x = 0; bone.position.y = 0 }
    this.character.position.copy(prevPos)
  }
}
