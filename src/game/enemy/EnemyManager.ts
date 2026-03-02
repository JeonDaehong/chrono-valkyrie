import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import enemyHitUrl  from '@assets/sound/enemy_hit.mp3?url'
import grrrrUrl     from '@assets/sound/Grrrr.wav?url'
import enemyDeathUrl from '@assets/sound/enemy_death.mp3?url'
import {
  enemy1IdleFbxPromise, enemy1RunFbxPromise,
  enemy1AttackFbxPromise, enemy1DeathFbxPromise,
} from '../../ui/preloader'
import type { EnemyData } from '../shared/types'
import type { EffectSystem } from '../fx/EffectSystem'
import type { AudioManager } from '../audio/AudioManager'
import { ENEMY_HP, ENEMY_ATTACK_RANGE, ENEMY_DETECT_RANGE, ENEMY_ATTACK_DMG } from '../shared/constants'

export class EnemyManager {
  enemies: EnemyData[] = []

  private baseGroup:   THREE.Group | null = null
  private idleClip:    THREE.AnimationClip | null = null
  private runClip:     THREE.AnimationClip | null = null
  private attackClip:  THREE.AnimationClip | null = null
  private deathClip:   THREE.AnimationClip | null = null

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

  private loadFBXs() {
    enemy1IdleFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      this.baseGroup = fbx
      if (fbx.animations.length > 0) this.idleClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy] idle:', e))

    enemy1RunFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.runClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy] run:', e))

    enemy1AttackFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.attackClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy] attack:', e))

    enemy1DeathFbxPromise.then(fbx => {
      if (!this.isMounted()) return
      if (fbx.animations.length > 0) this.deathClip = fbx.animations[0]
      this.trySpawn()
    }).catch(e => console.error('[Enemy] death:', e))
  }

  private trySpawn() {
    if (!this.baseGroup || !this.idleClip || !this.runClip || !this.attackClip || !this.deathClip) return
    if (this.enemies.length > 0) return

    const positions: [number, number][] = [
      [-22, -22], [22, -22], [-22, 22], [22, 22],
      [0, -24], [0, 24], [-24, 0], [24, 0],
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

      const mixer       = new THREE.AnimationMixer(group)
      const idleAction  = mixer.clipAction(this.idleClip!)
      const runAction   = mixer.clipAction(this.runClip!)
      const attackAction = mixer.clipAction(this.attackClip!)
      const deathAction = mixer.clipAction(this.deathClip!)
      runAction.timeScale    = 1.5
      attackAction.timeScale = 1.5
      attackAction.loop = THREE.LoopOnce; attackAction.clampWhenFinished = true
      deathAction.loop  = THREE.LoopOnce; deathAction.clampWhenFinished = true
      idleAction.play()

      // 공격 범위 링
      const ringGeo = new THREE.RingGeometry(ENEMY_ATTACK_RANGE - 0.15, ENEMY_ATTACK_RANGE + 0.1, 48)
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      const ring    = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(sx, 0.05, sz)
      ring.visible = false
      this.scene.add(ring)

      this.enemies.push({
        group, mixer, idleAction, runAction, attackAction, deathAction,
        state: 'idle', hp: ENEMY_HP, attackTimer: 0,
        attackRing: ring, isDead: false, hitFlash: 0,
        attackHitDealt: false, deathTimer: 0,
        knockbackVel: new THREE.Vector3(),
        stunTimer: 0,
      })
    }
  }

  damageEnemy(enemy: EnemyData, amount: number) {
    if (enemy.isDead) return
    enemy.hp -= amount
    this.spawnDmgNum(enemy.group.position, amount, false)
    this.fx.spawnHit(enemy.group.position)
    enemy.hitFlash = 0.15
    this.setEnemyMaterial(enemy.group, 0xff4444)
    if (enemy.hp <= 0) {
      enemy.isDead = true
      this.setState(enemy, 'death')
      enemy.deathTimer = 3
      this.audio.playSound(enemyDeathUrl, 0.7)
    } else {
      this.audio.playSound(enemyHitUrl, 0.6)
    }
  }

  private setState(enemy: EnemyData, state: EnemyData['state']) {
    if (enemy.state === state) return
    const prevState = enemy.state
    enemy.state = state
    enemy.mixer.stopAllAction()
    enemy.attackRing.visible = false
    if (state === 'idle') {
      enemy.idleAction.reset().play()
    } else if (state === 'run') {
      enemy.runAction.reset().play()
      if (prevState === 'idle') this.audio.playSound(grrrrUrl, 0.7)
    } else if (state === 'attack') {
      enemy.attackAction.reset().play()
      enemy.attackRing.visible = true
      enemy.attackTimer = 0
      enemy.attackHitDealt = false
    } else if (state === 'death') {
      enemy.deathAction.reset().play()
    }
  }

  private setEnemyMaterial(group: THREE.Group, color: number | null) {
    group.traverse((c: THREE.Object3D) => {
      const m = c as THREE.Mesh
      if (m.isMesh && m.material) {
        const mat = m.material as THREE.MeshPhongMaterial
        if (mat.emissive) mat.emissive.setHex(color ?? 0x000000)
      }
    })
  }

  update(delta: number) {
    const char = this.getCharacter()
    const px = char.position.x, pz = char.position.z

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
        this.setEnemyMaterial(enemy.group, 0xffff00)
        if (enemy.stunTimer <= 0)
          this.setEnemyMaterial(enemy.group, enemy.hitFlash > 0 ? 0xff4444 : null)
        enemy.mixer.update(delta)
        continue
      }

      const ex = enemy.group.position.x, ez = enemy.group.position.z
      const dx = px - ex, dz = pz - ez
      const dist = Math.sqrt(dx * dx + dz * dz)
      enemy.attackRing.position.x = ex
      enemy.attackRing.position.z = ez

      if (enemy.state !== 'attack' && dist <= ENEMY_ATTACK_RANGE) {
        this.setState(enemy, 'attack')
      } else if (enemy.state === 'idle' && dist <= ENEMY_DETECT_RANGE) {
        this.setState(enemy, 'run')
      } else if (enemy.state === 'run' && dist > ENEMY_DETECT_RANGE) {
        this.setState(enemy, 'idle')
      }

      if (enemy.state === 'run' && dist > 0.1) {
        enemy.group.position.x += (dx / dist) * 5 * delta
        enemy.group.position.z += (dz / dist) * 5 * delta
        enemy.group.rotation.y = Math.atan2(dx, dz)
      } else if (enemy.state === 'attack') {
        enemy.group.rotation.y = Math.atan2(dx, dz)
        enemy.attackTimer += delta

        if (!enemy.attackHitDealt && enemy.attackTimer >= 0.65) {
          if (dist <= ENEMY_ATTACK_RANGE) {
            this.damagePlayer(ENEMY_ATTACK_DMG)
            this.fx.spawnSlash(char.position, Math.atan2(ex - px, ez - pz), 0xff3300, 1.1, 0.22)
            this.fx.spawnRing(char.position.x, char.position.z, 0xff2200, 3.0, 0.3)
            this.fx.spawnHitOnPos(char.position.x, char.position.z)
          }
          enemy.attackHitDealt = true
        }

        const atkDur = (this.attackClip?.duration ?? 1.0) / 1.5
        if (enemy.attackTimer >= atkDur) {
          if (dist <= ENEMY_ATTACK_RANGE) {
            enemy.attackAction.reset().play()
            enemy.attackTimer = 0
            enemy.attackHitDealt = false
          } else if (dist <= ENEMY_DETECT_RANGE) {
            this.setState(enemy, 'run')
          } else {
            this.setState(enemy, 'idle')
          }
        }
      }

      if (enemy.hitFlash > 0) {
        enemy.hitFlash -= delta
        if (enemy.hitFlash <= 0) this.setEnemyMaterial(enemy.group, null)
      }

      enemy.mixer.update(delta)
    }
  }
}
