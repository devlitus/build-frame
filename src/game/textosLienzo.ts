/** Textos que pone la interfaz y que el juego dibuja en el lienzo (así `game/` no depende de `ui/`). */
export interface TextosLienzo {
  /** Cartel de una obra («3 días», «1 día»). */
  readonly cartelObra: (dias: number) => string
}

/** Clave del registro de Phaser donde viven los `TextosLienzo`. */
export const CLAVE_TEXTOS_LIENZO = 'textosLienzo'
