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
import { buildMap }        from '../game/world/MapBuilder'
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
    buildMap(world.scene)

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

    const damagePlayer = (amount: number, knockDir?: THREE.Vector3) => {
      if (combat.isShielding) return          // 방패로 막기
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

    const bossManager = new BossManager(
      world.scene,
      () => controller.character,
      fx, audio,
      damagePlayer,
      spawnDmgNum,
      hud,
      (dur: number) => { controller.stunTimer = dur },
      () => isMounted,
    )

    const combat = new PlayerCombat(
      playerAnim, controller, world.scene,
      [enemyManager, enemy2Manager], fx, audio, hud, spawnDmgNum,
      bossManager,
    )

    // ── 이벤트 핸들러 ─────────────────────────────────────────────────────
    const onMouseMove = (e: MouseEvent) => {
      controller.mouse.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      )
      if (controller.stunTimer > 0) return
      if (controller.isRightMouseDown && controller.attackRightClickBlock <= 0) {
        if (combat.isAttacking) combat.cancelAttack()
        const hit = controller.getGroundHit()
        if (hit) controller.moveTarget = new THREE.Vector3(hit.x, 0, hit.z)
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        controller.isRightMouseDown = true
        if (controller.stunTimer > 0 || controller.attackRightClickBlock > 0) return
        if (combat.isAttacking) combat.cancelAttack()
        const hit = controller.getGroundHit()
        if (hit) controller.moveTarget = new THREE.Vector3(hit.x, 0, hit.z)
      } else if (e.button === 0) {
        if (controller.stunTimer > 0) return
        combat.startAttack()
      }
    }

    const onMouseUp  = (e: MouseEvent) => { if (e.button === 2) controller.isRightMouseDown = false }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExitRef.current(); return }
      if (e.key === 'q' || e.key === 'Q') { if (controller.stunTimer <= 0) combat.startQAttack(); return }
      if (e.key === 'w' || e.key === 'W') { if (controller.stunTimer <= 0) combat.startWAttack(); return }
      if (e.key === 'e' || e.key === 'E') { if (controller.stunTimer <= 0) combat.startEAttack(); return }
      if (e.key === 'Control')             { if (controller.stunTimer <= 0) combat.activateShield(); return }
      if (e.key === ' ')  { e.preventDefault(); controller.tryBlink() }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') combat.deactivateShield()
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

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const delta = Math.min(clock.getDelta(), 0.05)
      const t     = clock.elapsedTime

      // 모듈 업데이트
      controller.update(delta, combat.qIsAttacking, combat.qFiredDirY, combat.isShielding, combat.wMoveLocked || combat.eIsAttacking)
      combat.update(delta)
      enemyManager.update(delta)
      enemy2Manager.update(delta)
      bossManager.update(delta)
      bossManager.trySpawnIfReady(enemyManager.enemies, enemy2Manager.enemies)

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
      if (!combat.isAttacking && !combat.qIsAttacking && !(combat.wIsAttacking && combat.wMoveLocked) && !combat.eIsAttacking)
        playerAnim.syncMovementAnim(controller.isMoving)

      // 카메라 + 조명
      world.update(delta, t, controller.character.position, fx.screenShakeTimer)

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
      animate()
    })

    // ── 정리 ──────────────────────────────────────────────────────────────
    return () => {
      isMounted = false
      cancelAnimationFrame(frameId)
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
