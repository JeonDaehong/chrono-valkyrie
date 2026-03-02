import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '@game/config/GameConfig'
import { AudioManager } from '../audio/AudioManager'

const W = GAME_WIDTH
const H = GAME_HEIGHT

const MENU_ITEMS = ['New Game', 'Load Game', 'Setting', 'Quit'] as const
type MenuItem = typeof MENU_ITEMS[number]

// 스크램블 이펙트용 문자셋
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&<>?/\\|~^'

// 컬러 팔레트
const CLR = {
  CYAN:      0x00e5ff,
  CYAN_S:    '#00e5ff',
  CYAN_DIM:  '#004455',
  PURPLE:    0x7700ff,
  WHITE:     '#ffffff',
  GREY:      '#445566',
  DIM:       '#223344',
  ORANGE:    '#ff6600',
  BG:        0x020c14,
} as const

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0
  private menuTexts: Phaser.GameObjects.Text[] = []
  private inputLocked = true
  // ── 설정 패널 상태 ───────────────────────────────────────────────────
  private _settingObjects:     Phaser.GameObjects.GameObject[] = []
  private _settingDragging:    'bgm' | 'sfx' | null = null
  private _settingMoveHandler: ((ptr: Phaser.Input.Pointer) => void) | null = null
  private _settingUpHandler:   (() => void) | null = null
  private _settingEscCb:       (() => void) | null = null

  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    this.inputLocked = true
    this.menuTexts = []
    this.selectedIndex = 0

    this._placeBg()
    this._createOverlay()
    this._createScanline()
    this._createCornerBrackets()
    this._createAmbientParticles()
    this._createStatusBar()

    // 검은 화면 → 페이드 인 후 시퀀스 시작
    this.cameras.main.fadeIn(900, 0, 0, 0, (_: unknown, t: number) => {
      if (t === 1) this._startSequence()
    })
  }

  // ─── 배경 이미지 (커버 피팅 + LINEAR 필터) ─────────────────────────────
  private _placeBg() {
    const tex = this.textures.get('main_bg').source[0]
    const imgW = tex.width  || W
    const imgH = tex.height || H
    const scale = Math.max(W / imgW, H / imgH)

    this.add.image(W / 2, H / 2, 'main_bg')
      .setScale(scale)
      .setDepth(0)
  }

  // ─── 다크 그라디언트 오버레이 ────────────────────────────────────────────
  private _createOverlay() {
    const gfx = this.add.graphics().setDepth(1)

    gfx.fillStyle(CLR.BG, 0.55)
    gfx.fillRect(0, 0, W, H)

    for (let i = 0; i < 8; i++) {
      const alpha = 0.06 * (i + 1)
      gfx.fillStyle(0x000000, alpha)
      gfx.fillRect(0, H - (i + 1) * 100, W, 100)
    }

    gfx.fillStyle(CLR.CYAN, 0.08)
    gfx.fillRect(0, 0, W, 2)
    gfx.fillStyle(CLR.CYAN, 0.04)
    gfx.fillRect(0, 2, W, 1)
  }

  // ─── 스캔라인 ────────────────────────────────────────────────────────
  private _createScanline() {
    const line = this.add.rectangle(0, 0, W, 2, CLR.CYAN, 0.05).setOrigin(0, 0).setDepth(50)
    this.tweens.add({ targets: line, y: H, duration: 5000, repeat: -1, ease: 'Linear' })

    const line2 = this.add.rectangle(0, H * 0.4, W, 1, CLR.CYAN, 0.03).setOrigin(0, 0).setDepth(50)
    this.tweens.add({ targets: line2, y: H, duration: 3200, repeat: -1, ease: 'Linear', delay: 1600 })
  }

  // ─── 코너 브라켓 ────────────────────────────────────────────────────────
  private _createCornerBrackets() {
    const gfx = this.add.graphics().setDepth(5).setAlpha(0)
    const len = 28, thick = 2, pad = 16
    const col = CLR.CYAN

    const drawBracket = (x: number, y: number, dirX: number, dirY: number) => {
      gfx.fillStyle(col, 0.7)
      gfx.fillRect(x, y, dirX * len, thick)
      gfx.fillRect(x, y, thick, dirY * len)
      gfx.fillStyle(col, 1)
      gfx.fillRect(x + dirX * len - (dirX > 0 ? thick : 0), y, thick * 2, thick)
    }

    drawBracket(pad, pad, 1, 1)
    drawBracket(W - pad - len, pad, 1, 1)
    drawBracket(pad, H - pad - thick, 1, -1)
    drawBracket(W - pad - len, H - pad - thick, 1, -1)

    gfx.fillStyle(col, 0.2)
    gfx.fillRect(pad, pad + len + 8, thick, H - (pad + len + 8) * 2)

    this.tweens.add({ targets: gfx, alpha: 1, duration: 1000, delay: 400 })
  }

  // ─── 앰비언트 파티클 ─────────────────────────────────────────────────
  private _createAmbientParticles() {
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(60, W - 60)
      const y = Phaser.Math.Between(80, H - 80)
      const size = Phaser.Math.Between(2, 5)
      const alpha = Phaser.Math.FloatBetween(0.1, 0.35)

      const p = this.add.star(x, y, 4, size * 0.4, size, CLR.CYAN, alpha).setDepth(3)

      this.tweens.add({
        targets: p,
        y: y - Phaser.Math.Between(40, 100),
        alpha: 0,
        duration: Phaser.Math.Between(3500, 7000),
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        onRepeat: () => {
          p.setPosition(Phaser.Math.Between(60, W - 60), y)
          p.setAlpha(alpha)
        },
      })
    }
  }

  // ─── 하단 상태 바 ────────────────────────────────────────────────────────
  private _createStatusBar() {
    const gfx = this.add.graphics().setDepth(10)
    gfx.fillStyle(CLR.CYAN, 0.06)
    gfx.fillRect(0, H - 26, W, 26)
    gfx.fillStyle(CLR.CYAN, 0.25)
    gfx.fillRect(0, H - 26, W, 1)

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: CLR.GREY,
    }

    this.add.text(16, H - 17, 'SYS:READY', style).setOrigin(0, 0.5).setDepth(11)
    this.add.text(W / 2, H - 17, '◆', { ...style, color: CLR.CYAN_S, fontSize: '10px' }).setOrigin(0.5).setDepth(11)
    this.add.text(W - 16, H - 17, 'VER 0.1.0', style).setOrigin(1, 0.5).setDepth(11)
  }

  // ─── 등장 시퀀스 ─────────────────────────────────────────────────────────
  private _startSequence() {
    this._spawnSysLog(() => {
      this._spawnTitle(() => {
        this._spawnDivider()
        this._spawnMenu()
        this._setupInput()
      })
    })
  }

  // ─── [SYS LOG] 텍스트 ────────────────────────────────────────────────
  private _spawnSysLog(onComplete: () => void) {
    const lines = [
      '> SYSTEM BOOT COMPLETE',
      '> LOADING COMBAT MODULE...',
      '> NEURAL LINK ESTABLISHED',
    ]
    const x = W - 50
    let lineY = H - 500
    let lineIdx = 0

    const spawnLine = () => {
      if (lineIdx >= lines.length) { onComplete(); return }

      const t = this.add.text(x, lineY, '', {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '12px',
        color: CLR.CYAN_S,
        alpha: 0.6,
      } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(1, 0).setDepth(10)

      const full = lines[lineIdx]
      let charIdx = 0

      const typer = this.time.addEvent({
        delay: 28,
        repeat: full.length - 1,
        callback: () => {
          charIdx++
          t.setText(full.slice(0, charIdx))
          if (charIdx >= full.length) {
            typer.destroy()
            lineIdx++
            lineY += 18
            this.time.delayedCall(80, spawnLine)
          }
        },
      })
    }

    spawnLine()
  }

  // ─── 타이틀 ──────────────────────────────────────────────────────────
  private _spawnTitle(onComplete: () => void) {
    const TARGET   = 'ACTION RPG'
    const anchorX  = W - 50
    const anchorY  = H - 400

    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'Orbitron', 'Arial Black', sans-serif",
      fontSize: '72px',
      fontStyle: 'bold',
      color: CLR.WHITE,
      stroke: '#000000',
      strokeThickness: 4,
    }

    const glow1 = this.add.text(anchorX + 2, anchorY + 2, TARGET, {
      ...baseStyle, color: CLR.CYAN_S, strokeThickness: 0,
    }).setOrigin(1, 0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(12)

    const glow2 = this.add.text(anchorX, anchorY, TARGET, {
      ...baseStyle, color: CLR.CYAN_S, strokeThickness: 0,
    }).setOrigin(1, 0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(12).setScale(1.015)

    const red = this.add.text(anchorX + 8, anchorY + 2, TARGET, {
      ...baseStyle, color: '#ff2244', strokeThickness: 0,
    }).setOrigin(1, 0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(11)

    const blue = this.add.text(anchorX - 8, anchorY + 2, TARGET, {
      ...baseStyle, color: '#2244ff', strokeThickness: 0,
    }).setOrigin(1, 0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(11)

    const title = this.add.text(anchorX, anchorY, '', baseStyle)
      .setOrigin(1, 0).setDepth(13)

    this._scrambleDecode(title, TARGET, () => {
      glow1.setAlpha(0.35)
      glow2.setAlpha(0.20)

      red.setAlpha(0.6)
      blue.setAlpha(0.6)
      this.tweens.add({
        targets: [red, blue],
        alpha: 0,
        x: { value: '+= 0' },
        duration: 400,
        repeat: 2,
        yoyo: true,
        ease: 'Stepped',
        onComplete: () => { red.destroy(); blue.destroy() },
      })

      this._spawnShockwave(anchorX - title.width / 2, anchorY + title.height / 2)

      this.tweens.add({
        targets: [title, glow1, glow2],
        scaleX: { from: 1.08, to: 1 },
        scaleY: { from: 1.08, to: 1 },
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: [glow1, glow2],
            alpha: { from: 0.35, to: 0.12 },
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          })
          onComplete()
        },
      })
    })
  }

  private _scrambleDecode(
    target: Phaser.GameObjects.Text,
    text: string,
    onComplete: () => void,
  ) {
    let revealed = 0
    let frame = 0

    this.time.addEvent({
      delay: 28,
      repeat: -1,
      callback: function (this: Phaser.Time.TimerEvent) {
        frame++
        let display = text.slice(0, revealed)
        for (let i = revealed; i < text.length; i++) {
          display += text[i] === ' '
            ? ' '
            : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]
        }
        target.setText(display)

        if (frame % 3 === 0 && revealed < text.length) {
          revealed++
          if (revealed >= text.length) {
            this.destroy()
            target.setText(text)
            onComplete()
          }
        }
      },
    })
  }

  private _spawnShockwave(cx: number, cy: number) {
    const ring = this.add.ellipse(cx, cy, 4, 4)
      .setStrokeStyle(2, CLR.CYAN, 1).setFillStyle().setDepth(15)
    this.tweens.add({
      targets: ring,
      displayWidth: 600,
      displayHeight: 80,
      alpha: { from: 0.9, to: 0 },
      duration: 600,
      ease: 'Power2.easeOut',
      onComplete: () => ring.destroy(),
    })

    const ring2 = this.add.ellipse(cx, cy, 4, 4)
      .setStrokeStyle(1, CLR.CYAN, 0.5).setFillStyle().setDepth(15)
    this.tweens.add({
      targets: ring2,
      displayWidth: 300,
      displayHeight: 40,
      alpha: { from: 0.6, to: 0 },
      duration: 400,
      delay: 80,
      ease: 'Power2.easeOut',
      onComplete: () => ring2.destroy(),
    })
  }

  // ─── 구분선 ──────────────────────────────────────────────────────────────
  private _spawnDivider() {
    const anchorX = W - 50
    const anchorY = H - 228

    const line = this.add.rectangle(anchorX, anchorY, 0, 1, CLR.CYAN, 0.6)
      .setOrigin(1, 0).setDepth(12)
    this.tweens.add({ targets: line, width: 480, duration: 350, ease: 'Power3.easeOut' })

    const dot = this.add.rectangle(anchorX - 480, anchorY, 4, 4, CLR.CYAN, 0.9)
      .setOrigin(0.5).setDepth(12).setAlpha(0)
    this.tweens.add({ targets: dot, alpha: 1, duration: 200, delay: 340 })
  }

  // ─── 메뉴 항목 ───────────────────────────────────────────────────────────
  private _spawnMenu() {
    const anchorX = W - 50
    const startY  = H - 280

    MENU_ITEMS.forEach((label, i) => {
      const y = startY + i * 38

      const marker = this.add.text(anchorX - 12, y + 1, '▶', {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '11px',
        color: CLR.CYAN_S,
      }).setOrigin(1, 0).setDepth(12).setAlpha(0)

      const t = this.add.text(anchorX + 60, y, label.toUpperCase(), {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '20px',
        fontStyle: 'normal',
        color: CLR.GREY,
        stroke: '#000000',
        strokeThickness: 2,
        letterSpacing: 3,
      } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(1, 0)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true })
        .setDepth(12)

      this.tweens.add({
        targets: t,
        alpha: 1,
        x: anchorX,
        duration: 220,
        delay: i * 80,
        ease: 'Power2.easeOut',
      })

      t.on('pointerover', () => { this.selectedIndex = i; this._updateSelection() })
      t.on('pointerdown', () => this._select(MENU_ITEMS[i]))

      this.menuTexts.push(t)
      ;(t as any)._marker = marker
    })

    this._updateSelection()
  }

  // ─── 선택 강조 ───────────────────────────────────────────────────────────
  private _updateSelection() {
    this.menuTexts.forEach((t, i) => {
      const marker = (t as any)._marker as Phaser.GameObjects.Text
      if (i === this.selectedIndex) {
        t.setColor(CLR.WHITE).setFontSize(22)
        marker.setAlpha(1)
        this.tweens.add({ targets: t, x: W - 50, duration: 90, ease: 'Power2' })
      } else {
        t.setColor(CLR.GREY).setFontSize(20)
        marker.setAlpha(0)
        this.tweens.add({ targets: t, x: W - 50, duration: 90, ease: 'Power2' })
      }
    })
  }

  // ─── 키 입력 ─────────────────────────────────────────────────────────────
  private _setupInput() {
    this.inputLocked = false
    const kb = this.input.keyboard!

    kb.on('keydown-UP', () => {
      if (this.inputLocked) return
      this.selectedIndex = (this.selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
      this._updateSelection()
    })
    kb.on('keydown-DOWN', () => {
      if (this.inputLocked) return
      this.selectedIndex = (this.selectedIndex + 1) % MENU_ITEMS.length
      this._updateSelection()
    })
    kb.on('keydown-ENTER', () => {
      if (this.inputLocked) return
      this._select(MENU_ITEMS[this.selectedIndex])
    })
  }

  // ─── 메뉴 실행 ───────────────────────────────────────────────────────────
  private _select(item: MenuItem) {
    if (this.inputLocked) return
    this.inputLocked = true

    const t = this.menuTexts[MENU_ITEMS.indexOf(item)]
    this.tweens.add({
      targets: t,
      alpha: 0,
      duration: 45,
      yoyo: true,
      repeat: 3,
      onComplete: () => this._execute(item),
    })
  }

  private _execute(item: MenuItem) {
    switch (item) {
      case 'New Game':
        this.cameras.main.fadeOut(400, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          window.dispatchEvent(new CustomEvent('game:startWorld'))
        })
        break
      case 'Load Game':
        this.inputLocked = false
        break
      case 'Setting':
        this._showSettingPanel()
        break
      case 'Quit':
        window.close()
        break
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ─── 설정 패널 ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  private _showSettingPanel() {
    if (this._settingObjects.length > 0) return

    const s = AudioManager.getSettings()
    let bgmVol   = s.bgmVolume
    let bgmMuted = s.bgmMuted
    let sfxVol   = s.sfxVolume
    let sfxMuted = s.sfxMuted

    // 패널 레이아웃 상수
    const PX = W / 2 - 230, PY = H / 2 - 145
    const PW = 460,          PH = 290
    const TX = PX + 28,      TW = 270          // 슬라이더 트랙
    const MUTE_X  = PX + PW - 20               // 음소거 버튼 우측 정렬
    const BGM_LY  = PY + 82,  BGM_TY = PY + 108  // BGM 레이블·트랙 Y
    const SFX_LY  = PY + 162, SFX_TY = PY + 188  // SFX 레이블·트랙 Y
    const CLOSE_Y = PY + PH - 32

    const D = 200   // 베이스 depth

    // helper — 배열 등록 후 반환
    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this._settingObjects.push(o); return o
    }

    // ── 딤 오버레이 (클릭 블로킹) ──
    reg(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78)
      .setDepth(D).setInteractive())

    // ── 패널 배경 ──
    const bg = reg(this.add.graphics().setDepth(D + 1))
    bg.fillStyle(CLR.BG, 0.97)
    bg.fillRect(PX, PY, PW, PH)
    bg.lineStyle(1, CLR.CYAN, 0.4)
    bg.strokeRect(PX, PY, PW, PH)
    bg.lineStyle(2, CLR.CYAN, 1.0)
    bg.lineBetween(PX + 20, PY, PX + PW - 20, PY)   // 상단 강조선
    bg.lineStyle(1, CLR.CYAN, 0.15)
    bg.lineBetween(PX + 20, PY + PH, PX + PW - 20, PY + PH)  // 하단 약선

    // ── 타이틀 ──
    reg(this.add.text(PX + PW / 2, PY + 28, '[ AUDIO SETTINGS ]', {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: '14px',
      color: CLR.CYAN_S,
      letterSpacing: 4,
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0.5, 0.5).setDepth(D + 2))

    // 타이틀 구분선
    const div = reg(this.add.graphics().setDepth(D + 2))
    div.fillStyle(CLR.CYAN, 0.18)
    div.fillRect(PX + 20, PY + 48, PW - 40, 1)

    // ── 트랙 + 썸 그래픽 ──
    const trackGfx = reg(this.add.graphics().setDepth(D + 2))

    const drawTracks = () => {
      trackGfx.clear()
      // BGM 트랙
      trackGfx.fillStyle(0x112233, 1)
      trackGfx.fillRect(TX, BGM_TY - 3, TW, 6)
      trackGfx.fillStyle(bgmMuted ? 0x334455 : CLR.CYAN, 0.85)
      trackGfx.fillRect(TX, BGM_TY - 3, bgmVol * TW, 6)
      // BGM 틱
      for (let i = 1; i < 10; i++) {
        trackGfx.fillStyle(0x224466, 0.5)
        trackGfx.fillRect(TX + (i / 10) * TW - 0.5, BGM_TY - 7, 1, 4)
      }
      // SFX 트랙
      trackGfx.fillStyle(0x112233, 1)
      trackGfx.fillRect(TX, SFX_TY - 3, TW, 6)
      trackGfx.fillStyle(sfxMuted ? 0x334455 : CLR.CYAN, 0.85)
      trackGfx.fillRect(TX, SFX_TY - 3, sfxVol * TW, 6)
      // SFX 틱
      for (let i = 1; i < 10; i++) {
        trackGfx.fillStyle(0x224466, 0.5)
        trackGfx.fillRect(TX + (i / 10) * TW - 0.5, SFX_TY - 7, 1, 4)
      }
    }
    drawTracks()

    // 썸 (직사각형 핸들)
    const bgmThumb = reg(this.add.rectangle(TX + bgmVol * TW, BGM_TY, 10, 20, CLR.CYAN)
      .setDepth(D + 3))
    const sfxThumb = reg(this.add.rectangle(TX + sfxVol * TW, SFX_TY, 10, 20, CLR.CYAN)
      .setDepth(D + 3))

    const refreshThumbs = () => {
      bgmThumb.setPosition(TX + bgmVol * TW, BGM_TY).setFillStyle(bgmMuted ? 0x334455 : CLR.CYAN)
      sfxThumb.setPosition(TX + sfxVol * TW, SFX_TY).setFillStyle(sfxMuted ? 0x334455 : CLR.CYAN)
    }

    // ── BGM 레이블 & 퍼센트 ──
    reg(this.add.text(TX, BGM_LY, 'BGM', {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: CLR.GREY,
      letterSpacing: 3,
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0, 0.5).setDepth(D + 2))

    const bgmPct = reg(this.add.text(TX + TW + 12, BGM_TY, `${Math.round(bgmVol * 100)}%`, {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '12px',
      color: CLR.WHITE,
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0, 0.5).setDepth(D + 2)) as Phaser.GameObjects.Text

    // ── BGM 음소거 버튼 ──
    const bgmMuteBtn = reg(this.add.text(MUTE_X, BGM_LY, bgmMuted ? '[ MUTED ]' : '[ SOUND ]', {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: bgmMuted ? CLR.ORANGE : CLR.CYAN_S,
    } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(1, 0.5).setDepth(D + 2)
      .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Text

    bgmMuteBtn.on('pointerdown', () => {
      bgmMuted = !bgmMuted
      bgmMuteBtn.setText(bgmMuted ? '[ MUTED ]' : '[ SOUND ]')
                .setColor(bgmMuted ? CLR.ORANGE : CLR.CYAN_S)
      bgmPct.setColor(bgmMuted ? CLR.GREY : CLR.WHITE)
      drawTracks(); refreshThumbs()
      AudioManager.saveSettings({ bgmVolume: bgmVol, bgmMuted, sfxVolume: sfxVol, sfxMuted })
    })

    // ── SFX 레이블 & 퍼센트 ──
    reg(this.add.text(TX, SFX_LY, 'SFX', {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: CLR.GREY,
      letterSpacing: 3,
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0, 0.5).setDepth(D + 2))

    const sfxPct = reg(this.add.text(TX + TW + 12, SFX_TY, `${Math.round(sfxVol * 100)}%`, {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '12px',
      color: CLR.WHITE,
    } as Phaser.Types.GameObjects.Text.TextStyle).setOrigin(0, 0.5).setDepth(D + 2)) as Phaser.GameObjects.Text

    // ── SFX 음소거 버튼 ──
    const sfxMuteBtn = reg(this.add.text(MUTE_X, SFX_LY, sfxMuted ? '[ MUTED ]' : '[ SOUND ]', {
      fontFamily: "'Share Tech Mono', monospace",
      fontSize: '11px',
      color: sfxMuted ? CLR.ORANGE : CLR.CYAN_S,
    } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(1, 0.5).setDepth(D + 2)
      .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Text

    sfxMuteBtn.on('pointerdown', () => {
      sfxMuted = !sfxMuted
      sfxMuteBtn.setText(sfxMuted ? '[ MUTED ]' : '[ SOUND ]')
                .setColor(sfxMuted ? CLR.ORANGE : CLR.CYAN_S)
      sfxPct.setColor(sfxMuted ? CLR.GREY : CLR.WHITE)
      drawTracks(); refreshThumbs()
      AudioManager.saveSettings({ bgmVolume: bgmVol, bgmMuted, sfxVolume: sfxVol, sfxMuted })
    })

    // ── 슬라이더 히트존 (투명 — 드래그 입력 수신) ──
    const bgmZone = reg(this.add.rectangle(TX + TW / 2, BGM_TY, TW + 16, 24)
      .setDepth(D + 3).setInteractive({ useHandCursor: true }).setAlpha(0.01))

    const sfxZone = reg(this.add.rectangle(TX + TW / 2, SFX_TY, TW + 16, 24)
      .setDepth(D + 3).setInteractive({ useHandCursor: true }).setAlpha(0.01))

    const applyBgm = (x: number) => {
      bgmVol = Phaser.Math.Clamp((x - TX) / TW, 0, 1)
      bgmPct.setText(`${Math.round(bgmVol * 100)}%`)
      drawTracks(); refreshThumbs()
    }
    const applySfx = (x: number) => {
      sfxVol = Phaser.Math.Clamp((x - TX) / TW, 0, 1)
      sfxPct.setText(`${Math.round(sfxVol * 100)}%`)
      drawTracks(); refreshThumbs()
    }

    bgmZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this._settingDragging = 'bgm'; applyBgm(ptr.x)
    })
    sfxZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this._settingDragging = 'sfx'; applySfx(ptr.x)
    })

    this._settingMoveHandler = (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return
      if (this._settingDragging === 'bgm') {
        applyBgm(ptr.x)
        AudioManager.saveSettings({ bgmVolume: bgmVol, bgmMuted, sfxVolume: sfxVol, sfxMuted })
      } else if (this._settingDragging === 'sfx') {
        applySfx(ptr.x)
        AudioManager.saveSettings({ bgmVolume: bgmVol, bgmMuted, sfxVolume: sfxVol, sfxMuted })
      }
    }
    this._settingUpHandler = () => {
      if (this._settingDragging) {
        AudioManager.saveSettings({ bgmVolume: bgmVol, bgmMuted, sfxVolume: sfxVol, sfxMuted })
        this._settingDragging = null
      }
    }
    this.input.on('pointermove', this._settingMoveHandler)
    this.input.on('pointerup',   this._settingUpHandler)

    // ── CLOSE 버튼 ──
    const closeBtn = reg(this.add.text(PX + PW / 2, CLOSE_Y, '[ CLOSE ]', {
      fontFamily: "'Orbitron', sans-serif",
      fontSize: '13px',
      color: CLR.GREY,
      letterSpacing: 3,
    } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5, 0.5).setDepth(D + 2)
      .setInteractive({ useHandCursor: true })) as Phaser.GameObjects.Text

    closeBtn.on('pointerover', () => closeBtn.setColor(CLR.WHITE))
    closeBtn.on('pointerout',  () => closeBtn.setColor(CLR.GREY))
    closeBtn.on('pointerdown', () => this._hideSettingPanel())

    // ── ESC 닫기 ──
    this._settingEscCb = () => this._hideSettingPanel()
    this.input.keyboard!.on('keydown-ESC', this._settingEscCb)
  }

  private _hideSettingPanel() {
    for (const o of this._settingObjects) o.destroy()
    this._settingObjects   = []
    this._settingDragging  = null

    if (this._settingMoveHandler) this.input.off('pointermove', this._settingMoveHandler)
    if (this._settingUpHandler)   this.input.off('pointerup',   this._settingUpHandler)
    if (this._settingEscCb)       this.input.keyboard!.off('keydown-ESC', this._settingEscCb)

    this._settingMoveHandler = null
    this._settingUpHandler   = null
    this._settingEscCb       = null

    this.inputLocked = false
  }
}
