import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import enemyHitUrl   from '@assets/sound/enemy_hit.mp3?url'
import grrrrUrl      from '@assets/sound/Grrrr.wav?url'
import enemyDeathUrl from '@assets/sound/enemy_death.mp3?url'
import bangUrl       from '@assets/sound/bang.mp3?url'
import {
  enemy2IdleFbxPromise, enemy2RunFbxPromise,
  enemy2AttackFbxPromise, enemy2DeathFbxPromise,
  fireballFbxPromise,
} from '../../ui/preloader'
import type { EnemyData } from '../shared/types'
import type { EffectSystem } from '../fx/EffectSystem'
import type { AudioManager } from '../audio/AudioManager'
import {
  ENEMY2_HP, ENEMY2_DETECT_RANGE, ENEMY2_ATTACK_RANGE,
  ENEMY2_MIN_DIST, ENEMY2_MOVE_SPEED,
  ENEMY2_ATTACK_INTERVAL, ENEMY2_FIRE_DELAY,
  FIREBALL_DMG, FIREBALL_SPEED, FIREBALL_HIT_RADIUS, FIREBALL_MAX_AGE,
} from '../shared/constants'

// ── 파이어볼 풀 엔트리 ─────────────────────────────────────────────────────
interface FbPoolEntry {
  mesh:   THREE.Object3D
  mixer:  THREE.AnimationMixer | null
  action: THREE.AnimationAction | null
  light:  THREE.PointLight
  inUse:  boolean
}

// ── 활성 파이어볼 인스턴스 ─────────────────────────────────────────────────
interface FireballInstance {
  mesh:     THREE.Object3D
  mixer:    THREE.AnimationMixer | null
  light:    THREE.PointLight
  vel:      THREE.Vector3
  age:      number
  hitDealt: boolean
  poolIdx:  number
}

const FB_POOL_SIZE = 10   // 동시 최대 파이어볼 수 (적 7마리 × 여유)

export class Enemy2Manager {
  enemies:  EnemyData[] = []

  private baseGroup:  THREE.Group | null = null
  private idleClip:   THREE.AnimationClip | null = null
  private runClip:    THREE.AnimationClip | null = null
  private attackClip: THREE.AnimationClip | null = null
  private deathClip:  THREE.AnimationClip | null = null

  private fireballBase: THREE.Group | null = null
  private fireballs:    FireballInstance[] = []

  // ── 파이어볼 오브젝트 풀 ────────────────────────────────────────────────
  private fbPool:   FbPoolEntry[] = []
  private fbFree:   number[]      = []   // 사용 가능한 인덱스 스택

  constructor(
    private scene:        THREE.Scene,
    private getCharacter: () => THREE.Group,
    private fx:           EffectSystem,
    private audio:        AudioManager,
    private damagePlayer: (amount: number) => void,
    private spawnDmgNum:  (pos: THREE.Vector3, amount: number, isPlayer: boolean) => void,
    private isMounted:    () => boolean,
  ) {
    this.loadFBXs()
  }

  // ── 로딩 ────────────────────────────────────────────────────────────
  private loadFBXs() {
    enemy2IdleFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.baseGroup = fbx
      if (fbx.animations.length > 0) this.idleClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy2] idle:', e))

    enemy2RunFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.runClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy2] run:', e))

    enemy2AttackFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.attackClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy2] attack:', e))

    enemy2DeathFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.deathClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy2] death:', e))

    fireballFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.fireballBase = fbx
      this.initFireballPool()   // 로드 즉시 풀 생성 → renderer.compile() 전에 씬에 추가
    }).catch(e => console.error('[Enemy2] fireball:', e))
  }

  // ── 파이어볼 풀 초기화 (씬에 미리 추가, visible=false) ─────────────────
  initFireballPool() {
    if (this.fbPool.length > 0 || !this.fireballBase) return

    for (let i = 0; i < FB_POOL_SIZE; i++) {
      const mesh = SkeletonUtils.clone(this.fireballBase) as THREE.Group
      mesh.scale.setScalar(0.008)
      mesh.visible = false
      mesh.position.set(0, -9999, 0)
      mesh.traverse((c: THREE.Object3D) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).frustumCulled = false
      })
      this.scene.add(mesh)

      let mixer: THREE.AnimationMixer | null = null
      let action: THREE.AnimationAction | null = null
      if (this.fireballBase.animations?.length > 0) {
        mixer  = new THREE.AnimationMixer(mesh as THREE.Group)
        action = mixer.clipAction(this.fireballBase.animations[0])
        action.play()
      }

      const light = new THREE.PointLight(0xff4400, 0, 8)
      light.position.set(0, -9999, 0)
      this.scene.add(light)

      this.fbPool.push({ mesh, mixer, action, light, inUse: false })
      this.fbFree.push(i)
    }
  }

  private acquireFireball(x: number, y: number, z: number): { mesh: THREE.Object3D; mixer: THREE.AnimationMixer | null; light: THREE.PointLight; poolIdx: number } | null {
    if (this.fbFree.length === 0) return null
    const idx   = this.fbFree.pop()!
    const entry = this.fbPool[idx]
    entry.inUse = true
    // 위치 + 가시성 초기화
    entry.mesh.position.set(x, y, z)
    entry.mesh.rotation.set(0, 0, 0)
    entry.mesh.visible = true
    entry.light.position.set(x, y, z)
    entry.light.intensity = 6
    // 애니메이션 재시작
    if (entry.action) entry.action.reset().play()
    return { mesh: entry.mesh, mixer: entry.mixer, light: entry.light, poolIdx: idx }
  }

  private releaseFireball(poolIdx: number) {
    const entry = this.fbPool[poolIdx]
    if (!entry) return
    entry.inUse         = false
    entry.mesh.visible  = false
    entry.mesh.position.set(0, -9999, 0)
    entry.light.intensity = 0
    entry.light.position.set(0, -9999, 0)
    this.fbFree.push(poolIdx)
  }

  // ── 스폰 ─────────────────────────────────────────────────────────────
  private trySpawn() {
    if (!this.baseGroup || !this.idleClip || !this.runClip || !this.attackClip || !this.deathClip) return
    if (this.enemies.length > 0) return

    const positions: [number, number][] = [
      [0, -18], [18, 0], [0, 18], [-18, 0],
      [13, 13], [-13, 13], [13, -13],
    ]

    for (const [sx, sz] of positions) {
      const group = SkeletonUtils.clone(this.baseGroup) as THREE.Group
      group.scale.setScalar(0.02)
      group.position.set(sx + (Math.random() - 0.5) * 3, 0, sz + (Math.random() - 0.5) * 3)
      group.traverse((c: THREE.Object3D) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true; c.receiveShadow = true
          ;(c as THREE.Mesh).frustumCulled = false
        }
      })
      this.scene.add(group)

      const mixer        = new THREE.AnimationMixer(group)
      const idleAction   = mixer.clipAction(this.idleClip!)
      const runAction    = mixer.clipAction(this.runClip!)
      const attackAction = mixer.clipAction(this.attackClip!)
      const deathAction  = mixer.clipAction(this.deathClip!)
      runAction.timeScale    = 1.5
      attackAction.timeScale = 1.2
      attackAction.loop = THREE.LoopOnce; attackAction.clampWhenFinished = true
      deathAction.loop  = THREE.LoopOnce; deathAction.clampWhenFinished = true
      idleAction.play()

      // 원거리 적은 사거리 표시 없음 — EnemyData 인터페이스 호환용 더미
      const ring = new THREE.Mesh()

      this.enemies.push({
        group, mixer, idleAction, runAction, attackAction, deathAction,
        state: 'idle', hp: ENEMY2_HP, attackTimer: 0,
        attackRing: ring, isDead: false, hitFlash: 0,
        attackHitDealt: false, deathTimer: 0,
        knockbackVel: new THREE.Vector3(),
        stunTimer: 0,
      })
    }
  }

  // ── 데미지 ───────────────────────────────────────────────────────────
  damageEnemy(enemy: EnemyData, amount: number) {
    if (enemy.isDead) return
    enemy.hp -= amount
    this.spawnDmgNum(enemy.group.position, amount, false)
    this.fx.spawnHit(enemy.group.position)
    enemy.hitFlash = 0.15
    this.setMaterial(enemy.group, 0xff4444)
    if (enemy.hp <= 0) {
      enemy.isDead = true
      this.setState(enemy, 'death')
      enemy.deathTimer = 3
      this.audio.playSound(enemyDeathUrl, 0.7)
    } else {
      this.audio.playSound(enemyHitUrl, 0.6)
    }
  }

  // ── 상태 머신 ─────────────────────────────────────────────────────────
  private setState(enemy: EnemyData, state: EnemyData['state']) {
    if (enemy.state === state) return
    const prev = enemy.state
    enemy.state = state
    enemy.mixer.stopAllAction()
    enemy.attackRing.visible = false
    enemy.attackTimer    = 0
    enemy.attackHitDealt = false

    if (state === 'idle') {
      enemy.idleAction.reset().play()
    } else if (state === 'run') {
      enemy.runAction.reset().play()
      if (prev === 'idle') this.audio.playSound(grrrrUrl, 0.5)
    } else if (state === 'attack') {
      enemy.attackAction.reset().play()
      enemy.attackRing.visible = true
    } else if (state === 'death') {
      enemy.deathAction.reset().play()
    }
  }

  private setMaterial(group: THREE.Group, color: number | null) {
    group.traverse((c: THREE.Object3D) => {
      const m = c as THREE.Mesh
      if (m.isMesh && m.material) {
        const mat = m.material as THREE.MeshPhongMaterial
        if (mat.emissive) mat.emissive.setHex(color ?? 0x000000)
      }
    })
  }

  // ── 파이어볼 스폰 (풀에서 취득) ───────────────────────────────────────
  private spawnFireball(from: THREE.Vector3, to: THREE.Vector3) {
    const spawnY  = from.y + 1.4
    const acquired = this.acquireFireball(from.x, spawnY, from.z)
    if (!acquired) return   // 풀 소진 시 무시

    const { mesh, mixer: fbMixer, light, poolIdx } = acquired
    light.color.setHex(0xff4400)
    light.distance = 8

    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize()
    const vel = dir.multiplyScalar(FIREBALL_SPEED)

    this.fireballs.push({ mesh, mixer: fbMixer, light, vel, age: 0, hitDealt: false, poolIdx })
    this.audio.playSound(bangUrl, 0.35)
  }

  // ── 메인 업데이트 ─────────────────────────────────────────────────────
  update(delta: number) {
    const char = this.getCharacter()
    const px = char.position.x, pz = char.position.z

    // ── 적 AI ──
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        if (enemy.deathTimer > 0) {
          enemy.deathTimer -= delta
          if (enemy.deathTimer <= 0) {
            this.scene.remove(enemy.group)
            this.scene.remove(enemy.attackRing)
          }
        }
        enemy.mixer.update(delta)
        continue
      }

      // 녹백 적용 및 감쇠
      if (enemy.knockbackVel.lengthSq() > 0.01) {
        enemy.group.position.addScaledVector(enemy.knockbackVel, delta)
        enemy.knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 8))
      }

      // 기절 처리 — AI 정지 + 노란 플래시
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= delta
        this.setMaterial(enemy.group, 0xffff00)
        if (enemy.stunTimer <= 0)
          this.setMaterial(enemy.group, enemy.hitFlash > 0 ? 0xff4444 : null)
        enemy.mixer.update(delta)
        continue
      }

      const ex = enemy.group.position.x, ez = enemy.group.position.z
      const dx = px - ex, dz = pz - ez
      const dist = Math.sqrt(dx * dx + dz * dz)

      // ── 상태 전이 ──
      if (enemy.state !== 'attack' && enemy.state !== 'death') {
        if (dist <= ENEMY2_ATTACK_RANGE) {
          this.setState(enemy, 'attack')
        } else if (dist <= ENEMY2_DETECT_RANGE) {
          if (enemy.state !== 'run') this.setState(enemy, 'run')
        } else {
          if (enemy.state !== 'idle') this.setState(enemy, 'idle')
        }
      } else if (enemy.state === 'attack' && dist > ENEMY2_ATTACK_RANGE) {
        if (dist <= ENEMY2_DETECT_RANGE) this.setState(enemy, 'run')
        else this.setState(enemy, 'idle')
      }

      // ── 이동 로직 ──
      if (enemy.state === 'run' && dist > 0.1) {
        enemy.group.position.x += (dx / dist) * ENEMY2_MOVE_SPEED * delta
        enemy.group.position.z += (dz / dist) * ENEMY2_MOVE_SPEED * delta
        enemy.group.rotation.y = Math.atan2(dx, dz)
      } else if (enemy.state === 'attack') {
        enemy.group.rotation.y = Math.atan2(dx, dz)

        if (dist < ENEMY2_MIN_DIST && dist > 0.1) {
          enemy.group.position.x -= (dx / dist) * ENEMY2_MOVE_SPEED * 0.6 * delta
          enemy.group.position.z -= (dz / dist) * ENEMY2_MOVE_SPEED * 0.6 * delta
        }

        enemy.attackTimer += delta

        if (!enemy.attackHitDealt && enemy.attackTimer >= ENEMY2_FIRE_DELAY) {
          enemy.attackHitDealt = true
          this.spawnFireball(enemy.group.position.clone(), char.position.clone())
        }

        if (enemy.attackTimer >= ENEMY2_ATTACK_INTERVAL) {
          enemy.attackTimer    = 0
          enemy.attackHitDealt = false
          enemy.attackAction.reset().play()
        }
      }

      if (enemy.hitFlash > 0) {
        enemy.hitFlash -= delta
        if (enemy.hitFlash <= 0) this.setMaterial(enemy.group, null)
      }

      enemy.mixer.update(delta)
    }

    // ── 파이어볼 업데이트 ──
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i]
      fb.age += delta

      fb.mesh.position.addScaledVector(fb.vel, delta)
      fb.light.position.copy(fb.mesh.position)

      fb.mesh.rotation.y += delta * 4
      fb.mesh.rotation.z += delta * 2

      if (fb.mixer) fb.mixer.update(delta)

      if (!fb.hitDealt) {
        const cx = char.position.x, cz = char.position.z
        const ddx = fb.mesh.position.x - cx
        const ddz = fb.mesh.position.z - cz
        if (ddx * ddx + ddz * ddz <= FIREBALL_HIT_RADIUS * FIREBALL_HIT_RADIUS) {
          fb.hitDealt = true
          this.damagePlayer(FIREBALL_DMG)
          this.fx.spawnHitOnPos(fb.mesh.position.x, fb.mesh.position.z)
          this.fx.spawnRing(fb.mesh.position.x, fb.mesh.position.z, 0xff4400, 2.5, 0.3)
        }
      }

      // 수명 만료 또는 피격 → 풀 반환 (scene.remove 없음)
      if (fb.age >= FIREBALL_MAX_AGE || fb.hitDealt) {
        this.releaseFireball(fb.poolIdx)
        this.fireballs.splice(i, 1)
      }
    }
  }
}
