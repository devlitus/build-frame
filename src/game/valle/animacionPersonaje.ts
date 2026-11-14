import type { Orientacion } from '../../core'

/** Qué hace el protagonista: andar o estar quieto (respirando). */
export type AccionPersonaje = 'caminar' | 'reposo'

/** Direcciones de las hojas de `public/assets/protagonista` (la izquierda es la derecha espejada). */
const DIRECCION_HOJA: Readonly<Record<Orientacion, { dir: string; espejo: boolean }>> = {
  sur: { dir: 'abajo', espejo: false },
  norte: { dir: 'arriba', espejo: false },
  este: { dir: 'derecha', espejo: false },
  oeste: { dir: 'derecha', espejo: true },
}

/** Fotogramas y velocidad de cada animación (biblia §10: reposo 4 a 6 fps, caminar 8 a 10 fps). */
export const ANIMACIONES_PERSONAJE: Readonly<
  Record<AccionPersonaje, { fotogramas: number; fps: number }>
> = {
  reposo: { fotogramas: 4, fps: 6 },
  caminar: { fotogramas: 8, fps: 10 },
}

export const CLAVE_PROTAGONISTA = 'protagonista'

/** Clave de la animación y si el sprite va espejado para esa acción y orientación. */
export function animacionPersonaje(
  accion: AccionPersonaje,
  orientacion: Orientacion,
): { clave: string; espejo: boolean } {
  const { dir, espejo } = DIRECCION_HOJA[orientacion]
  return { clave: `${accion}-${dir}`, espejo }
}

/** Nombre del fotograma `n` de una animación en el atlas (`caminar-abajo-3`). */
export function nombreFotograma(clave: string, n: number): string {
  return `${clave}-${n}`
}

/**
 * Decide si el personaje está andando: se considera que anda mientras su posición cambia y
 * `retardoMs` más (para que un fotograma sin avance no corte el paso).
 */
export class DetectorMovimiento {
  private x = Number.NaN
  private y = Number.NaN
  private restoMs = 0

  constructor(private readonly retardoMs = 90) {}

  /** `ms` desde la última llamada; devuelve `true` si anda. */
  actualizar(x: number, y: number, ms: number): boolean {
    if (x !== this.x || y !== this.y) {
      // La primera posición (Number.NaN antes) no cuenta como movimiento.
      this.restoMs = Number.isNaN(this.x) ? 0 : this.retardoMs
      this.x = x
      this.y = y
    } else this.restoMs = Math.max(0, this.restoMs - ms)
    return this.restoMs > 0
  }
}
