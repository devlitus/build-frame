import es from './textos/es.json'

/** Textos externalizados desde el día 1 (GDD §8). Añadir idiomas = añadir JSON. */
export type ClaveTexto = keyof typeof es

export function t(clave: ClaveTexto): string {
  return es[clave]
}

/** Texto con huecos `{nombre}` rellenados. */
export function tp(clave: ClaveTexto, valores: Readonly<Record<string, string | number>>): string {
  return t(clave).replace(/\{(\w+)\}/g, (_, k: string) => String(valores[k] ?? ''))
}

/** Nombre visible de una estación (clave de `data/tiempo.json`); si falta, la propia clave. */
export function nombreEstacion(clave: string): string {
  const k = `estacion_${clave}`
  return k in es ? es[k as ClaveTexto] : clave
}
