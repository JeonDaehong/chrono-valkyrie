import * as THREE from 'three'
import { STAGES, type StageDefinition } from './StageConfig'
import { Portal } from './Portal'
import { buildWakeupRoom, buildAlleyL, buildAlleyReverse, buildPlaza, buildCoreLab, type MapBuildResult } from '../world/MapBuilder'
import type { WorldManager } from '../world/WorldManager'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerAnimation } from '../player/PlayerAnimation'
import type { EnemyManager } from '../enemy/EnemyManager'
import type { Enemy2Manager } from '../enemy/Enemy2Manager'
import type { BossManager } from '../enemy/BossManager'
import type { EffectSystem } from '../fx/EffectSystem'
import type { HUD } from '../ui/HUD'

const MAP_BUILDERS: Record<StageDefinition['mapType'], (scene: THREE.Scene) => THREE.Object3D[] | MapBuildResult> = {
  wakeup:       buildWakeupRoom,
  alleyL:       buildAlleyL,
  alleyReverse: buildAlleyReverse,
  plaza:        buildPlaza,
  coreLab:      buildCoreLab,
}

export class StageManager {
  currentStage = 0
  private portal: Portal | null = null
  private stageObjects: THREE.Object3D[] = []
  private destructibles: THREE.Object3D[] = []
  private fadeOverlay: HTMLDivElement

  // 웨이브 진행
  private waveIndex = 0
  private waveTimer = 0
  private wavesComplete = false
  private waveStarted = false  // 현재 웨이브가 스폰됐는지

  // 전환 중 플래그
  private transitioning = false

  // 승리 상태
  private victoryShown = false

  constructor(
    private scene: THREE.Scene,
    private world: WorldManager,
    private controller: PlayerController,
    private playerAnim: PlayerAnimation,
    private enemyManager: EnemyManager,
    private enemy2Manager: Enemy2Manager,
    private bossManager: BossManager,
    private fx: EffectSystem,
    private hud: HUD,
    private mount: HTMLDivElement,
    private resetPlayerHP: () => void,
  ) {
    this.fadeOverlay = this.createFadeOverlay()
  }

  // ── 스테이지 로드 ──────────────────────────────────────────────────
  loadStage(stageId: number) {
    this.currentStage = stageId
    const stage = STAGES[stageId]
    if (!stage) return

    // 맵 빌드
    const builder = MAP_BUILDERS[stage.mapType]
    const result = builder(this.scene)
    if (Array.isArray(result)) {
      this.stageObjects = result
      this.destructibles = []
    } else {
      this.stageObjects = result.allObjects
      this.destructibles = result.destructibles
    }

    // 워커블 존 + 바운더리 설정
    this.controller.setWalkableZones(stage.walkableZones)
    this.enemyManager.setWalkableZones(stage.walkableZones)
    this.enemy2Manager.setWalkableZones(stage.walkableZones)
    // cameraBound = 워커블 존 전체를 포함하는 범위 자동 계산
    let maxCoord = 0
    for (const [minX, maxX, minZ, maxZ] of stage.walkableZones) {
      maxCoord = Math.max(maxCoord, Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ))
    }
    this.world.cameraBound = Math.max(4, maxCoord - 4)
    this.bossManager.setBoundary(maxCoord)

    // 플레이어 위치
    this.controller.character.position.set(stage.playerSpawn[0], 0, stage.playerSpawn[1])
    this.controller.moveTarget = null
    this.controller.knockbackVel.set(0, 0, 0)

    // 웨이브 초기화
    this.waveIndex = 0
    this.waveTimer = 0
    this.wavesComplete = stage.waves.length === 0
    this.waveStarted = false
    this.victoryShown = false

    // 첫 웨이브 즉시 스폰 (적이 있을 경우)
    if (stage.waves.length > 0) {
      this.spawnWave(stage.waves[0])
      this.waveStarted = true
    }

    // 포탈 생성 (비활성 상태)
    if (stage.portal) {
      this.portal = new Portal(this.scene, stage.portal.position[0], stage.portal.position[1])
      // 적이 없는 스테이지는 즉시 활성화
      if (this.wavesComplete) this.portal.activate()
    }
  }

  // ── 업데이트 (매 프레임) ───────────────────────────────────────────
  update(delta: number) {
    if (this.transitioning) return
    const stage = STAGES[this.currentStage]
    if (!stage) return

    // 웨이브 진행
    if (!this.wavesComplete) {
      this.updateWaves(delta, stage)
    }

    // 모든 웨이브 완료 후
    if (this.wavesComplete) {
      if (stage.spawnBoss) {
        // 보스 스폰
        this.bossManager.trySpawnIfReady(this.enemyManager.enemies, this.enemy2Manager.enemies)
        // 보스 사망 → 승리
        if (this.bossManager.isBossDead && !this.victoryShown) {
          this.victoryShown = true
          this.showVictory()
        }
      } else if (stage.portal && this.portal && !this.portal.active) {
        // 포탈 활성화
        this.portal.activate()
      }
    }

    // 포탈 업데이트 + 충돌
    if (this.portal) {
      this.portal.update(delta)
      if (this.portal.checkCollision(this.controller.character.position)) {
        const nextId = this.currentStage + 1
        if (nextId < STAGES.length) {
          this.transitionTo(nextId)
        }
      }
    }
  }

  // ── 웨이브 진행 로직 ───────────────────────────────────────────────
  private updateWaves(delta: number, stage: StageDefinition) {
    // 현재 웨이브가 아직 스폰 안 됨 (딜레이 대기)
    if (!this.waveStarted) {
      this.waveTimer -= delta
      if (this.waveTimer <= 0) {
        this.spawnWave(stage.waves[this.waveIndex])
        this.waveStarted = true
      }
      return
    }

    // 현재 웨이브 적 전멸 확인
    const allDead =
      this.enemyManager.enemies.every(e => e.isDead) &&
      this.enemy2Manager.enemies.every(e => e.isDead)

    if (!allDead) return

    // 다음 웨이브로 진행
    this.waveIndex++
    if (this.waveIndex >= stage.waves.length) {
      this.wavesComplete = true
      return
    }

    const nextWave = stage.waves[this.waveIndex]
    this.waveTimer = nextWave.delay ?? 0
    this.waveStarted = this.waveTimer <= 0
    if (this.waveStarted) {
      this.spawnWave(nextWave)
    }
  }

  // ── 웨이브 스폰 ───────────────────────────────────────────────────
  private spawnWave(wave: { enemies: { type: 'melee' | 'ranged'; position: [number, number] }[] }) {
    const meleePositions: [number, number][] = []
    const rangedPositions: [number, number][] = []

    for (const e of wave.enemies) {
      if (e.type === 'melee') meleePositions.push(e.position)
      else rangedPositions.push(e.position)
    }

    if (meleePositions.length > 0) this.enemyManager.spawnAt(meleePositions)
    if (rangedPositions.length > 0) this.enemy2Manager.spawnAt(rangedPositions)
  }

  // ── 스테이지 전환 ──────────────────────────────────────────────────
  private async transitionTo(nextStage: number) {
    if (this.transitioning) return
    this.transitioning = true

    await this.fadeOut()
    // 로딩 텍스트 표시
    this.loadingText.style.opacity = '1'
    // 1프레임 양보 → 브라우저가 로딩 텍스트 렌더링 후 무거운 작업 수행
    await new Promise(r => requestAnimationFrame(r))
    this.clearStage()
    this.resetPlayerHP()
    this.loadStage(nextStage)
    // 워밍업 렌더 (fadeOverlay가 화면을 가리는 동안)
    this.world.renderer.render(this.scene, this.world.camera)
    this.loadingText.style.opacity = '0'
    await this.fadeIn()

    this.transitioning = false
  }

  // ── 씬 정리 ────────────────────────────────────────────────────────
  private clearStage() {
    // 맵 오브젝트 제거 + dispose
    for (const obj of this.stageObjects) {
      this.scene.remove(obj)
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
        // per-call material만 dispose (모듈 레벨 공유 material은 유지)
        if (mesh.material) {
          const mat = mesh.material as THREE.Material
          if (mat.userData?.perCall) mat.dispose()
        }
      }
    }
    this.stageObjects = []

    // 적 제거
    this.enemyManager.clearAll()
    this.enemy2Manager.clearAll()
    this.bossManager.reset()

    // 포탈 제거
    if (this.portal) {
      this.portal.dispose()
      this.portal = null
    }
  }

  // ── 승리 화면 ──────────────────────────────────────────────────────
  private showVictory() {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 300;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7);
      opacity: 0; transition: opacity 1s ease;
      pointer-events: all;
    `
    overlay.innerHTML = `
      <div style="text-align:center; color: #00ffcc; font-family: sans-serif;">
        <h1 style="font-size: 48px; margin-bottom: 16px; text-shadow: 0 0 30px #00ffcc;">VICTORY</h1>
        <p style="font-size: 18px; color: #aaa;">연구소를 점령했습니다</p>
      </div>
    `
    this.mount.appendChild(overlay)
    requestAnimationFrame(() => { overlay.style.opacity = '1' })
  }

  // ── 페이드 ─────────────────────────────────────────────────────────
  private loadingText!: HTMLDivElement

  private createFadeOverlay(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 200;
      background: black; opacity: 1;
      transition: opacity 0.5s ease;
      pointer-events: none;
      display: flex; align-items: center; justify-content: center;
    `

    this.loadingText = document.createElement('div')
    this.loadingText.style.cssText = `
      color: #00ccff; font-family: monospace; font-size: 18px;
      letter-spacing: 4px; opacity: 0; transition: opacity 0.3s;
      text-shadow: 0 0 12px #00aaff, 0 0 24px #0066ff;
    `
    this.loadingText.textContent = 'LOADING...'
    el.appendChild(this.loadingText)

    this.mount.appendChild(el)
    // 초기 페이드인
    requestAnimationFrame(() => { el.style.opacity = '0' })
    return el
  }

  private fadeOut(): Promise<void> {
    this.fadeOverlay.style.opacity = '1'
    this.fadeOverlay.style.pointerEvents = 'all'
    return new Promise(r => setTimeout(r, 600))
  }

  private fadeIn(): Promise<void> {
    this.fadeOverlay.style.opacity = '0'
    this.fadeOverlay.style.pointerEvents = 'none'
    return new Promise(r => setTimeout(r, 600))
  }

  /** 보스 각성기: 맵 오브젝트 count개를 파괴하고 위치 반환 */
  destroyTerrain(count: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = []
    const n = Math.min(count, this.destructibles.length)
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * this.destructibles.length)
      const obj = this.destructibles.splice(idx, 1)[0]
      positions.push(obj.position.clone())
      this.scene.remove(obj)
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
        if (mesh.material) {
          const mat = mesh.material as THREE.Material
          if (mat.userData?.perCall) mat.dispose()
        }
      }
      // stageObjects에서도 제거
      const si = this.stageObjects.indexOf(obj)
      if (si >= 0) this.stageObjects.splice(si, 1)
    }
    return positions
  }

  dispose() {
    this.clearStage()
    if (this.mount.contains(this.fadeOverlay))
      this.mount.removeChild(this.fadeOverlay)
  }
}
