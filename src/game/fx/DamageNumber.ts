import * as THREE from 'three'

export function spawnDamageNumber(
  worldPos: THREE.Vector3,
  amount: number,
  isPlayer: boolean,
  camera: THREE.Camera,
) {
  const div = document.createElement('div')
  div.textContent = `-${amount}`
  div.style.cssText = [
    'position:fixed', 'font-weight:900', 'font-family:monospace',
    `font-size:${isPlayer ? 30 : 22}px`,
    `color:${isPlayer ? '#ff2222' : '#ffdd00'}`,
    `text-shadow:0 0 12px ${isPlayer ? '#ff0000,0 0 20px #ff0000' : '#ff8800,0 0 20px #ffaa00'}`,
    'pointer-events:none', 'z-index:500', 'transform:translate(-50%,-50%)', 'letter-spacing:2px',
  ].join(';')
  document.body.appendChild(div)

  const start = worldPos.clone()
  let age = 0
  const tick = () => {
    age += 0.016
    const p = start.clone()
    p.y += age * 2.5
    const ndc = p.project(camera)
    div.style.left = `${(ndc.x + 1) / 2 * window.innerWidth}px`
    div.style.top  = `${(1 - ndc.y) / 2 * window.innerHeight}px`
    div.style.opacity = `${Math.max(0, 1 - age / 1.0)}`
    if (age < 1.0) requestAnimationFrame(tick)
    else if (document.body.contains(div)) document.body.removeChild(div)
  }
  requestAnimationFrame(tick)
}
