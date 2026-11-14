import { CONFIG_CAMARA } from './camara/config'
import type { Margenes, Pantalla } from './camara/matematica'
import { TAM_CASILLA } from './valle/estilo'

/** Franjas (px de pantalla) que el HUD tapa por arriba y por abajo. */
export interface ReservasHud {
  readonly arriba: number
  readonly abajo: number
  /** Caja de la barra inferior (herramientas, acciones y modo), si se ve. */
  readonly barra?: CajaHud | undefined
  /** Caja del panel de inventario abierto, si se ve. */
  readonly panel?: CajaHud | undefined
}

/** Rectángulo de pantalla (px) de un elemento de la interfaz. */
export interface CajaHud {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

function cajaVisible(doc: Document, selector: string): CajaHud | undefined {
  const r = doc.querySelector(selector)?.getBoundingClientRect()
  return r && r.width > 0 && r.height > 0
    ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    : undefined
}

export const RESERVAS_HUD_POR_DEFECTO: ReservasHud = {
  arriba: CONFIG_CAMARA.reservaHudSuperiorPx,
  abajo: CONFIG_CAMARA.reservaHudInferiorPx,
}

/** Holgura (px) que se deja entre el HUD y la parcela. */
const HOLGURA_PX = 8

/**
 * Mide el HUD desde el DOM: el borde inferior de `.hud-arriba` (que cambia con la segunda fila
 * de `?debug`, al apilarse en móvil o con un aviso) y la distancia de la barra inferior al borde
 * inferior. Si falta un elemento o no tiene tamaño, usa las constantes de `CONFIG_CAMARA`.
 * También devuelve las cajas de la barra y del panel de inventario (para la cámara de Vida).
 */
export function medirReservasHud(doc: Document | undefined = globalThis.document): ReservasHud {
  if (!doc) return RESERVAS_HUD_POR_DEFECTO
  const arriba = doc.querySelector('.hud-arriba')?.getBoundingClientRect()
  const barra = cajaVisible(doc, '.barra-inferior-caja')
  const alto = doc.documentElement.clientHeight
  return {
    barra,
    panel: cajaVisible(doc, '.panel-inventario-caja'),
    arriba:
      arriba && arriba.height > 0
        ? Math.max(0, Math.ceil(arriba.bottom) + HOLGURA_PX)
        : RESERVAS_HUD_POR_DEFECTO.arriba,
    abajo:
      barra && alto > 0
        ? Math.max(0, Math.ceil(alto - barra.top) + HOLGURA_PX)
        : RESERVAS_HUD_POR_DEFECTO.abajo,
  }
}

/** Datos de `margenesVida`: todo en px de pantalla salvo el zoom. */
export interface EntradaMargenesVida {
  readonly pantalla: Pantalla
  /** Caja de la barra inferior. */
  readonly barra: CajaHud
  /** Caja del panel de inventario abierto, si se ve. */
  readonly panel?: CajaHud | undefined
  /** Borde inferior del HUD superior (con su holgura): `ReservasHud.arriba`. */
  readonly reservaArriba: number
  readonly zoom: number
}

/**
 * Márgenes fijos de la cámara en Vida: solo se amplían los extremos, lo que ocupa la interfaz más
 * un poco de aire y el radio libre alrededor del personaje (`CONFIG_CAMARA.radioLibreCasillas`),
 * para que en el borde del valle el cuadrado de 7x7 casillas del personaje quede sin HUD encima.
 * - Abajo: la barra inferior y, con una hoja inferior de inventario (más del 60 % del ancho), su
 *   borde superior.
 * - Izquierda: el borde derecho de una tarjeta de inventario lateral.
 * - Arriba: lo que sobresale el sprite o, si es mayor, el HUD superior.
 * No dependen de la posición del personaje, así que `seguir` se desliza sin saltos.
 */
export function margenesVida(e: EntradaMargenesVida): Margenes {
  const h = CONFIG_CAMARA.holguraBordePx
  const radio = CONFIG_CAMARA.radioLibreCasillas * TAM_CASILLA * e.zoom
  let abajo = Math.max(0, e.pantalla.alto - e.barra.top + h) + radio
  let izq = 0
  const panel = e.panel
  if (panel) {
    if (panel.right - panel.left > e.pantalla.ancho * CONFIG_CAMARA.fraccionHojaInferior)
      abajo = Math.max(abajo, e.pantalla.alto - panel.top + h + radio)
    else izq = panel.right + h + radio
  }
  const arriba = Math.max((TAM_CASILLA / 2) * e.zoom, e.reservaArriba + radio)
  return {
    arriba: Math.ceil(arriba),
    abajo: Math.ceil(abajo),
    izq: Math.max(0, Math.ceil(izq)),
    der: 0,
    soloExtremos: true,
  }
}
