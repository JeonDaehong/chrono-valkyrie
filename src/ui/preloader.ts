import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import idleGlbUrl from '@assets/img/player/standby.glb?url'
import moveGlbUrl from '@assets/img/player/run.glb?url'
import attackGlbUrl from '@assets/img/player/attack.glb?url'
import qAttackGlbUrl from '@assets/img/player/q_attack.glb?url'
import wAttackGlbUrl from '@assets/img/player/w_attack.glb?url'
import eAttackGlbUrl from '@assets/img/player/e_attack.glb?url'
import enemy1IdleUrl from '@assets/img/enemy/enemy1_Idle.fbx?url'
import enemy1RunUrl from '@assets/img/enemy/enemy1_run.fbx?url'
import enemy1AttackUrl from '@assets/img/enemy/enemy1_attack.fbx?url'
import enemy1DeathUrl from '@assets/img/enemy/enemy1_death.fbx?url'
import enemy2IdleUrl   from '@assets/img/enemy/enemy2_Idle.fbx?url'
import enemy2RunUrl    from '@assets/img/enemy/enemy2_run.fbx?url'
import enemy2AttackUrl from '@assets/img/enemy/enemy2_attack.fbx?url'
import enemy2DeathUrl  from '@assets/img/enemy/enemy2_death.fbx?url'
import fireballUrl     from '@assets/img/enemy/fireball.fbx?url'
import boss1IdleUrl        from '@assets/img/enemy/boss1_Idle.fbx?url'
import boss1RunUrl         from '@assets/img/enemy/boss1_run.fbx?url'
import boss1AttackUrl      from '@assets/img/enemy/boss1_attack.fbx?url'
import boss1Attack2Url     from '@assets/img/enemy/boss1_attack2.fbx?url'
import boss1JumpAttackUrl  from '@assets/img/enemy/boss1_jump_attack.fbx?url'
import boss1DeathUrl       from '@assets/img/enemy/boss1_death.fbx?url'

export type GlbData = { group: THREE.Group; animations: THREE.AnimationClip[] }

// ── 지연 Promise 생성 (import 시에는 빈 Promise 껍데기만 생성, 메인스레드 부하 0) ──
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const _idle   = deferred<GlbData>()
const _run    = deferred<GlbData>()
const _attack = deferred<GlbData>()
const _qAtk   = deferred<GlbData>()
const _wAtk   = deferred<GlbData>()
const _eAtk   = deferred<GlbData>()

const _e1Idle   = deferred<THREE.Group>()
const _e1Run    = deferred<THREE.Group>()
const _e1Attack = deferred<THREE.Group>()
const _e1Death  = deferred<THREE.Group>()

const _e2Idle   = deferred<THREE.Group>()
const _e2Run    = deferred<THREE.Group>()
const _e2Attack = deferred<THREE.Group>()
const _e2Death  = deferred<THREE.Group>()

const _fireball = deferred<THREE.Group>()

const _b1Idle   = deferred<THREE.Group>()
const _b1Run    = deferred<THREE.Group>()
const _b1Atk    = deferred<THREE.Group>()
const _b1Atk2   = deferred<THREE.Group>()
const _b1Jump   = deferred<THREE.Group>()
const _b1Death  = deferred<THREE.Group>()

// ── 외부 API: Promise (기존 인터페이스 100% 호환) ────────────────────────
export const idleGlbPromise   = _idle.promise
export const runGlbPromise    = _run.promise
export const attackGlbPromise = _attack.promise
export const qAttackGlbPromise  = _qAtk.promise
export const wAttackGlbPromise  = _wAtk.promise
export const eAttackGlbPromise  = _eAtk.promise

export const enemy1IdleFbxPromise   = _e1Idle.promise
export const enemy1RunFbxPromise    = _e1Run.promise
export const enemy1AttackFbxPromise = _e1Attack.promise
export const enemy1DeathFbxPromise  = _e1Death.promise

export const enemy2IdleFbxPromise   = _e2Idle.promise
export const enemy2RunFbxPromise    = _e2Run.promise
export const enemy2AttackFbxPromise = _e2Attack.promise
export const enemy2DeathFbxPromise  = _e2Death.promise

export const fireballFbxPromise = _fireball.promise

export const boss1IdleFbxPromise       = _b1Idle.promise
export const boss1RunFbxPromise        = _b1Run.promise
export const boss1AttackFbxPromise     = _b1Atk.promise
export const boss1Attack2FbxPromise    = _b1Atk2.promise
export const boss1JumpAttackFbxPromise = _b1Jump.promise
export const boss1DeathFbxPromise      = _b1Death.promise

// ── startPreload: LoadingScreen에서 호출 → 이 때 비로소 네트워크+파싱 시작 ──
let started = false
export function startPreload() {
  if (started) return
  started = true

  const glb = new GLTFLoader()
  const fbx = new FBXLoader()

  const loadGlb = (url: string, d: Deferred<GlbData>) =>
    glb.load(url, (gltf) => d.resolve({ group: gltf.scene, animations: gltf.animations }), undefined, d.reject)
  const loadFbx = (url: string, d: Deferred<THREE.Group>) =>
    fbx.load(url, d.resolve, undefined, d.reject)

  loadGlb(idleGlbUrl, _idle)
  loadGlb(moveGlbUrl, _run)
  loadGlb(attackGlbUrl, _attack)
  loadGlb(qAttackGlbUrl, _qAtk)
  loadGlb(wAttackGlbUrl, _wAtk)
  loadGlb(eAttackGlbUrl, _eAtk)

  loadFbx(enemy1IdleUrl, _e1Idle)
  loadFbx(enemy1RunUrl, _e1Run)
  loadFbx(enemy1AttackUrl, _e1Attack)
  loadFbx(enemy1DeathUrl, _e1Death)

  loadFbx(enemy2IdleUrl, _e2Idle)
  loadFbx(enemy2RunUrl, _e2Run)
  loadFbx(enemy2AttackUrl, _e2Attack)
  loadFbx(enemy2DeathUrl, _e2Death)

  loadFbx(fireballUrl, _fireball)

  loadFbx(boss1IdleUrl, _b1Idle)
  loadFbx(boss1RunUrl, _b1Run)
  loadFbx(boss1AttackUrl, _b1Atk)
  loadFbx(boss1Attack2Url, _b1Atk2)
  loadFbx(boss1JumpAttackUrl, _b1Jump)
  loadFbx(boss1DeathUrl, _b1Death)
}
