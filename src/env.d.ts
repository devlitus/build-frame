declare const __VERSION__: string

interface Window {
  /** Información de solo lectura para los tests e2e. */
  __raices?: {
    escenaActiva(): string | undefined
    semilla(): number | undefined
    /** Lado del mundo en píxeles (el valle es cuadrado); undefined si aún no hay valle. */
    mundoPx(): number | undefined
    /** Cámara del valle; scrollX/Y es la esquina superior izquierda de la vista sin zoom. */
    camara():
      { zoom: number; scrollX: number; scrollY: number; ancho: number; alto: number } | undefined
  }
}
