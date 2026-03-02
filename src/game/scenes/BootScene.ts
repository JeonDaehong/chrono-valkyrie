import Phaser from 'phaser'
import mainBgUrl from '@assets/img/main.jpg?url'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    const { width, height } = this.scale

    const bar = this.add.rectangle(width / 2 - 200, height / 2 + 40, 0, 12, 0x00ff88)
    bar.setOrigin(0, 0.5)
    this.add.rectangle(width / 2, height / 2 + 40, 400, 12, 0x333333).setDepth(-1)
    this.add.text(width / 2, height / 2, 'LOADING...', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5)
    this.load.on('progress', (v: number) => { bar.width = 400 * v })

    this.load.image('main_bg', mainBgUrl)
  }

  create() {
    this.textures.get('main_bg').setFilter(Phaser.Textures.FilterMode.LINEAR)
    this.scene.start('MenuScene')
  }
}
