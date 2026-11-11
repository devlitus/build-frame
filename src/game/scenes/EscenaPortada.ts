import Phaser from 'phaser'

const CLAVE_FONDO = 'portada-fondo'

/**
 * Punto de la ilustración que siempre queda visible al recortar (0–1).
 * En vertical se centra en el sol, el río y el pueblo.
 */
const FOCO = { x: 0.55, y: 0.6 }

/** Fondo ilustrado de la portada (ficha: assets-src/fichas/portada.md). */
export class EscenaPortada extends Phaser.Scene {
  private fondo?: Phaser.GameObjects.Image

  constructor() {
    super('portada')
  }

  preload(): void {
    const pixeles = Math.max(this.scale.width, this.scale.height) * window.devicePixelRatio
    const ancho = pixeles > 1100 ? 1664 : 960
    this.load.image(CLAVE_FONDO, `assets/portada/portada-${ancho}.webp`)
  }

  create(): void {
    this.fondo = this.add.image(0, 0, CLAVE_FONDO)
    this.ajustar()
    this.scale.on('resize', () => this.ajustar())
    this.cameras.main.fadeIn(600, 63, 93, 58)
  }

  /** Escala tipo `object-fit: cover`, manteniendo el foco a la vista. */
  private ajustar(): void {
    if (!this.fondo) return
    const { width: an, height: al } = this.scale
    const escala = Math.max(an / this.fondo.width, al / this.fondo.height)
    const anchoImg = this.fondo.width * escala
    const altoImg = this.fondo.height * escala
    const x = Phaser.Math.Clamp(an / 2 - (FOCO.x - 0.5) * anchoImg, an - anchoImg / 2, anchoImg / 2)
    const y = Phaser.Math.Clamp(al / 2 - (FOCO.y - 0.5) * altoImg, al - altoImg / 2, altoImg / 2)
    this.fondo.setScale(escala).setPosition(x, y)
  }
}
