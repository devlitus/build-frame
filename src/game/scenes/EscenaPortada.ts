import Phaser from 'phaser'

/** Fondo placeholder de la portada: cielo, colinas y parcelas (sin arte final, ROADMAP). */
export class EscenaPortada extends Phaser.Scene {
  constructor() {
    super('portada')
  }

  create(): void {
    this.dibujar()
    this.scale.on('resize', () => this.dibujar())
  }

  private dibujar(): void {
    this.children.removeAll(true)
    const { width: an, height: al } = this.scale
    const g = this.add.graphics()

    g.fillGradientStyle(0xf7c98b, 0xf7c98b, 0x9fd3e6, 0x9fd3e6, 1)
    g.fillRect(0, 0, an, al * 0.6)

    g.fillStyle(0x7fa86a)
    g.fillEllipse(an * 0.2, al * 0.62, an * 0.9, al * 0.35)
    g.fillStyle(0x6b9a58)
    g.fillEllipse(an * 0.85, al * 0.64, an * 0.9, al * 0.3)

    g.fillStyle(0x5c8a4a)
    g.fillRect(0, al * 0.6, an, al * 0.4)

    // Cuadrícula de parcelas en perspectiva suave.
    const filas = 4
    const columnas = 8
    for (let f = 0; f < filas; f++) {
      const y0 = al * (0.62 + f * 0.095)
      const alto = al * 0.085
      for (let c = 0; c < columnas; c++) {
        const ancho = an / columnas
        const color = (f + c) % 3 === 0 ? 0x8a5a3b : (f + c) % 3 === 1 ? 0x6fa04f : 0x86b35c
        g.fillStyle(color, 0.9)
        g.fillRect(c * ancho + 3, y0, ancho - 6, alto)
      }
    }
  }
}
