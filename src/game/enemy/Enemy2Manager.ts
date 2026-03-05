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
import { clampToZones, type WalkableZone } from '../stage/StageConfig'

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
  mesh:       THREE.Object3D
  mixer:      THREE.AnimationMixer | null
  light:      THREE.PointLight
  vel:        THREE.Vector3
  age:        number
  hitDealt:   boolean
  poolIdx:    number
  trailTimer: number   // 꼬리 파티클 간격 타이머
}

const FB_POOL_SIZE = 10   // 동시 최대 파이어볼 수 (적 7마리 × 여유)

export class Enemy2Manager {
  enemies:  EnemyData[] = []
  clipsReady = false
  onLastKill: (() => void) | null = null
  private _zones: WalkableZone[] | null = null

  setWalkableZones(zones: WalkableZone[]) { this._zones = zones }

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

  // ── 1자 궤도 선 메시 관리 (풀) ──────────────────────────────────────────
  private attackLineMeshes = new Map<EnemyData, THREE.Mesh>()
  /** 궤도 표시 시 저장한 발사 방향 (궤도와 실제 탄도 일치시키기) */
  private attackDirMap = new Map<EnemyData, THREE.Vector3>()
  private lineTimer = 0

  // ── 공유 지오메트리/머터리얼 (GPU 업로드 1회) ─────────────────────────
  private sharedLineGeo = new THREE.BoxGeometry(0.4, 0.1, 30)
  private sharedLineMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6 })
  private sharedDizzyGeo = new THREE.OctahedronGeometry(0.15)
  private sharedDizzyMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9 })

  constructor(
    private scene:        THREE.Scene,
    private getCharacter: () => THREE.Group,
    private fx:           EffectSystem,
    private audio:        AudioManager,
    private damagePlayer: (amount: number, knockDir?: THREE.Vector3, attackOrigin?: THREE.Vector3) => void,
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
      this.checkClipsReady()
    }).catch(e => console.error('[Enemy2] idle:', e))

    enemy2RunFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.runClip = fbx.animations[0]
      this.checkClipsReady()
    }).catch(e => console.error('[Enemy2] run:', e))

    enemy2AttackFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.attackClip = fbx.animations[0]
      this.checkClipsReady()
    }).catch(e => console.error('[Enemy2] attack:', e))

    enemy2DeathFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.deathClip = fbx.animations[0]
      this.checkClipsReady()
    }).catch(e => console.error('[Enemy2] death:', e))

    fireballFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.fireballBase = fbx
      this.initFireballPool()
    }).catch(e => console.error('[Enemy2] fireball:', e))
  }

  private checkClipsReady() {
    if (this.baseGroup && this.idleClip && this.runClip && this.attackClip && this.deathClip)
      this.clipsReady = true
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

  /** 지정 위치에 적 스폰 */
  spawnAt(positions: [number, number][]) {
    if (!this.clipsReady) return
    for (const [sx, sz] of positions) {
      const group = SkeletonUtils.clone(this.baseGroup!) as THREE.Group
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

      const ring = new THREE.Mesh()

      this.enemies.push({
        group, mixer, idleAction, runAction, attackAction, deathAction,
        state: 'idle', hp: ENEMY2_HP, attackTimer: 0,
        attackRing: ring, isDead: false, hitFlash: 0,
        attackHitDealt: false, deathTimer: 0,
        knockbackVel: new THREE.Vector3(),
        stunTimer: 0,
        hitStopTimer: 0,
        dizzyGroup: null,
      })
    }
  }

  /** 모든 적 + 파이어볼 정리 + GPU 리소스 해제 */
  clearAll() {
    for (const e of this.enemies) {
      this.scene.remove(e.group)
      this.scene.remove(e.attackRing)
      this.removeAttackLine(e)
      // cloned FBX mesh dispose
      e.group.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach(m => m.dispose())
          else if (mat) (mat as THREE.Material).dispose()
        }
      })
      e.mixer.stopAllAction()
      e.mixer.uncacheRoot(e.group)
    }
    this.enemies = []
    this.attackDirMap.clear()
    // 활성 파이어볼 해제
    for (const fb of this.fireballs) this.releaseFireball(fb.poolIdx)
    this.fireballs = []
  }

  // ── 데미지 ───────────────────────────────────────────────────────────
  damageEnemy(enemy: EnemyData, amount: number) {
    if (enemy.isDead) return
    enemy.hp -= amount
    this.spawnDmgNum(enemy.group.position, amount, false)
    this.fx.spawnHit(enemy.group.position)
    enemy.hitFlash = 0.15
    enemy.hitStopTimer = 0.08
    this.setMaterial(enemy.group, 0xff4444)
    if (enemy.hp <= 0) {
      enemy.isDead = true
      this.setState(enemy, 'death')
      enemy.deathTimer = 3
      this.fx.spawnDeathExplosion(enemy.group.position, false)
      this.audio.playSound(enemyDeathUrl, 0.7)
      const alive = this.enemies.filter(e => !e.isDead)
      if (alive.length === 0 && this.onLastKill) this.onLastKill()
    } else {
      this.audio.playSound(enemyHitUrl, 0.6)
    }
  }

  // ── 1자 궤도 선 헬퍼 ──────────────────────────────────────────────────
  private showAttackLine(enemy: EnemyData) {
    this.removeAttackLine(enemy)
    const char   = this.getCharacter()
    const ex     = enemy.group.position.x
    const ez     = enemy.group.position.z
    const dx     = char.position.x - ex
    const dz     = char.position.z - ez
    const len    = Math.sqrt(dx * dx + dz * dz)
    const angle  = Math.atan2(dx, dz)
    const lineLen = 30

    // 발사 방향 저장 (궤도 표시 시점의 방향 고정)
    if (len > 0.01) {
      this.attackDirMap.set(enemy, new THREE.Vector3(dx / len, 0, dz / len))
    }

    const mesh = new THREE.Mesh(this.sharedLineGeo, this.sharedLineMat.clone())
    mesh.rotation.y = angle
    mesh.position.set(
      ex + Math.sin(angle) * lineLen * 0.5,
      0.1,
      ez + Math.cos(angle) * lineLen * 0.5,
    )
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this.attackLineMeshes.set(enemy, mesh)
  }

  private removeAttackLine(enemy: EnemyData) {
    const mesh = this.attackLineMeshes.get(enemy)
    if (mesh) {
      this.scene.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()  // 클론된 material만 dispose
      this.attackLineMeshes.delete(enemy)
    }
  }

  private getAttackDir(enemy: EnemyData): THREE.Vector3 | null {
    return this.attackDirMap.get(enemy) ?? null
  }

  // ── 상태 머신 ─────────────────────────────────────────────────────────
  private setState(enemy: EnemyData, state: EnemyData['state']) {
    if (enemy.state === state) return
    const prev = enemy.state
    enemy.state = state
    enemy.attackRing.visible = false
    enemy.attackTimer    = 0
    enemy.attackHitDealt = false
    this.removeAttackLine(enemy)   // 상태 전환 시 궤도 선 제거

    const prevAction = prev === 'idle'   ? enemy.idleAction
                     : prev === 'run'    ? enemy.runAction
                     : prev === 'attack' ? enemy.attackAction
                     : prev === 'death'  ? enemy.deathAction
                     : null

    let nextAction: THREE.AnimationAction | null = null
    if (state === 'idle') {
      nextAction = enemy.idleAction
    } else if (state === 'run') {
      nextAction = enemy.runAction
      if (prev === 'idle') this.audio.playSound(grrrrUrl, 0.5)
    } else if (state === 'attack') {
      nextAction = enemy.attackAction
      this.showAttackLine(enemy)   // 공격 시작 시 1초 전 궤도 선 표시
    } else if (state === 'death') {
      nextAction = enemy.deathAction
    }

    if (nextAction) {
      nextAction.reset().play()
      if (prevAction && prevAction !== nextAction) {
        prevAction.crossFadeTo(nextAction, 0.15, true)
      }
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
  /** dir: 정규화된 발사 방향 */
  private spawnFireball(from: THREE.Vector3, dir: THREE.Vector3) {
    const spawnY  = from.y + 1.4
    const acquired = this.acquireFireball(from.x, spawnY, from.z)
    if (!acquired) return   // 풀 소진 시 무시

    const { mesh, mixer: fbMixer, light, poolIdx } = acquired
    light.color.setHex(0xff4400)
    light.distance = 8

    const vel = dir.clone().multiplyScalar(FIREBALL_SPEED)

    this.fireballs.push({ mesh, mixer: fbMixer, light, vel, age: 0, hitDealt: false, poolIdx, trailTimer: 0 })
    this.audio.playSound(bangUrl, 0.35)
  }

  // ── 메인 업데이트 ─────────────────────────────────────────────────────
  update(delta: number) {
    const char = this.getCharacter()
    const px = char.position.x, pz = char.position.z
    this.lineTimer += delta

    // ── 궤도 선 펄스 ──
    this.attackLineMeshes.forEach(mesh => {
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.4 + 0.25 * Math.abs(Math.sin(this.lineTimer * 8))
    })

    // ── 적 AI ──
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        if (enemy.deathTimer > 0) {
          enemy.deathTimer -= delta
          if (enemy.deathTimer <= 0) {
            this.scene.remove(enemy.group)
            this.scene.remove(enemy.attackRing)
            this.removeAttackLine(enemy)
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

      // 기절 처리 — AI 정지 + 노란 플래시 + 빙글빙글 별
      if (enemy.stunTimer > 0) {
        enemy.stunTimer -= delta
        this.setMaterial(enemy.group, 0xffff00)

        if (!enemy.dizzyGroup) {
          enemy.dizzyGroup = new THREE.Group()
          for (let si = 0; si < 4; si++) {
            const star = new THREE.Mesh(this.sharedDizzyGeo, this.sharedDizzyMat)
            const ang = (si / 4) * Math.PI * 2
            star.position.set(Math.cos(ang) * 0.5, 0, Math.sin(ang) * 0.5)
            enemy.dizzyGroup.add(star)
          }
          enemy.dizzyGroup.position.y = 2.5
          enemy.group.add(enemy.dizzyGroup)
        }
        enemy.dizzyGroup.rotation.y += delta * 6

        if (enemy.stunTimer <= 0) {
          this.setMaterial(enemy.group, enemy.hitFlash > 0 ? 0xff4444 : null)
          if (enemy.dizzyGroup) {
            enemy.group.remove(enemy.dizzyGroup)
            enemy.dizzyGroup = null
          }
        }
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
        if (this._zones) {
          const [cx, cz] = clampToZones(enemy.group.position.x, enemy.group.position.z, this._zones)
          enemy.group.position.x = cx; enemy.group.position.z = cz
        }
        enemy.group.rotation.y = Math.atan2(dx, dz)
      } else if (enemy.state === 'attack') {
        enemy.group.rotation.y = Math.atan2(dx, dz)

        if (dist < ENEMY2_MIN_DIST && dist > 0.1) {
          enemy.group.position.x -= (dx / dist) * ENEMY2_MOVE_SPEED * 0.6 * delta
          enemy.group.position.z -= (dz / dist) * ENEMY2_MOVE_SPEED * 0.6 * delta
          if (this._zones) {
            const [cx, cz] = clampToZones(enemy.group.position.x, enemy.group.position.z, this._zones)
            enemy.group.position.x = cx; enemy.group.position.z = cz
          }
        }

        enemy.attackTimer += delta

        if (!enemy.attackHitDealt && enemy.attackTimer >= ENEMY2_FIRE_DELAY) {
          enemy.attackHitDealt = true
          // 궤도 표시 시 저장한 방향으로 발사 (궤도 = 실제 탄도)
          const savedDir = this.getAttackDir(enemy)
          if (savedDir) {
            this.spawnFireball(enemy.group.position.clone(), savedDir)
          }
          this.removeAttackLine(enemy)   // 발사 시 궤도 선 제거
          this.attackDirMap.delete(enemy)
        }

        if (enemy.attackTimer >= ENEMY2_ATTACK_INTERVAL) {
          enemy.attackTimer    = 0
          enemy.attackHitDealt = false
          enemy.attackAction.reset().play()
          this.showAttackLine(enemy)     // 재공격 사이클 — 새 궤도 선 표시
        }
      }

      if (enemy.hitFlash > 0) {
        enemy.hitFlash -= delta
        if (enemy.hitFlash <= 0) this.setMaterial(enemy.group, null)
      }

      // 히트스톱
      if (enemy.hitStopTimer > 0) {
        enemy.hitStopTimer = Math.max(0, enemy.hitStopTimer - delta)
        enemy.mixer.update(0)
      } else {
        enemy.mixer.update(delta)
      }
    }

    // ── 파이어볼 업데이트 ──
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i]
      fb.age += delta

      fb.mesh.position.addScaledVector(fb.vel, delta)
      fb.light.position.copy(fb.mesh.position)

      fb.mesh.rotation.y += delta * 4
      fb.mesh.rotation.z += delta * 2

      // 꼬리 파티클 (0.05초 간격)
      fb.trailTimer += delta
      if (fb.trailTimer >= 0.05) {
        fb.trailTimer = 0
        this.fx.spawnTrailPuff(fb.mesh.position.x, fb.mesh.position.y, fb.mesh.position.z)
      }

      if (fb.mixer) fb.mixer.update(delta)

      if (!fb.hitDealt) {
        const cx = char.position.x, cz = char.position.z
        const ddx = fb.mesh.position.x - cx
        const ddz = fb.mesh.position.z - cz
        if (ddx * ddx + ddz * ddz <= FIREBALL_HIT_RADIUS * FIREBALL_HIT_RADIUS) {
          fb.hitDealt = true
          // 파이어볼 진행 방향으로 넉백
          const knockDir = fb.vel.clone().normalize()
          this.damagePlayer(FIREBALL_DMG, knockDir, fb.mesh.position.clone())
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
