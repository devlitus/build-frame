import es from './textos/es.json'

/** Textos externalizados desde el día 1 (GDD §8). Añadir idiomas = añadir JSON. */
export type ClaveTexto = keyof typeof es

export function t(clave: ClaveTexto): string {
  return es[clave]
}
