import { limitarZoom, zoomEncuadrado, type LimitesZoom, type Pantalla } from './matematica'

/** Valores visuales de la cámara (no son de balance). */
export const CONFIG_CAMARA = {
  zoomMax: 2.5,
  /** Suelo del zoom inicial: por debajo no se distingue lo propio de lo que está en venta. */
  zoomInicialMin: 0.6,
  /** Zoom por unidad de `deltaY` de la rueda (exponencial). */
  sensibilidadRueda: 0.0015,
  /** Constante de tiempo del seguimiento suave (ms): menor = más pegada al personaje. */
  suavizadoSeguimientoMs: 120,
  /** Por debajo de esta distancia (px del mundo) el seguimiento da el alcance por logrado. */
  umbralSeguimientoPx: 0.25,
  /** Desplazamiento de la cámara con el teclado en el Modo Plano (px de pantalla por segundo). */
  velocidadTecladoPx: 600,
  /** Zoom con `+`/`-` en el Modo Plano: factor exponencial por segundo. */
  zoomTeclaPorSegundo: 2,
} as const

export function limitesZoom(pantalla: Pantalla, mundo: number): LimitesZoom {
  const min = zoomEncuadrado(pantalla, mundo)
  return { min, max: Math.max(min, CONFIG_CAMARA.zoomMax) }
}

export function zoomInicial(pantalla: Pantalla, mundo: number): number {
  return limitarZoom(CONFIG_CAMARA.zoomInicialMin, limitesZoom(pantalla, mundo))
}
