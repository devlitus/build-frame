import * as v from 'valibot'
import { AGUAS_SIN_RIO, FERTILIDADES, TERRENOS } from './claves.ts'

/** Tope de 64: 64×64 parcelas de 64×64 casillas ya son ~16 M casillas; más es inabarcable. */
const LIMITE_TAMANO = 64
const entero = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(LIMITE_TAMANO))
const peso = v.pipe(v.number(), v.finite(), v.minValue(0))

/** Pesos por clave: todos ≥ 0 y con suma > 0. */
function pesos<const K extends string>(claves: readonly K[]) {
  const forma = Object.fromEntries(claves.map((k) => [k, peso])) as Record<K, typeof peso>
  return v.pipe(
    v.strictObject(forma),
    v.check(
      (o) => Object.values<number>(o).reduce((a, b) => a + b, 0) > 0,
      'La suma de pesos debe ser > 0',
    ),
  )
}

export const EsquemaConfigValle = v.strictObject({
  parcelasPorLado: entero,
  casillasPorParcela: entero,
  pesosTerreno: pesos(TERRENOS),
  pesosFertilidad: v.strictObject({
    prado: pesos(FERTILIDADES),
    bosque: pesos(FERTILIDADES),
    rocoso: pesos(FERTILIDADES),
  }),
  pesosAguaSinRio: pesos(AGUAS_SIN_RIO),
  probabilidadDesvioRio: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
})

export type ConfigValle = v.InferOutput<typeof EsquemaConfigValle>
