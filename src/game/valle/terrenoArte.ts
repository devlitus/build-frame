import type Phaser from 'phaser'
import { claveCasilla, type Casilla, type Decoracion, type Valle } from '../../core'
import {
  CLAVE_ARBOL,
  CLAVE_ROCA,
  MARCO_ARBOL,
  MARCO_ROCA,
  TILE_DE_TERRENO,
  TILE_RIO,
  TILE_VADO,
  VARIANTES_TILE,
  claveTile,
  crearSello,
  escalaNominal,
} from './arte'
import { TAM_CASILLA as T } from './estilo'
import type { Trozo } from './trozos'
import { varianteDeCasilla } from './variantes'

/** Datos del valle que se hornean: no cambian durante la partida. */
export interface DatosTerreno {
  readonly valle: Valle
  readonly rio: readonly Casilla[]
  readonly vados: ReadonlySet<number>
  readonly decoracion: readonly Decoracion[]
  readonly semilla: number
}

/** Variación de tamaño de la decoración con su `variante` (0 a 1): de 0,9 a 1,1 veces el tamaño nominal. */
export function escalaDecoracion(variante: number): number {
  return 0.9 + 0.2 * Math.min(1, Math.max(0, variante))
}

/**
 * Rectángulo del mundo (px) que cubre la decoración de una casilla: el sprite tiene el pivote en
 * la base, centrado, y sobresale de la casilla (el árbol hacia arriba y a los lados).
 */
export function rectDecoracion(d: Decoracion): { x0: number; y0: number; x1: number; y1: number } {
  const marco = d.tipo === 'arbol' ? MARCO_ARBOL : MARCO_ROCA
  const k = escalaDecoracion(d.variante)
  const base = (d.y + 1) * T
  const centro = d.x * T + T / 2
  return {
    x0: centro - (marco.ancho * k) / 2,
    x1: centro + (marco.ancho * k) / 2,
    y0: base - marco.alto * k,
    y1: base,
  }
}

/** Decoración ordenada de atrás adelante (por fila de la base y luego por columna). */
export function ordenarDecoracion(decoracion: readonly Decoracion[]): readonly Decoracion[] {
  return [...decoracion].sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Pinta un trozo del terreno y la decoración con las texturas del arte, sobre la `RenderTexture`
 * del trozo (entre `beginDraw` y `endDraw`). Los tiles van en posiciones enteras del mundo y se
 * tocan sin hueco; la decoración se ordena de atrás adelante y entra también si solo sobresale
 * en el trozo (un árbol del trozo de abajo con la copa en este).
 */
export function pintarTrozoTerreno(
  escena: Phaser.Scene,
  rt: Phaser.GameObjects.RenderTexture,
  t: Trozo,
  datos: DatosTerreno,
  decoracionOrdenada: readonly Decoracion[],
): void {
  const sello = crearSello(escena)
  const { valle } = datos
  const c = valle.casillasPorParcela
  const lado = valle.parcelasPorLado * c
  const rio = new Set(datos.rio.map((q) => claveCasilla(lado, q.x, q.y)))
  const escalaTile = escalaNominal(escena, claveTile('hierba'), T, 0)
  const x0 = Math.floor(t.x / T)
  const y0 = Math.floor(t.y / T)
  const x1 = Math.ceil((t.x + t.ancho) / T) - 1
  const y1 = Math.ceil((t.y + t.alto) / T) - 1
  sello.setScale(escalaTile)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = claveCasilla(lado, x, y)
      let tile = TILE_RIO
      if (!rio.has(k)) {
        const parcela =
          valle.parcelas[Math.floor(y / c) * valle.parcelasPorLado + Math.floor(x / c)]
        tile = parcela ? TILE_DE_TERRENO[parcela.terreno] : TILE_DE_TERRENO.prado
      } else if (datos.vados.has(k)) tile = TILE_VADO
      sello.setTexture(claveTile(tile), varianteDeCasilla(datos.semilla, x, y, VARIANTES_TILE))
      rt.batchDraw(sello, x * T - t.x, y * T - t.y)
    }
  }
  sello.setOrigin(0.5, 1)
  for (const d of decoracionOrdenada) {
    const r = rectDecoracion(d)
    if (r.x1 <= t.x || r.x0 >= t.x + t.ancho || r.y1 <= t.y || r.y0 >= t.y + t.alto) continue
    const clave = d.tipo === 'arbol' ? CLAVE_ARBOL : CLAVE_ROCA
    const marco = d.tipo === 'arbol' ? MARCO_ARBOL : MARCO_ROCA
    sello.setTexture(clave)
    sello.setScale(escalaNominal(escena, clave, marco.ancho) * escalaDecoracion(d.variante))
    rt.batchDraw(sello, d.x * T + T / 2 - t.x, (d.y + 1) * T - t.y)
  }
  sello.destroy()
}
