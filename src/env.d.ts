declare const __VERSION__: string

interface Window {
  /** Información de solo lectura para los tests e2e. */
  __raices?: {
    escenaActiva(): string | undefined
    semilla(): number | undefined
    /** Lado del mundo en píxeles (el valle es cuadrado); undefined si aún no hay valle. */
    mundoPx(): number | undefined
  }
}
