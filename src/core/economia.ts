import { CONFIG_ECONOMIA } from './datos/economia'
import type { ConfigEconomia } from './datos/esquemas'
import type { EstadoJuego } from './estado'

const PRECIO_MINIMO = 10

/**
 * Precio de la parcela `indice` (índice en `estado.valle.parcelas`) con las compras hechas.
 * `base × factores × (1 + subida)^comprasHechas`, redondeado a la decena más cercana y nunca
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
  if (!Number.isSafeInteger(estado.comprasHechas) || estado.comprasHechas < 0) return undefined
  const bruto =
    config.precioBase *
    config.factorTerreno[parcela.terreno] *
    config.factorFertilidad[parcela.fertilidad] *
    config.factorAgua[parcela.agua] *
    (1 + config.subidaPorCompra) ** estado.comprasHechas
  const precio = Math.max(PRECIO_MINIMO, Math.round(bruto / 10) * 10)
  return Number.isSafeInteger(precio) ? precio : undefined
}
