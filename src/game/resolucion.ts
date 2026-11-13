import type { Pantalla, Punto } from './camara/matematica'

/*
 * Nitidez con DPR alto (issue #11). El lienzo de Phaser mide CSS × `factor` píxeles (con
 * `factor = min(DPR, 2)`) y el navegador lo muestra a tamaño CSS (`scale.zoom = 1 / factor`).
 *
 * Todo el código del juego (cámara, picking, guías, interfaz) sigue razonando en píxeles CSS, que
 * son los de la interfaz y los de los tests: el puntero ya llega en CSS (ver `juego.ts`), la
 * pantalla y el zoom «lógicos» se obtienen aquí, y solo la cámara de Phaser trabaja en píxeles de
 * dispositivo (`zoom de Phaser = zoom lógico × factor`). Así los límites de zoom se expresan igual
 * en todos los dispositivos.
 */

/** Tope del factor de resolución: a DPR 3 el lienzo cuatro veces mayor no compensa. */
export const FACTOR_MAXIMO = 2
/** Con un DPR a partir de este valor se cargan las texturas @2x. */
export const DPR_ARTE_2X = 1.5

/** Factor de resolución del lienzo para un `devicePixelRatio`: entre 1 y 2. */
export function factorResolucion(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1
  return Math.min(dpr, FACTOR_MAXIMO)
}

/** Escala de las texturas que se cargan: 2 con DPR ≥ 1,5 y 1 en el resto. */
export function escalaArte(dpr: number): 1 | 2 {
  return Number.isFinite(dpr) && dpr >= DPR_ARTE_2X ? 2 : 1
}

/** Sufijo de los archivos de arte (`@1x` o `@2x`). */
export function sufijoArte(dpr: number): '@1x' | '@2x' {
  return escalaArte(dpr) === 2 ? '@2x' : '@1x'
}

/** Tamaño en píxeles de dispositivo del lienzo para un contenedor de `css` píxeles CSS. */
export function tamanoLienzo(css: number, factor: number): number {
  return Math.max(1, Math.round(css * factor))
}

/** `devicePixelRatio` del navegador (1 sin DOM). */
export function dprActual(): number {
  const d = (globalThis as { devicePixelRatio?: number }).devicePixelRatio
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : 1
}

/** Lo mínimo de una escena de Phaser que necesitan estas funciones. */
export interface EscenaEscalable {
  readonly scale: { readonly zoom: number; readonly width: number; readonly height: number }
  readonly cameras: {
    readonly main: {
      readonly zoom: number
      getWorldPoint(x: number, y: number): { x: number; y: number }
    }
  }
}

/** Factor de resolución vigente del lienzo (el inverso del zoom de pantalla de Phaser). */
export function factorDe(escena: Pick<EscenaEscalable, 'scale'>): number {
  const z = escena.scale.zoom
  return z > 0 && Number.isFinite(z) ? 1 / z : 1
}

/** Tamaño de la pantalla en píxeles CSS. */
export function pantallaLogica(escena: Pick<EscenaEscalable, 'scale'>): Pantalla {
  const k = factorDe(escena)
  return { ancho: escena.scale.width / k, alto: escena.scale.height / k }
}

/** Zoom de la cámara en términos lógicos (el que ve el resto del juego). */
export function zoomLogico(escena: EscenaEscalable): number {
  return escena.cameras.main.zoom / factorDe(escena)
}

/** Punto del mundo bajo un punto de pantalla en píxeles CSS. */
export function mundoDePantalla(escena: EscenaEscalable, x: number, y: number): Punto {
  const k = factorDe(escena)
  return escena.cameras.main.getWorldPoint(x * k, y * k)
}
