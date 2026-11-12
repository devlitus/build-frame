import { AGUAS, AGUAS_SIN_RIO, ESTADOS_PARCELA, FERTILIDADES, TERRENOS } from './datos/claves'
import type { ConfigValle } from './datos/esquemas'
import { siguienteAleatorio } from './rng'

export { TERRENOS, FERTILIDADES, AGUAS, AGUAS_SIN_RIO, ESTADOS_PARCELA }

export type Terreno = (typeof TERRENOS)[number]
export type Fertilidad = (typeof FERTILIDADES)[number]
export type Agua = (typeof AGUAS)[number]
export type EstadoParcela = (typeof ESTADOS_PARCELA)[number]

/**
 * Tras generarse, `fila`, `columna`, `terreno`, `fertilidad` y `agua` son inmutables;
 * solo `estado` cambiará (a partir de M3, al comprar parcelas).
 */
export interface Parcela {
  readonly fila: number
  readonly columna: number
  readonly terreno: Terreno
  readonly fertilidad: Fertilidad
  readonly agua: Agua
  readonly estado: EstadoParcela
}

/** El cauce `rio` y las dimensiones son inmutables tras generar el valle. */
export interface Valle {
  readonly parcelasPorLado: number
  readonly casillasPorParcela: number
  /** Orden fila-mayor: índice = fila * parcelasPorLado + columna. */
  readonly parcelas: readonly Parcela[]
  /** Índices de las parcelas del cauce, ordenados de un borde al opuesto. */
  readonly rio: readonly number[]
}

/** Calcula el índice sin comprobar límites; usa `parcelaEn` si las coordenadas pueden ser inválidas. */
export function indiceParcela(valle: Valle, fila: number, columna: number): number {
  return fila * valle.parcelasPorLado + columna
}

export function parcelaEn(valle: Valle, fila: number, columna: number): Parcela | undefined {
  const n = valle.parcelasPorLado
  if (!Number.isInteger(fila) || !Number.isInteger(columna)) return undefined
  if (fila < 0 || columna < 0 || fila >= n || columna >= n) return undefined
  return valle.parcelas[indiceParcela(valle, fila, columna)]
}

interface Sorteo<T> {
  readonly valor: T
  readonly estadoRng: number
}

/**
 * Sorteo ponderado. Los pesos se normalizan por el máximo para que la suma no
 * desborde con pesos enormes; nunca devuelve una clave de peso 0.
 */
function elegirPonderado<K extends string>(
  pesos: Readonly<Record<K, number>>,
  estadoRng: number,
): Sorteo<K> {
  const claves = Object.keys(pesos) as K[]
  const maximo = Math.max(...claves.map((k) => pesos[k]))
  const relativo = (k: K): number => pesos[k] / maximo
  const total = claves.reduce((a, k) => a + relativo(k), 0)
  const r = siguienteAleatorio(estadoRng)
  let objetivo = r.valor * total
  let elegida = [...claves].reverse().find((k) => pesos[k] > 0) as K
  for (const k of claves) {
    const w = relativo(k)
    if (w > 0 && objetivo < w) {
      elegida = k
      break
    }
    objetivo -= w
  }
  return { valor: elegida, estadoRng: r.estadoRng }
}

/**
 * Cauce 4-conexo de un borde al opuesto. Avanza fila a fila (o columna a columna,
 * según la orientación sorteada); en cada paso, con cierta probabilidad, se desvía
 * una casilla hacia un lado dentro del mismo paso antes de seguir avanzando.
 */
function generarRio(config: ConfigValle, estadoRng: number): { rio: number[]; estadoRng: number } {
  const n = config.parcelasPorLado
  let rng = estadoRng
  const sortear = (): number => {
    const r = siguienteAleatorio(rng)
    rng = r.estadoRng
    return r.valor
  }
  const vertical = sortear() < 0.5
  let pos = Math.min(n - 1, Math.floor(sortear() * n))
  const rio: number[] = []
  const poner = (avance: number, lateral: number) =>
    rio.push(vertical ? avance * n + lateral : lateral * n + avance)
  for (let avance = 0; avance < n; avance++) {
    poner(avance, pos)
    if (n > 1 && sortear() < config.probabilidadDesvioRio) {
      const haciaMas = sortear() < 0.5
      if (pos === 0) pos++
      else if (pos === n - 1) pos--
      else pos += haciaMas ? 1 : -1
      poner(avance, pos)
    }
  }
  return { rio, estadoRng: rng }
}

/** Genera el valle de forma determinista a partir del estado del RNG. */
export function generarValle(
  config: ConfigValle,
  estadoRng: number,
): { valle: Valle; estadoRng: number } {
  const n = config.parcelasPorLado
  const cauce = generarRio(config, estadoRng)
  let rng = cauce.estadoRng
  const enRio = new Set(cauce.rio)
  const parcelas: Parcela[] = []
  for (let fila = 0; fila < n; fila++) {
    for (let columna = 0; columna < n; columna++) {
      const t = elegirPonderado(config.pesosTerreno, rng)
      const f = elegirPonderado(config.pesosFertilidad[t.valor], t.estadoRng)
      rng = f.estadoRng
      let agua: Agua = 'rio'
      if (!enRio.has(fila * n + columna)) {
        const a = elegirPonderado(config.pesosAguaSinRio, rng)
        agua = a.valor
        rng = a.estadoRng
      }
      parcelas.push({
        fila,
        columna,
        terreno: t.valor,
        fertilidad: f.valor,
        agua,
        estado: 'en-venta',
      })
    }
  }
  return {
    valle: {
      parcelasPorLado: n,
      casillasPorParcela: config.casillasPorParcela,
      parcelas,
      rio: cauce.rio,
    },
    estadoRng: rng,
  }
}
