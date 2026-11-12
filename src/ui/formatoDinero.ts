/**
 * Número entero formateado en español con punto de millar: 1100 → «1.100». Se hace a mano
 * (no con `Intl`) porque `es-ES` no agrupa los números de cuatro cifras y el resultado no
 * debe depender del navegador.
 */
export function formatearDinero(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const entero = Math.trunc(n)
  const signo = entero < 0 ? '-' : ''
  return signo + String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
