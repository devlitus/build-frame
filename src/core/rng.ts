/**
 * Generador pseudoaleatorio determinista (mulberry32).
 * El estado del RNG es un número que vive dentro del estado del juego,
 * así dos partidas con la misma semilla y los mismos comandos son idénticas.
 */
export function siguienteAleatorio(estadoRng: number): { valor: number; estadoRng: number } {
  const s = (estadoRng + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const valor = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { valor, estadoRng: s }
}
