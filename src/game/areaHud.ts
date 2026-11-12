import { CONFIG_CAMARA } from './camara/config'

/** Franjas (px de pantalla) que el HUD tapa por arriba y por abajo. */
export interface ReservasHud {
  readonly arriba: number
  readonly abajo: number
}

export const RESERVAS_HUD_POR_DEFECTO: ReservasHud = {
  arriba: CONFIG_CAMARA.reservaHudSuperiorPx,
  abajo: CONFIG_CAMARA.reservaHudInferiorPx,
}

/** Holgura (px) que se deja entre el HUD y la parcela. */
const HOLGURA_PX = 8

/**
 * Mide el HUD desde el DOM: el borde inferior de `.hud-arriba` (que cambia con la segunda fila
 * de `?debug` o al apilarse en móvil) y la distancia de `.boton-modo` al borde inferior. Si
 * falta un elemento o no tiene tamaño, usa las constantes de `CONFIG_CAMARA`.
 */
export function medirReservasHud(doc: Document | undefined = globalThis.document): ReservasHud {
  if (!doc) return RESERVAS_HUD_POR_DEFECTO
  const arriba = doc.querySelector('.hud-arriba')?.getBoundingClientRect()
  const boton = doc.querySelector('.boton-modo')?.getBoundingClientRect()
  const alto = doc.documentElement.clientHeight
  return {
    arriba:
      arriba && arriba.height > 0
        ? Math.max(0, Math.ceil(arriba.bottom) + HOLGURA_PX)
        : RESERVAS_HUD_POR_DEFECTO.arriba,
    abajo:
      boton && boton.height > 0 && alto > 0
        ? Math.max(0, Math.ceil(alto - boton.top) + HOLGURA_PX)
        : RESERVAS_HUD_POR_DEFECTO.abajo,
  }
}
