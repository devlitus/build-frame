import type { EstadoParcela, Terreno } from '../../core'
import type { EstadoVisualParcela } from './estadoVisual'

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

/**
 * Parcelas en el Modo Plano: tres estados que se distinguen sin depender del color.
 * - propia: tinte y borde dorados gruesos y continuos;
 * - comprable: borde crema DISCONTINUO y una moneda de «se vende» en el centro;
 * - no-comprable: velo oscuro, rayado diagonal y borde fino apagado.
 * En el Modo Vida se mantiene `estiloParcela` (la información de compra no hace falta mientras
 * se juega y así el valle se ve limpio).
 */
export interface EstiloParcelaPlano {
  readonly tinte: number
  readonly alfaTinte: number
  readonly borde: number
  readonly grosorBorde: number
  /** Trazo y hueco (px) del borde discontinuo; sin él, el borde es continuo. */
  readonly discontinuo?: { readonly trazo: number; readonly hueco: number }
  /** Rayado diagonal sobre la parcela. */
  readonly rayado?: {
    readonly color: number
    readonly alfa: number
    readonly paso: number
    readonly grosor: number
  }
  /** Moneda de «se vende» en el centro de la parcela. */
  readonly moneda?: { readonly radio: number; readonly relleno: number; readonly borde: number }
}

export const ESTILO_PLANO: Readonly<Record<EstadoVisualParcela, EstiloParcelaPlano>> = {
  propia: { tinte: 0xffe27a, alfaTinte: 0.22, borde: 0xffc93c, grosorBorde: 5 },
  comprable: {
    tinte: 0xffffff,
    alfaTinte: 0.1,
    borde: 0xfff3c4,
    grosorBorde: 8,
    discontinuo: { trazo: 72, hueco: 44 },
    moneda: { radio: 46, relleno: 0xffd34d, borde: 0x6b4a00 },
  },
  'no-comprable': {
    tinte: 0x14141c,
    alfaTinte: 0.45,
    borde: 0x2a2a33,
    grosorBorde: 3,
    rayado: { color: 0x000000, alfa: 0.3, paso: 96, grosor: 7 },
  },
}

/**
 * Resaltado de la parcela seleccionada: doble trazo (tinta por fuera, crema por dentro) a
 * propósito distinto del dorado de las propias; se lee sobre terreno claro y oscuro.
 */
export const ESTILO_RESALTE = {
  tinta: 0x3b2a1a,
  crema: 0xfff3c4,
  grosorTinta: 14,
  grosorCrema: 6,
  alfaRelleno: 0.18,
} as const

export const COLOR_ARBOL = { copa: 0x2f6b2f, copaClara: 0x3f8a3a, tronco: 0x6b4a2b } as const
export const COLOR_ROCA = { relleno: 0x8a8a8a, borde: 0x5e5e5e } as const

/** Personaje provisional (arte en M9): cuerpo, borde e indicador de orientación. */
export const ESTILO_PERSONAJE = {
  /** Radio del cuerpo, en píxeles. */
  radio: 10,
  cuerpo: 0xd9583b,
  borde: 0x5a1f12,
  indicador: 0xfff3c4,
  /** Distancia del indicador al centro, en píxeles. */
  distanciaIndicador: 7,
  radioIndicador: 3,
} as const

/**
 * Ciclo día/noche (M2-06): puntos de control (minuto del día, color del tinte, opacidad). Entre
 * dos puntos se interpola de forma lineal; el último enlaza con el primero a medianoche.
 */
export interface PuntoLuz {
  readonly minuto: number
  readonly color: number
  readonly alfa: number
}

export const PUNTOS_LUZ: readonly PuntoLuz[] = [
  { minuto: 0, color: 0x0b1233, alfa: 0.55 },
  { minuto: 5 * 60, color: 0x0b1233, alfa: 0.55 },
  { minuto: 6 * 60, color: 0xf0905a, alfa: 0 },
  { minuto: 6 * 60 + 45, color: 0xf0905a, alfa: 0.14 },
  { minuto: 7 * 60 + 30, color: 0xffffff, alfa: 0 },
  { minuto: 18 * 60, color: 0xffffff, alfa: 0 },
  { minuto: 19 * 60, color: 0xf07a3c, alfa: 0.24 },
  { minuto: 20 * 60, color: 0x0b1233, alfa: 0.55 },
  { minuto: 24 * 60, color: 0x0b1233, alfa: 0.55 },
]

/**
 * Profundidad del tinte día/noche: por encima de todo el mundo dibujado (el personaje usa
 * `depth` = y en píxeles, hasta el tamaño del mundo). Las marcas que deban verse sin tinte
 * pueden ir por encima a propósito.
 */
export const PROFUNDIDAD_TINTE = 1_000_000
