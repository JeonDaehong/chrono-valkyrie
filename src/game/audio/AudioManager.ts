export interface AudioSettings {
  bgmVolume: number   // 0–1
  bgmMuted:  boolean
  sfxVolume: number   // 0–1
  sfxMuted:  boolean
}

const STORAGE_KEY = 'game:audioSettings'
const DEFAULTS: AudioSettings = { bgmVolume: 0.7, bgmMuted: false, sfxVolume: 1.0, sfxMuted: false }

export class AudioManager {
  private bgm:        HTMLAudioElement | null = null
  private bgmBaseVol  = 0.4
  private bgmVolume:  number
  private bgmMuted:   boolean
  private sfxVolume:  number
  private sfxMuted:   boolean

  // ── 정적 설정 헬퍼 (Phaser MenuScene 등에서도 호출 가능) ─────────────
  static getSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) }
    } catch { /* ignore */ }
    return { ...DEFAULTS }
  }

  static saveSettings(s: AudioSettings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }

  // ── 생성자: localStorage 에서 설정 로드 ──────────────────────────────
  constructor() {
    const s     = AudioManager.getSettings()
    this.bgmVolume = s.bgmVolume
    this.bgmMuted  = s.bgmMuted
    this.sfxVolume = s.sfxVolume
    this.sfxMuted  = s.sfxMuted
  }

  // ── BGM ──────────────────────────────────────────────────────────────
  playBGM(url: string, baseVolume = 0.4) {
    this.bgmBaseVol  = baseVolume
    this.bgm         = document.createElement('audio')
    this.bgm.src     = url
    this.bgm.loop    = true
    this.bgm.volume  = this.bgmMuted ? 0 : Math.min(1, baseVolume * this.bgmVolume)
    this.bgm.play().catch(() => {})
  }

  setBgmVolume(v: number) {
    this.bgmVolume = v
    if (this.bgm && !this.bgmMuted) this.bgm.volume = Math.min(1, this.bgmBaseVol * v)
    AudioManager.saveSettings(this._snap())
  }

  setBgmMuted(muted: boolean) {
    this.bgmMuted = muted
    if (this.bgm) this.bgm.volume = muted ? 0 : Math.min(1, this.bgmBaseVol * this.bgmVolume)
    AudioManager.saveSettings(this._snap())
  }

  // ── SFX ──────────────────────────────────────────────────────────────
  playSound(url: string, baseVolume = 1.0) {
    if (this.sfxMuted) return
    const audio    = new Audio(url)
    audio.volume   = Math.min(1, baseVolume * this.sfxVolume)
    audio.play().catch(() => {})
  }

  setSfxVolume(v: number) {
    this.sfxVolume = v
    AudioManager.saveSettings(this._snap())
  }

  setSfxMuted(muted: boolean) {
    this.sfxMuted = muted
    AudioManager.saveSettings(this._snap())
  }

  dispose() {
    if (this.bgm) { this.bgm.pause(); this.bgm.src = '' }
  }

  private _snap(): AudioSettings {
    return { bgmVolume: this.bgmVolume, bgmMuted: this.bgmMuted, sfxVolume: this.sfxVolume, sfxMuted: this.sfxMuted }
  }
}
