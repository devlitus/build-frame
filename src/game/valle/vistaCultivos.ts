import type Phaser from 'phaser'
import {
  CARACTER_ARADA,
  CULTIVOS,
  defCultivo,
  faseDe,
  ladoValle,
  type EstadoJuego,
} from '../../core'
import {
  CLAVE_TIERRA_ARADA,
  FOTOGRAMAS_TIERRA,
  FOTOGRAMA_MARCHITO,
  MARCO_CULTIVO,
  claveCultivo,
  escalaNominal,
} from './arte'
import { TAM_CASILLA } from './estilo'
import { varianteDeCasilla } from './variantes'

/** Sobre las zonas (profundidad 1) y bajo las parcelas y los objetos ordenados por Y. */
const PROFUNDIDAD_TIERRA = 1.5
const SAL_TIERRA = 0x7e44

type Vista = Pick<EstadoJuego, 'tierra' | 'plantas' | 'valle'>

const VECINAS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Tierra arada y cultivos (M5-03). Un sprite por casilla arada (relleno con variante y los bordes
 * en los lados sin vecina arada) y uno por planta, con la profundidad `32(y + 1)` para que el
 * personaje pase delante o detrás. Solo se rehace lo que cambia: `tierra` y `plantas` son
 * inmutables, así que basta comparar sus referencias.
 */
export class VistaCultivos {
  private tierra: string | undefined = undefined
  private plantas: EstadoJuego['plantas'] | undefined = undefined
  private readonly sprites = new Map<number, Phaser.GameObjects.Image[]>()
  private readonly plantasVisibles = new Map<
    number,
    { img: Phaser.GameObjects.Image; firma: string }
  >()

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly lado: number,
    private readonly semilla = 0,
  ) {}

  /** Casillas aradas y plantas dibujadas ahora (ganchos de prueba). */
  get visibles(): { aradas: number; plantas: number } {
    return { aradas: this.sprites.size, plantas: this.plantasVisibles.size }
  }

  actualizar(e: Vista): void {
    if (ladoValle(e.valle) !== this.lado) return
    if (e.tierra !== this.tierra) {
      const antes = this.tierra
      this.tierra = e.tierra
      this.repintarTierra(e.tierra, antes)
    }
    if (e.plantas !== this.plantas) {
      this.plantas = e.plantas
      this.repintarPlantas(e.plantas)
    }
  }

  /** Tras perder el contexto WebGL se rehace todo. */
  invalidar(): void {
    const tierra = this.tierra
    const plantas = this.plantas
    this.limpiar()
    if (tierra !== undefined) this.repintarTierra(tierra, undefined)
    if (plantas) this.repintarPlantas(plantas)
  }

  private arada(tierra: string, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.lado || y >= this.lado) return false
    return tierra[y * this.lado + x] === CARACTER_ARADA
  }

  private repintarTierra(tierra: string, antes: string | undefined): void {
    const lado = this.lado
    const rehacer = new Set<number>()
    for (let i = 0; i < tierra.length; i++) {
      if (antes !== undefined && antes[i] === tierra[i]) continue
      const x = i % lado
      const y = Math.floor(i / lado)
      // La casilla y sus 4 vecinas: el borde de estas depende de si esta está arada.
      for (const [dx, dy] of VECINAS) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < lado && ny < lado) rehacer.add(ny * lado + nx)
      }
    }
    for (const i of rehacer) {
      for (const s of this.sprites.get(i) ?? []) s.destroy()
      this.sprites.delete(i)
      const x = i % lado
      const y = Math.floor(i / lado)
      if (!this.arada(tierra, x, y)) continue
      const poner = (fotograma: number): Phaser.GameObjects.Image =>
        this.escena.add
          .image(x * TAM_CASILLA, y * TAM_CASILLA, CLAVE_TIERRA_ARADA, fotograma)
          .setOrigin(0, 0)
          .setScale(escalaNominal(this.escena, CLAVE_TIERRA_ARADA, TAM_CASILLA, 0))
          .setDepth(PROFUNDIDAD_TIERRA)
      const imgs = [
        poner(varianteDeCasilla(this.semilla, x, y, FOTOGRAMAS_TIERRA.rellenos, SAL_TIERRA)),
      ]
      if (!this.arada(tierra, x, y - 1)) imgs.push(poner(FOTOGRAMAS_TIERRA.arriba))
      if (!this.arada(tierra, x + 1, y)) imgs.push(poner(FOTOGRAMAS_TIERRA.derecha))
      if (!this.arada(tierra, x, y + 1)) imgs.push(poner(FOTOGRAMAS_TIERRA.abajo))
      if (!this.arada(tierra, x - 1, y)) imgs.push(poner(FOTOGRAMAS_TIERRA.izquierda))
      this.sprites.set(i, imgs)
    }
  }

  private repintarPlantas(plantas: EstadoJuego['plantas']): void {
    const vivas = new Set<number>()
    for (const p of plantas) {
      const [casilla, indice, dias, , , marchita] = p
      const cultivo = CULTIVOS[indice]
      const def = defCultivo(cultivo)
      if (!cultivo || !def) continue
      vivas.add(casilla)
      const fotograma = marchita === 1 ? FOTOGRAMA_MARCHITO : faseDe(def, dias)
      const firma = `${cultivo}:${fotograma}`
      const actual = this.plantasVisibles.get(casilla)
      if (actual?.firma === firma) continue
      actual?.img.destroy()
      const x = casilla % this.lado
      const y = Math.floor(casilla / this.lado)
      const img = this.escena.add
        .image(
          x * TAM_CASILLA + TAM_CASILLA / 2,
          (y + 1) * TAM_CASILLA,
          claveCultivo(cultivo),
          fotograma,
        )
        .setOrigin(0.5, 1)
        .setScale(escalaNominal(this.escena, claveCultivo(cultivo), MARCO_CULTIVO.ancho, 0))
        .setDepth((y + 1) * TAM_CASILLA)
      this.plantasVisibles.set(casilla, { img, firma })
    }
    for (const [casilla, { img }] of this.plantasVisibles) {
      if (vivas.has(casilla)) continue
      img.destroy()
      this.plantasVisibles.delete(casilla)
    }
  }

  private limpiar(): void {
    for (const imgs of this.sprites.values()) for (const s of imgs) s.destroy()
    this.sprites.clear()
    for (const { img } of this.plantasVisibles.values()) img.destroy()
    this.plantasVisibles.clear()
  }

  destruir(): void {
    this.limpiar()
  }
}
