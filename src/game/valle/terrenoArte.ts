import type Phaser from 'phaser'
import { claveCasilla, type Casilla, type Decoracion, type Valle } from '../../core'
import {
  CLAVE_ARBOL,
  CLAVE_PLANTON,
  CLAVE_ROCA,
  MARCO_ARBOL,
  MARCO_PLANTON,
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
import type { ObjetoProfundo } from './capaObjetos'
import type { Trozo } from './trozos'
import { varianteDeCasilla } from './variantes'

/** Datos del valle que se hornean: no cambian durante la partida. */
export interface DatosTerreno {
  readonly valle: Valle
  readonly rio: readonly Casilla[]
  readonly vados: ReadonlySet<number>
  readonly semilla: number
}

const marcoDe = (d: Decoracion) =>
  d.tipo === 'arbol' ? MARCO_ARBOL : d.tipo === 'planton' ? MARCO_PLANTON : MARCO_ROCA
const claveDe = (d: Decoracion): string =>
  d.tipo === 'arbol' ? CLAVE_ARBOL : d.tipo === 'planton' ? CLAVE_PLANTON : CLAVE_ROCA

/** Variación de tamaño de la decoración con su `variante` (0 a 1): de 0,9 a 1,1 veces el tamaño nominal. */
export function escalaDecoracion(variante: number): number {
  return 0.9 + 0.2 * Math.min(1, Math.max(0, variante))
}

/**
 * Rectángulo del mundo (px) que cubre la decoración de una casilla: el sprite tiene el pivote en
 * la base, centrado, y sobresale de la casilla (el árbol hacia arriba y a los lados).
 */
export function rectDecoracion(d: Decoracion): { x0: number; y0: number; x1: number; y1: number } {
  const marco = marcoDe(d)
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

/**
 * Objetos de la capa por profundidad (`capaObjetos.ts`) para los árboles y rocas: el `id` es la
 * clave de la casilla (`claveCasilla`, estable aunque se talen otros obstáculos) y la profundidad la `y` de la base en px.
 */
export function objetosDeDecoracion(
  escena: Phaser.Scene,
  decoracion: readonly Decoracion[],
  lado: number,
  dia = 0,
): ObjetoProfundo[] {
  return decoracion.map((d) => {
    const clave = claveDe(d)
    const marco = marcoDe(d)
    const base = (d.y + 1) * T
    // Plantón: marco 0 el día que se planta y 1 (arbolito) desde el día siguiente.
    const crecido = d.tipo === 'planton' && dia - (d.diaPlantado ?? dia) >= 1
    return {
      id: claveCasilla(lado, d.x, d.y),
      ...(d.tipo === 'planton' ? { marco: crecido ? 1 : 0 } : {}),
      x: d.x * T + T / 2,
      y: base,
      profundidad: base,
      textura: clave,
      escala:
        escalaNominal(escena, clave, marco.ancho, d.tipo === 'planton' ? 0 : '__BASE') *
        escalaDecoracion(d.variante),
      rect: rectDecoracion(d),
    }
  })
}

/**
 * Pinta un trozo del terreno con las texturas del arte, sobre la `RenderTexture` del trozo (entre
 * `beginDraw` y `endDraw`). Los tiles van en posiciones enteras del mundo y se tocan sin hueco. Los
 * árboles y rocas no se hornean: son objetos con profundidad (`objetosDeDecoracion`).
 */
export function pintarTrozoTerreno(
  escena: Phaser.Scene,
  rt: Phaser.GameObjects.RenderTexture,
  t: Trozo,
  datos: DatosTerreno,
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
  sello.destroy()
}
