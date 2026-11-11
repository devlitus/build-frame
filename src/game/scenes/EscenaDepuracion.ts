import Phaser from 'phaser'

/** Intervalo mínimo entre actualizaciones del contador (ms): unas 4 veces por segundo. */
export const INTERVALO_FPS_MS = 250

/**
 * Escena de depuración, solo con `?debug`: corre en paralelo con su propia cámara
 * (no le afectan el zoom ni el desplazamiento del valle) y muestra las fps.
 */
export class EscenaDepuracion extends Phaser.Scene {
  private texto?: Phaser.GameObjects.Text
  private ultima = -Infinity

  constructor() {
    super('depuracion')
  }

  create(): void {
    this.texto = this.add
      .text(8, 8, 'fps …', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 3 },
      })
      .setDepth(1000)
    this.scene.bringToTop()
  }

  override update(tiempo: number): void {
    if (!this.texto || tiempo - this.ultima < INTERVALO_FPS_MS) return
    this.ultima = tiempo
    this.texto.setText(`${Math.round(this.game.loop.actualFps)} fps`)
  }

  /** Texto actual del contador, para los tests. */
  get contenido(): string | undefined {
    return this.texto?.text
  }
}
