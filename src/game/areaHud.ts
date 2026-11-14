import { CONFIG_CAMARA } from './camara/config'

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
 * de `?debug` o al apilarse en móvil) y la distancia de la barra inferior al borde inferior. Si
 * falta un elemento o no tiene tamaño, usa las constantes de `CONFIG_CAMARA`. También devuelve
 * las cajas de la barra y del panel de inventario (para la cámara de Vida).
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
