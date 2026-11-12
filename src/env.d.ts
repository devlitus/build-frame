declare const __VERSION__: string

interface Window {
  /** Información de solo lectura para los tests e2e. */
  __raices?: {
    escenaActiva(): string | undefined
    semilla(): number | undefined
    /** Lado del mundo en píxeles (el valle es cuadrado); undefined si aún no hay valle. */
    mundoPx(): number | undefined
    /** Número de texturas en el gestor de Phaser. */
    texturas(): number
    /** Reinicia la escena del valle; solo hace algo con `?debug`. */
    reiniciarValle(): void
    /** Fotogramas por segundo medidos por el bucle de Phaser. */
    fps(): number
    /** Texto del contador de fps; undefined si no hay escena de depuración (sin `?debug`). */
    contadorFps(): string | undefined
    /** Número de objetos en la lista de la escena del valle. */
    objetosValle(): number | undefined
    /** Tamaño (en órdenes de dibujo) de cada `Graphics` vivo en la escena del valle. */
    graficosValle(): number[]
    /** Cámara del valle; scrollX/Y es la esquina superior izquierda de la vista sin zoom. */
    camara():
      { zoom: number; scrollX: number; scrollY: number; ancho: number; alto: number } | undefined
  }
}
