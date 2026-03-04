import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import main1Url     from '@assets/sound/bgm_1.mp3?url'
import playerHitUrl from '@assets/sound/player_hit.mp3?url'
import {
  idleGlbPromise, runGlbPromise, attackGlbPromise, qAttackGlbPromise,
  wAttackGlbPromise, eAttackGlbPromise,
  enemy1IdleFbxPromise, enemy1RunFbxPromise, enemy1AttackFbxPromise, enemy1DeathFbxPromise,
  enemy2IdleFbxPromise, enemy2RunFbxPromise, enemy2AttackFbxPromise, enemy2DeathFbxPromise,
  fireballFbxPromise,
  boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
  boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
} from './preloader'

import { WorldManager }    from '../game/world/WorldManager'
import { StageManager }    from '../game/stage/StageManager'
import { AudioManager }    from '../game/audio/AudioManager'
import { HUD }             from '../game/ui/HUD'
import { EffectSystem }    from '../game/fx/EffectSystem'
import { spawnDamageNumber } from '../game/fx/DamageNumber'
import { PlayerAnimation } from '../game/player/PlayerAnimation'
import { PlayerController } from '../game/player/PlayerController'
import { PlayerCombat }    from '../game/player/PlayerCombat'
import { EnemyManager }    from '../game/enemy/EnemyManager'
import { Enemy2Manager }   from '../game/enemy/Enemy2Manager'
import { BossManager }     from '../game/enemy/BossManager'

interface GameWorldProps { onExit: () => void }

export function GameWorld({ onExit }: GameWorldProps) {
  const mountRef  = useRef<HTMLDivElement>(null)
  const onExitRef = useRef(onExit)
  useEffect(() => { onExitRef.current = onExit }, [onExit])

  useEffect(() => {
    const mount = mountRef.current!
    let isMounted = true

    // ── 모듈 초기화 ───────────────────────────────────────────────────────
    const world       = new WorldManager(mount)

    const audio       = new AudioManager()
    audio.playBGM(main1Url)

    const hud         = new HUD(mount)
    const fx          = new EffectSystem(world.scene)

    const playerAnim  = new PlayerAnimation(world.scene, () => isMounted)
    const controller  = new PlayerController(playerAnim, world.camera, fx, hud)

    // ── 플레이어 HP ────────────────────────────────────────────────────────
    let playerHP       = 100
    const playerMaxHP  = 100
    let hitFlashTimer       = 0
    let playerMeshFlashTimer = 0

    hud.updateHP(playerHP, playerMaxHP)

    const spawnDmgNum = (pos: THREE.Vector3, amount: number, isPlayer: boolean) =>
      spawnDamageNumber(pos, amount, isPlayer, world.camera)

    const damagePlayer = (amount: number, knockDir?: THREE.Vector3, attackOrigin?: THREE.Vector3) => {
      // 전방 방어 체크
      if (attackOrigin && combat.tryBlockDamage(attackOrigin)) return
      if (combat.isShielding && !attackOrigin) return  // 원점 없으면 기존 전방위 방어 유지
      playerHP = Math.max(0, playerHP - amount)
      hitFlashTimer        = 0.4
      playerMeshFlashTimer = 0.15
      fx.screenShakeTimer  = 0.25
      playerAnim.setEmissive(0xffffff)
      playerAnim.triggerHitStop(0.05)   // 피격 히트스톱
      if (knockDir) controller.applyKnockback(knockDir, 6)  // 피격 넉백
      hud.updateHP(playerHP, playerMaxHP)
      spawnDmgNum(controller.character.position, amount, true)
      audio.playSound(playerHitUrl, 0.8)
    }

    const enemyManager = new EnemyManager(
      world.scene,
      () => controller.character,
      fx, audio,
      damagePlayer,
      spawnDmgNum,
      () => isMounted,
    )

    const enemy2Manager = new Enemy2Manager(
      world.scene,
      () => controller.character,
      fx, audio,
      damagePlayer,
      spawnDmgNum,
      () => isMounted,
    )

    // destroyTerrain은 StageManager 생성 후 연결 (ref 클로저 패턴)
    const destroyTerrainRef = { fn: (_count: number): THREE.Vector3[] => [] }

    const bossManager = new BossManager(
      world.scene,
      () => controller.character,
      fx, audio,
      damagePlayer,
      spawnDmgNum,
      hud,
      (dur: number) => { controller.stunTimer = dur },
      () => isMounted,
      (count: number) => destroyTerrainRef.fn(count),
    )

    const combat = new PlayerCombat(
      playerAnim, controller, world.scene,
      [enemyManager, enemy2Manager], fx, audio, hud, spawnDmgNum,
      bossManager,
    )

    const stageManager = new StageManager(
      world.scene, world, controller, playerAnim,
      enemyManager, enemy2Manager, bossManager,
      fx, hud, mount,
      () => { playerHP = playerMaxHP; hud.updateHP(playerHP, playerMaxHP) },
    )
    destroyTerrainRef.fn = stageManager.destroyTerrain.bind(stageManager)
    stageManager.loadStage(0)

    // ── 이벤트 핸들러 ─────────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      controller.mouse.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      )
      if (controller.stunTimer > 0) return
      if (controller.inputMode === 'mouse' && controller.isRightMouseDown && controller.attackRightClickBlock <= 0 && !combat.isAttacking && !combat.isShielding) {
        const hit = controller.getGroundHit()
        if (hit) controller.moveTarget = new THREE.Vector3(hit.x, 0, hit.z)
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        controller.isRightMouseDown = true
        if (controller.inputMode !== 'mouse' || controller.stunTimer > 0 || controller.attackRightClickBlock > 0 || combat.isAttacking || combat.isShielding) return
        const hit = controller.getGroundHit()
        if (hit) controller.moveTarget = new THREE.Vector3(hit.x, 0, hit.z)
      } else if (e.button === 0) {
        if (controller.stunTimer > 0) return
        combat.startAttack()
      }
    }

    const onMouseUp  = (e: MouseEvent) => { if (e.button === 2) controller.isRightMouseDown = false }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    // ── 키보드 입력 모드 ─────────────────────────────────────────────────
    const arrowState = { up: false, down: false, left: false, right: false }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExitRef.current(); return }
      // 방향키 (키보드 모드)
      if (e.key === 'ArrowUp')    { arrowState.up = true;    return }
      if (e.key === 'ArrowDown')  { arrowState.down = true;  return }
      if (e.key === 'ArrowLeft')  { arrowState.left = true;  return }
      if (e.key === 'ArrowRight') { arrowState.right = true; return }
      // 키보드 모드: Ctrl = 기본 공격
      if (controller.inputMode === 'keyboard' && e.key === 'Control') {
        if (controller.stunTimer <= 0) combat.startAttack(); return
      }
      if (e.key === 'q' || e.key === 'Q') { if (controller.stunTimer <= 0) combat.startQAttack(); return }
      if (e.key === 'w' || e.key === 'W') { if (controller.stunTimer <= 0) combat.startWAttack(); return }
      if (e.key === 'e' || e.key === 'E') { if (controller.stunTimer <= 0) combat.startEAttack(); return }
      if (e.key === 'r' || e.key === 'R') { if (controller.stunTimer <= 0) combat.startRAttack(); return }
      if (e.key === 'c' || e.key === 'C') { if (controller.stunTimer <= 0) combat.activateShield(); return }
      if (e.key === 'a' || e.key === 'A') { if (controller.stunTimer <= 0) combat.startAAttack(); return }
      if (e.key === 's' || e.key === 'S') { if (controller.stunTimer <= 0) combat.startSAttack(); return }
      if (e.key === 'd' || e.key === 'D') { if (controller.stunTimer <= 0) combat.startDAttack(); return }
      if (e.key === 'f' || e.key === 'F') { if (controller.stunTimer <= 0) combat.startFAttack(); return }
      if (e.key === 't' || e.key === 'T') { if (controller.stunTimer <= 0) combat.startTAttack(); return }
      if (e.key === ' ')  { e.preventDefault(); controller.tryBlink() }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') combat.deactivateShield()
      if (e.key === 'ArrowUp')    arrowState.up = false
      if (e.key === 'ArrowDown')  arrowState.down = false
      if (e.key === 'ArrowLeft')  arrowState.left = false
      if (e.key === 'ArrowRight') arrowState.right = false
    }

    const onWheel  = (e: WheelEvent)  => world.onWheel(e)
    const onResize = ()               => world.onResize()

    window.addEventListener('mousemove',   onMouseMove)
    window.addEventListener('mousedown',   onMouseDown)
    window.addEventListener('mouseup',     onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown',     onKeyDown)
    window.addEventListener('keyup',       onKeyUp)
    window.addEventListener('wheel',       onWheel, { passive: false })
    window.addEventListener('resize',      onResize)

    // ── 렌더 루프 ─────────────────────────────────────────────────────────
    const clock = new THREE.Clock()
    let frameId: number
    let killSlowmoTimer = 0   // 마지막 적 킬 슬로우모션

    // 킬 슬로우모 콜백 — 적 매니저에서 마지막 적 사망 시 호출
    const triggerKillSlowmo = () => { killSlowmoTimer = 0.25 }
    enemyManager.onLastKill  = triggerKillSlowmo
    enemy2Manager.onLastKill = triggerKillSlowmo

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      let delta = Math.min(clock.getDelta(), 0.05)
      const t   = clock.elapsedTime

      // 킬 슬로우모: delta 스케일링
      if (killSlowmoTimer > 0) {
        killSlowmoTimer -= delta
        delta *= 0.15
      }

      // 키보드 모드 방향 입력
      const dx = (arrowState.right ? 1 : 0) - (arrowState.left ? 1 : 0)
      const dz = (arrowState.down ? 1 : 0) - (arrowState.up ? 1 : 0)
      controller.setDirectionInput(dx, dz)

      // 모듈 업데이트
      controller.update(delta, combat.qIsAttacking, combat.qFiredDirY, combat.isShielding, combat.wMoveLocked || combat.eIsAttacking || combat.rIsAttacking || combat.aIsAttacking || combat.sIsAttacking || combat.dIsAttacking || combat.fIsAttacking || combat.tIsAttacking)
      combat.update(delta)
      enemyManager.update(delta)
      enemy2Manager.update(delta)
      bossManager.update(delta)
      stageManager.update(delta)

      // ── 충돌 분리 (겹침 방지) ──────────────────────────────────────
      const PLAYER_R = 0.7, ENEMY_R = 0.9
      const charPos  = controller.character.position
      const allLive  = [...enemyManager.enemies, ...enemy2Manager.enemies].filter(e => !e.isDead)

      for (const enemy of allLive) {
        const dx = charPos.x - enemy.group.position.x
        const dz = charPos.z - enemy.group.position.z
        const d2  = dx * dx + dz * dz
        const min = PLAYER_R + ENEMY_R
        if (d2 < min * min && d2 > 0.0001) {
          const d    = Math.sqrt(d2)
          const push = (min - d) / d
          // 플레이어를 경계 밖으로 밀어냄 (적은 위치 고정 → 플레이어가 막힘)
          charPos.x += dx * push
          charPos.z += dz * push
        }
      }

      for (let i = 0; i < allLive.length; i++) {
        for (let j = i + 1; j < allLive.length; j++) {
          const ap = allLive[i].group.position, bp = allLive[j].group.position
          const dx = ap.x - bp.x, dz = ap.z - bp.z
          const d2  = dx * dx + dz * dz
          const min = ENEMY_R * 2
          if (d2 < min * min && d2 > 0.0001) {
            const d    = Math.sqrt(d2)
            const half = (min - d) * 0.5 / d
            ap.x += dx * half; ap.z += dz * half
            bp.x -= dx * half; bp.z -= dz * half
          }
        }
      }

      fx.update(delta)
      playerAnim.update(delta)

      // 공격/Q/E 중이 아닐 때 idle↔run 자동 전환
      // W는 착지(1타) 후엔 wMoveLocked=false → 이동/점멸 시 애니메이션 자동 복귀
      if (!combat.isAttacking && !combat.qIsAttacking && !(combat.wIsAttacking && combat.wMoveLocked) && !combat.eIsAttacking && !combat.rIsAttacking && !combat.isShielding)
        playerAnim.syncMovementAnim(controller.isMoving)

      // 카메라 + 조명 (마우스 look-ahead)
      const mouseWorld = controller.getGroundHit()
      world.update(delta, t, controller.character.position, fx.screenShakeTimer, mouseWorld)

      // 피격 비네트
      if (hitFlashTimer > 0) {
        hitFlashTimer -= delta
        hud.setVignetteOpacity(Math.max(0, hitFlashTimer / 0.4))
      } else {
        hud.setVignetteOpacity(0)
      }

      // 플레이어 피격 플래시 해제
      if (playerMeshFlashTimer > 0) {
        playerMeshFlashTimer -= delta
        if (playerMeshFlashTimer <= 0) playerAnim.setEmissive(null)
      }

      // 기절 비주얼
      if (controller.stunTimer > 0) hud.showStun()
      else                          hud.hideStun()

      world.renderer.render(world.scene, world.camera)
    }

    // ── 셰이더 프리컴파일 완료 후 렌더 루프 시작 ─────────────────────────
    Promise.allSettled([
      idleGlbPromise, runGlbPromise, attackGlbPromise, qAttackGlbPromise,
      wAttackGlbPromise, eAttackGlbPromise,
      enemy1IdleFbxPromise, enemy1RunFbxPromise, enemy1AttackFbxPromise, enemy1DeathFbxPromise,
      enemy2IdleFbxPromise, enemy2RunFbxPromise, enemy2AttackFbxPromise, enemy2DeathFbxPromise,
      fireballFbxPromise,
      boss1IdleFbxPromise, boss1RunFbxPromise, boss1AttackFbxPromise,
      boss1Attack2FbxPromise, boss1JumpAttackFbxPromise, boss1DeathFbxPromise,
    ]).then(() => {
      if (!isMounted) return
      enemy2Manager.initFireballPool()
      world.renderer.compile(world.scene, world.camera)
      world.renderer.render(world.scene, world.camera)  // 워밍업 렌더
      animate()
    })

    // ── 정리 ──────────────────────────────────────────────────────────────
    return () => {
      isMounted = false
      cancelAnimationFrame(frameId)
      stageManager.dispose()
      audio.dispose()
      hud.dispose()
      world.dispose()
      window.removeEventListener('mousemove',   onMouseMove)
      window.removeEventListener('mousedown',   onMouseDown)
      window.removeEventListener('mouseup',     onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown',     onKeyDown)
      window.removeEventListener('keyup',       onKeyUp)
      window.removeEventListener('wheel',       onWheel)
      window.removeEventListener('resize',      onResize)
    }
  }, [])

  return <div ref={mountRef} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#1a1a2e' }} />
}
