import Phaser from 'phaser'
import { EscenaPortada } from './scenes/EscenaPortada'

export function crearJuego(padre: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: padre,
    backgroundColor: '#3f5d3a',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [EscenaPortada],
  })
}
