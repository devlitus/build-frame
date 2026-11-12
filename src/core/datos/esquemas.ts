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

const MINUTOS_POR_DIA = 1440
const VELOCIDAD_MAXIMA = 10
const enteroPositivo = v.pipe(v.number(), v.integer(), v.minValue(1))

export const EsquemaConfigTiempo = v.pipe(
  v.strictObject({
    /** Minutos desde 00:00 a los que empieza la jornada (06:00 = 360). */
    horaInicio: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MINUTOS_POR_DIA - 1)),
    /** Minutos desde 00:00 a los que acaba la jornada; puede pasar de 1440 (02:00 = 1560). */
    horaFin: enteroPositivo,
    diasPorEstacion: enteroPositivo,
    estaciones: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
    minutosRealesPorDia: v.pipe(v.number(), v.finite(), v.minValue(1)),
    velocidades: v.pipe(
      v.array(v.pipe(enteroPositivo, v.maxValue(VELOCIDAD_MAXIMA))),
      v.minLength(1),
    ),
  }),
  v.check((c) => c.horaFin > c.horaInicio, 'horaFin debe ser mayor que horaInicio'),
  v.check((c) => c.horaFin - c.horaInicio <= MINUTOS_POR_DIA, 'La jornada no dura más de 24 h'),
  v.check((c) => new Set(c.estaciones).size === c.estaciones.length, 'Estaciones repetidas'),
  v.check((c) => new Set(c.velocidades).size === c.velocidades.length, 'Velocidades repetidas'),
  v.check((c) => c.velocidades.includes(1), 'La velocidad 1 debe existir'),
)

export type ConfigTiempo = v.InferOutput<typeof EsquemaConfigTiempo>
