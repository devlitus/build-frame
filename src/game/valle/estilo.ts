import type { EstadoParcela, Terreno } from '../../core'

/**
 * Valores VISUALES provisionales (arte definitivo en M9): colores, tamaños y estilos.
 * TODO M5: árboles y rocas serán recursos del juego; su posición pasará a `EstadoJuego`
 * (con el RNG del núcleo) y su densidad por terreno, que sí es de balance, a `data/`.
 * Hoy `DENSIDAD_DECORACION` y la decoración son solo visuales y se derivan de la semilla.
 */
export const TAM_CASILLA = 32

/** Ancho del cauce del río, en casillas. */
export const ANCHO_RIO = 4

export const COLOR_TERRENO: Readonly<Record<Terreno, { base: number; alterno: number }>> = {
  prado: { base: 0x7cb55a, alterno: 0x73ab52 },
  bosque: { base: 0x4f8a45, alterno: 0x488140 },
  rocoso: { base: 0xa39b8a, alterno: 0x9a9281 },
}

export const COLOR_RIO = { base: 0x4a90c8, alterno: 0x5aa0d6 } as const

export interface EstiloParcela {
  readonly tinte: number
  readonly alfaTinte: number
  readonly borde: number
  readonly grosorBorde: number
}

const ESTILO_PARCELA: Readonly<Record<EstadoParcela, EstiloParcela>> = {
  'en-venta': { tinte: 0x000000, alfaTinte: 0.16, borde: 0xf6ecd6, grosorBorde: 2 },
  propia: { tinte: 0xffe27a, alfaTinte: 0.22, borde: 0xffc93c, grosorBorde: 5 },
}

export function estiloParcela(estado: EstadoParcela): EstiloParcela {
  return ESTILO_PARCELA[estado]
}

/** Probabilidad por casilla de llevar un árbol o una roca, según el terreno. */
export const DENSIDAD_DECORACION: Readonly<
  Record<Terreno, { readonly arbol: number; readonly roca: number }>
> = {
  prado: { arbol: 0.015, roca: 0.006 },
  bosque: { arbol: 0.16, roca: 0.01 },
  rocoso: { arbol: 0.012, roca: 0.1 },
}

export const COLOR_ARBOL = { copa: 0x2f6b2f, copaClara: 0x3f8a3a, tronco: 0x6b4a2b } as const
export const COLOR_ROCA = { relleno: 0x8a8a8a, borde: 0x5e5e5e } as const
