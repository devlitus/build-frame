import type { EstadoParcela, Terreno } from '../../core'

/**
 * Valores VISUALES provisionales (arte definitivo en M9): colores, tamaños y estilos.
 * La posición de árboles y rocas y su densidad son del núcleo (`EstadoJuego.obstaculos`,
 * `data/valle.json`) desde M2-02; aquí solo queda cómo se ven.
 */
export const TAM_CASILLA = 32

export const COLOR_TERRENO: Readonly<Record<Terreno, { base: number; alterno: number }>> = {
  prado: { base: 0x7cb55a, alterno: 0x73ab52 },
  bosque: { base: 0x4f8a45, alterno: 0x488140 },
  rocoso: { base: 0xa39b8a, alterno: 0x9a9281 },
}

export const COLOR_RIO = { base: 0x4a90c8, alterno: 0x5aa0d6 } as const

/** Vado: agua más clara y piedras de paso, para ver por dónde se cruza. */
export const COLOR_VADO = { agua: 0x9fd3ee, piedra: 0xb9b2a3, piedraBorde: 0x7a7468 } as const

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

export const COLOR_ARBOL = { copa: 0x2f6b2f, copaClara: 0x3f8a3a, tronco: 0x6b4a2b } as const
export const COLOR_ROCA = { relleno: 0x8a8a8a, borde: 0x5e5e5e } as const
