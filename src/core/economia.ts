import { CONFIG_ECONOMIA } from './datos/economia'
import type { ConfigEconomia } from './datos/esquemas'
import type { EstadoJuego } from './estado'

const PRECIO_MINIMO = 10n
/** Con subida > 0, más compras que esto desbordan cualquier entero seguro. */
const TOPE_COMPRAS = 10_000
/** Tope de dígitos del cálculo exacto (anti-abuso con decimales absurdos): da `undefined`. */
const TOPE_DIGITOS = 100_000

/** Fracción exacta n/d con d = 10^k. */
interface Decimal {
  readonly n: bigint
  readonly d: bigint
}

/**
 * Valor decimal exacto de un número finito ≥ 0, tomando su representación decimal más corta
 * (1,4 es 14/10, no el binario 1,399999…). Así 175 × 1,4 es exactamente 245 y no 244,999….
 */
function decimalDe(x: number): Decimal {
  const [mantisa = '0', exp = '0'] = x.toExponential().split('e')
  const [ent = '0', frac = ''] = mantisa.split('.')
  const digitos = BigInt(ent + frac)
  const e10 = Number(exp) - frac.length
  return e10 >= 0
    ? { n: digitos * 10n ** BigInt(e10), d: 1n }
    : { n: digitos, d: 10n ** BigInt(-e10) }
}

/**
 * Precio de la parcela `indice` (índice en `estado.valle.parcelas`) con las compras hechas.
 * `base × factores × (1 + subida)^comprasHechas`, calculado en aritmética exacta (BigInt sobre
 * los decimales de los datos) y redondeado a la decena más cercana (mitades hacia arriba), nunca
 * menor que 10. Devuelve `undefined` si el índice no es un entero dentro del valle, si
 * `comprasHechas` no es un entero seguro ≥ 0 o si el resultado no es un entero seguro.
 * El estado de la parcela (en venta o propia) no influye: decidir si se puede comprar es
 * cosa del comando de compra.
 */
export function precioParcela(
  estado: Pick<EstadoJuego, 'valle' | 'comprasHechas'>,
  indice: number,
  config: ConfigEconomia = CONFIG_ECONOMIA,
): number | undefined {
  const parcela = Number.isInteger(indice) ? estado.valle.parcelas[indice] : undefined
  if (parcela === undefined) return undefined
  const compras = estado.comprasHechas
  if (!Number.isSafeInteger(compras) || compras < 0) return undefined
  const factores = [
    decimalDe(config.factorTerreno[parcela.terreno]),
    decimalDe(config.factorFertilidad[parcela.fertilidad]),
    decimalDe(config.factorAgua[parcela.agua]),
  ]
  const s = decimalDe(config.subidaPorCompra)
  // Con subida 0 el factor es 1 sea cual sea el número de compras.
  const n = s.n === 0n ? 0 : compras
  if (n > TOPE_COMPRAS || s.d.toString().length * n > TOPE_DIGITOS) return undefined
  let num = BigInt(config.precioBase) * (s.d + s.n) ** BigInt(n)
  let den = s.d ** BigInt(n)
  for (const f of factores) {
    num *= f.n
    den *= f.d
  }
  // Redondeo a la decena con mitades hacia arriba: floor((num/den + 5) / 10) × 10.
  const decenas = (num + 5n * den) / (10n * den)
  const precio = decenas * 10n < PRECIO_MINIMO ? PRECIO_MINIMO : decenas * 10n
  return precio <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(precio) : undefined
}
