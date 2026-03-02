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

export const idleGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    idleGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// run.glb: 이동 모션
export const runGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    moveGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// attack1.glb: 공격 모션
export const attackGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    attackGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// q_attack.glb: Q 스킬 모션
export const qAttackGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    qAttackGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// w_attack.glb: W 스킬 (점프 내리찍기)
export const wAttackGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    wAttackGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// e_attack.glb: E 스킬 + Ctrl 방패 모션
export const eAttackGlbPromise: Promise<GlbData> = new Promise((resolve, reject) => {
  new GLTFLoader().load(
    eAttackGlbUrl,
    (gltf) => resolve({ group: gltf.scene, animations: gltf.animations }),
    undefined,
    reject,
  )
})

// 오글 적 FBX (Idle = 기본 메시 + 클립, 나머지는 클립만 사용)
export const enemy1IdleFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy1IdleUrl, resolve, undefined, reject)
})
export const enemy1RunFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy1RunUrl, resolve, undefined, reject)
})
export const enemy1AttackFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy1AttackUrl, resolve, undefined, reject)
})
export const enemy1DeathFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy1DeathUrl, resolve, undefined, reject)
})

// enemy2 FBX (원거리 적)
export const enemy2IdleFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy2IdleUrl, resolve, undefined, reject)
})
export const enemy2RunFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy2RunUrl, resolve, undefined, reject)
})
export const enemy2AttackFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy2AttackUrl, resolve, undefined, reject)
})
export const enemy2DeathFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(enemy2DeathUrl, resolve, undefined, reject)
})

// 파이어볼 투사체 FBX
export const fireballFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(fireballUrl, resolve, undefined, reject)
})

// 보스1 FBX
export const boss1IdleFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1IdleUrl, resolve, undefined, reject)
})
export const boss1RunFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1RunUrl, resolve, undefined, reject)
})
export const boss1AttackFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1AttackUrl, resolve, undefined, reject)
})
export const boss1Attack2FbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1Attack2Url, resolve, undefined, reject)
})
export const boss1JumpAttackFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1JumpAttackUrl, resolve, undefined, reject)
})
export const boss1DeathFbxPromise: Promise<THREE.Group> = new Promise((resolve, reject) => {
  new FBXLoader().load(boss1DeathUrl, resolve, undefined, reject)
})
