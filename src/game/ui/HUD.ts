import { BLINK_MAX } from '../shared/constants'

export class HUD {
  private hpBarWrap!: HTMLDivElement
  private hpBarInner!: HTMLDivElement
  private hitVignette!: HTMLDivElement
  private blinkHUD!: HTMLDivElement
  private chargeEls: HTMLDivElement[] = []
  private qHUD!: HTMLDivElement
  private qKey!: HTMLDivElement
  private qCoolFill!: HTMLDivElement
  private qCoolBar!: HTMLDivElement
  private bossHPWrap!: HTMLDivElement
  private bossHPInner!: HTMLDivElement
  private skillBar!: HTMLDivElement
  private skillEls: Map<string, { key: HTMLDivElement; fill: HTMLDivElement }> = new Map()
  private stunOverlay!: HTMLDivElement
  private stunText!: HTMLDivElement

  constructor(private mount: HTMLDivElement) {
    this.createHPBar()
    this.createVignette()
    this.createBlinkHUD()
    this.createQHUD()
    this.createBossHPBar()
    this.createSkillBar()
    this.createStunOverlay()
  }

  private createHPBar() {
    this.hpBarWrap = document.createElement('div')
    this.hpBarWrap.style.cssText =
      'position:fixed;top:20px;left:20px;z-index:1000;pointer-events:none;font-family:monospace'
    this.hpBarWrap.innerHTML =
      '<div style="color:#aaa;font-size:11px;margin-bottom:3px;letter-spacing:2px">HP</div>'

    const outer = document.createElement('div')
    outer.style.cssText =
      'width:180px;height:10px;background:#111;border:1px solid #334;border-radius:3px;overflow:hidden'

    this.hpBarInner = document.createElement('div')
    this.hpBarInner.style.cssText =
      'width:100%;height:100%;background:linear-gradient(90deg,#00ff88,#00cc66);border-radius:3px;transition:width 0.1s'

    outer.appendChild(this.hpBarInner)
    this.hpBarWrap.appendChild(outer)
    this.mount.appendChild(this.hpBarWrap)
  }

  private createVignette() {
    this.hitVignette = document.createElement('div')
    this.hitVignette.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:200;opacity:0;' +
      'background:radial-gradient(ellipse at center,transparent 40%,rgba(255,0,0,0.65) 100%)'
    this.mount.appendChild(this.hitVignette)
  }

  private createBlinkHUD() {
    this.blinkHUD = document.createElement('div')
    this.blinkHUD.style.cssText =
      'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:1000;pointer-events:none'
    this.mount.appendChild(this.blinkHUD)

    for (let i = 0; i < BLINK_MAX; i++) {
      const el = document.createElement('div')
      el.style.cssText =
        'width:22px;height:22px;border-radius:50%;border:2px solid #00ccff;' +
        'background:#00ccff;box-shadow:0 0 8px #00ccff;transition:background 0.15s,box-shadow 0.15s'
      this.blinkHUD.appendChild(el)
      this.chargeEls.push(el)
    }
  }

  private createQHUD() {
    this.qHUD = document.createElement('div')
    this.qHUD.style.cssText =
      'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);' +
      'z-index:1000;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:3px'

    this.qKey = document.createElement('div')
    this.qKey.style.cssText =
      'width:36px;height:36px;border-radius:6px;border:2px solid #ff6600;background:#ff4400;' +
      'box-shadow:0 0 10px #ff4400;display:flex;align-items:center;justify-content:center;' +
      'font-family:monospace;font-weight:900;font-size:16px;color:#fff;transition:background 0.1s,box-shadow 0.1s'
    this.qKey.textContent = 'Q'

    this.qCoolBar = document.createElement('div')
    this.qCoolBar.style.cssText =
      'width:36px;height:3px;background:#331100;border-radius:2px;overflow:hidden'

    this.qCoolFill = document.createElement('div')
    this.qCoolFill.style.cssText =
      'width:100%;height:100%;background:linear-gradient(90deg,#ff4400,#ff8800);border-radius:2px;transition:width 0.05s'

    this.qCoolBar.appendChild(this.qCoolFill)
    this.qHUD.appendChild(this.qKey)
    this.qHUD.appendChild(this.qCoolBar)
    this.mount.appendChild(this.qHUD)
  }

  private createBossHPBar() {
    this.bossHPWrap = document.createElement('div')
    this.bossHPWrap.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:1000;' +
      'pointer-events:none;font-family:monospace;display:none;min-width:280px;text-align:center'

    const label = document.createElement('div')
    label.style.cssText =
      'color:#ff4444;font-size:11px;letter-spacing:4px;margin-bottom:4px;text-transform:uppercase;' +
      'text-shadow:0 0 8px #ff2200'
    label.textContent = 'B O S S'

    // HP 바 + 마커를 감싸는 relative 컨테이너
    const barContainer = document.createElement('div')
    barContainer.style.cssText = 'position:relative;width:280px;height:12px'

    const outer = document.createElement('div')
    outer.style.cssText =
      'width:100%;height:100%;background:#1a0000;border:1px solid #661111;border-radius:3px;overflow:hidden;' +
      'box-shadow:0 0 10px #ff220055'

    this.bossHPInner = document.createElement('div')
    this.bossHPInner.style.cssText =
      'width:100%;height:100%;background:linear-gradient(90deg,#cc0000,#ff3300);border-radius:3px;transition:width 0.1s'

    outer.appendChild(this.bossHPInner)
    barContainer.appendChild(outer)

    // ── 각성 트리거 마커 ─────────────────────────────────────────
    // 70% 마커 (1차 각성) — 황금색
    const marker70 = document.createElement('div')
    marker70.style.cssText =
      'position:absolute;top:-2px;left:70%;width:2px;height:16px;' +
      'background:#ffcc00;box-shadow:0 0 5px #ffcc00,0 0 10px #ffaa00;' +
      'z-index:4;border-radius:1px;pointer-events:none'
    barContainer.appendChild(marker70)

    // 30% 마커 (2차 각성 · 최종) — 주황
    const marker30 = document.createElement('div')
    marker30.style.cssText =
      'position:absolute;top:-2px;left:30%;width:2px;height:16px;' +
      'background:#ff6600;box-shadow:0 0 5px #ff6600,0 0 10px #ff4400;' +
      'z-index:4;border-radius:1px;pointer-events:none'
    barContainer.appendChild(marker30)

    this.bossHPWrap.appendChild(label)
    this.bossHPWrap.appendChild(barContainer)
    this.mount.appendChild(this.bossHPWrap)
  }

  // ── W / E / Ctrl 스킬 버튼 (Q 오른쪽에 나란히) ─────────────────────
  private createSkillBar() {
    this.skillBar = document.createElement('div')
    this.skillBar.style.cssText =
      'position:fixed;bottom:64px;left:calc(50% + 55px);' +
      'z-index:1000;pointer-events:none;display:flex;gap:8px;align-items:flex-start'
    this.mount.appendChild(this.skillBar)

    const skills: { key: string; label: string; color: string; glow: string }[] = [
      { key: 'W',    label: 'W',    color: '#0088ff', glow: '#0066ff' },
      { key: 'E',    label: 'E',    color: '#aa44ff', glow: '#8800ff' },
      { key: 'Ctrl', label: '⛊',   color: '#00ffcc', glow: '#00ccaa' },
    ]

    for (const s of skills) {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px'

      const btn = document.createElement('div')
      btn.style.cssText =
        `width:36px;height:36px;border-radius:6px;border:2px solid ${s.color};background:${s.color};` +
        `box-shadow:0 0 10px ${s.glow};display:flex;align-items:center;justify-content:center;` +
        `font-family:monospace;font-weight:900;font-size:${s.key === 'Ctrl' ? 18 : 16}px;color:#fff;` +
        `transition:background 0.1s,box-shadow 0.1s`
      btn.textContent = s.label

      const coolBar = document.createElement('div')
      coolBar.style.cssText =
        'width:36px;height:3px;background:#110033;border-radius:2px;overflow:hidden;display:none'

      const fill = document.createElement('div')
      fill.style.cssText =
        `width:0%;height:100%;background:linear-gradient(90deg,${s.color},${s.glow});border-radius:2px;transition:width 0.05s`

      coolBar.appendChild(fill)
      wrap.appendChild(btn)
      wrap.appendChild(coolBar)
      this.skillBar.appendChild(wrap)
      this.skillEls.set(s.key, { key: btn, fill })
    }
  }

  // ── 플레이어 기절 오버레이 ─────────────────────────────────────────
  private createStunOverlay() {
    this.stunOverlay = document.createElement('div')
    this.stunOverlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:201;opacity:0;' +
      'background:radial-gradient(ellipse at center,rgba(255,255,0,0.08) 0%,rgba(220,180,0,0.28) 100%)'
    this.mount.appendChild(this.stunOverlay)

    this.stunText = document.createElement('div')
    this.stunText.style.cssText =
      'position:fixed;top:42%;left:50%;transform:translate(-50%,-50%);' +
      'color:#ffe000;font-size:26px;font-weight:900;font-family:monospace;letter-spacing:5px;' +
      'text-shadow:0 0 18px #ffaa00,0 0 36px #ff8800;z-index:202;opacity:0;pointer-events:none'
    this.stunText.textContent = '★  STUNNED  ★'
    this.mount.appendChild(this.stunText)
  }

  showStun() {
    const pulse = 0.45 + 0.45 * Math.abs(Math.sin(Date.now() * 0.005))
    this.stunOverlay.style.opacity = `${pulse}`
    this.stunText.style.opacity    = `${pulse}`
  }

  hideStun() {
    this.stunOverlay.style.opacity = '0'
    this.stunText.style.opacity    = '0'
  }

  // ── W/E/Ctrl 쿨타임 업데이트 ────────────────────────────────────────
  private updateSkill(skillKey: string, cooldown: number, maxCooldown: number, color: string, glow: string) {
    const el = this.skillEls.get(skillKey)
    if (!el) return
    const ratio = Math.max(0, cooldown / maxCooldown)
    const bar   = el.fill.parentElement as HTMLDivElement
    if (ratio > 0) {
      el.key.style.background = '#0a001a'; el.key.style.boxShadow = 'none'
      el.fill.style.width = `${ratio * 100}%`; bar.style.display = 'block'
    } else {
      el.key.style.background = color; el.key.style.boxShadow = `0 0 10px ${glow}`
      el.fill.style.width = '0%'; bar.style.display = 'none'
    }
  }

  updateSkillW(cooldown: number, max: number)    { this.updateSkill('W',    cooldown, max, '#0088ff', '#0066ff') }
  updateSkillE(cooldown: number, max: number)    { this.updateSkill('E',    cooldown, max, '#aa44ff', '#8800ff') }
  updateSkillCtrl(cooldown: number, max: number) { this.updateSkill('Ctrl', cooldown, max, '#00ffcc', '#00ccaa') }

  showBossHP() {
    this.bossHPWrap.style.display = 'block'
  }

  updateBossHP(hp: number, maxHp: number) {
    const r = Math.max(0, hp / maxHp)
    this.bossHPInner.style.width = `${r * 100}%`
    this.bossHPInner.style.background =
      r > 0.3
        ? 'linear-gradient(90deg,#cc0000,#ff3300)'
        : 'linear-gradient(90deg,#ff6600,#ffaa00)'
  }

  hideBossHP() {
    this.bossHPWrap.style.display = 'none'
  }

  updateHP(hp: number, maxHp: number) {
    const r = hp / maxHp
    this.hpBarInner.style.width = `${r * 100}%`
    this.hpBarInner.style.background =
      r > 0.5 ? 'linear-gradient(90deg,#00ff88,#00cc66)'
      : r > 0.25 ? 'linear-gradient(90deg,#ffaa00,#ff6600)'
      : 'linear-gradient(90deg,#ff3300,#cc0000)'
  }

  setVignetteOpacity(opacity: number) {
    this.hitVignette.style.opacity = `${opacity}`
  }

  updateBlink(charges: number, progress = 0) {
    this.chargeEls.forEach((el, i) => {
      if (i < charges) {
        el.style.background = '#00ccff'; el.style.boxShadow = '0 0 8px #00ccff'
      } else if (i === charges) {
        el.style.background = `rgba(0,204,255,${(progress * 0.8).toFixed(2)})`; el.style.boxShadow = 'none'
      } else {
        el.style.background = 'transparent'; el.style.boxShadow = 'none'
      }
    })
  }

  updateQ(qCooldown: number, qCooldownMax: number) {
    const ratio = Math.max(0, qCooldown / qCooldownMax)
    if (ratio > 0) {
      this.qKey.style.background = '#1a0800'; this.qKey.style.boxShadow = 'none'
      this.qCoolFill.style.width = `${ratio * 100}%`; this.qCoolBar.style.display = 'block'
    } else {
      this.qKey.style.background = '#ff4400'; this.qKey.style.boxShadow = '0 0 10px #ff4400'
      this.qCoolFill.style.width = '0%'; this.qCoolBar.style.display = 'none'
    }
  }

  dispose() {
    if (this.mount.contains(this.qHUD))        this.mount.removeChild(this.qHUD)
    if (this.mount.contains(this.blinkHUD))    this.mount.removeChild(this.blinkHUD)
    if (this.mount.contains(this.hpBarWrap))   this.mount.removeChild(this.hpBarWrap)
    if (this.mount.contains(this.hitVignette)) this.mount.removeChild(this.hitVignette)
    if (this.mount.contains(this.bossHPWrap))  this.mount.removeChild(this.bossHPWrap)
    if (this.mount.contains(this.skillBar))    this.mount.removeChild(this.skillBar)
    if (this.mount.contains(this.stunOverlay)) this.mount.removeChild(this.stunOverlay)
    if (this.mount.contains(this.stunText))    this.mount.removeChild(this.stunText)
  }
}
