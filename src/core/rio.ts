import type { LADOS } from './datos/claves'
import { CONFIG_VALLE } from './datos/valle'
import type { ConfigValle } from './datos/esquemas'
import { siguienteAleatorio } from './rng'
import type { Valle } from './valle'

export interface Casilla {
  readonly x: number
  readonly y: number
}

export type Lado = (typeof LADOS)[number]

const OPUESTO: Readonly<Record<Lado, Lado>> = {
  norte: 'sur',
  sur: 'norte',
  este: 'oeste',
  oeste: 'este',
}

/** Lado de la parcela `a` que mira a la parcela contigua `b` (4-conexas). */
function ladoHacia(
  a: { fila: number; columna: number },
  b: { fila: number; columna: number },
): Lado {
  if (b.fila > a.fila) return 'sur'
  if (b.fila < a.fila) return 'norte'
  return b.columna > a.columna ? 'este' : 'oeste'
}

/** Clave única de una casilla global en un valle de `lado` casillas por lado. */
export function claveCasilla(lado: number, x: number, y: number): number {
  return y * lado + x
}

function esVertical(valle: Valle, cauce: readonly { fila: number }[]): boolean {
  const primera = cauce[0]
  const ultima = cauce[cauce.length - 1]
  return !!primera && !!ultima && primera.fila === 0 && ultima.fila === valle.parcelasPorLado - 1
}

/** El río recorre el valle en vertical si entra por la fila 0 y sale por la última; si no, en horizontal. */
export function rioVertical(valle: Valle): boolean {
  return esVertical(
    valle,
    valle.rio.flatMap((i) => valle.parcelas[i] ?? []),
  )
}

/**
 * Casillas del cauce como una banda continua de `ancho` casillas: cada parcela
 * del río lleva un bloque central y un brazo hacia el lado por el que entra y el
 * lado por el que sale. Los brazos de parcelas contiguas coinciden en la frontera.
 * Devuelve coordenadas globales de casilla (sin duplicados). Incluye los vados.
 */
export function casillasRio(valle: Valle, ancho: number = CONFIG_VALLE.anchoRio): Casilla[] {
  const c = valle.casillasPorParcela
  const anchoReal = Math.min(ancho, c)
  const lo = Math.floor((c - anchoReal) / 2)
  const hi = lo + anchoReal - 1
  const cauce = valle.rio.map((i) => {
    const p = valle.parcelas[i]
    if (!p) throw new Error(`Parcela de río inexistente: ${i}`)
    return p
  })
  const primera = cauce[0]
  const ultima = cauce[cauce.length - 1]
  if (!primera || !ultima) return []
  const vertical = esVertical(valle, cauce)
  const entradaBorde: Lado = vertical ? 'norte' : 'oeste'

  const resultado: Casilla[] = []
  const vistas = new Set<number>()
  const lado = valle.parcelasPorLado * c
  const poner = (x: number, y: number): void => {
    const k = claveCasilla(lado, x, y)
    if (vistas.has(k)) return
    vistas.add(k)
    resultado.push({ x, y })
  }

  cauce.forEach((p, k) => {
    const previa = cauce[k - 1]
    const siguiente = cauce[k + 1]
    const entra = previa ? ladoHacia(p, previa) : entradaBorde
    const sale = siguiente ? ladoHacia(p, siguiente) : OPUESTO[entradaBorde]
    const ox = p.columna * c
    const oy = p.fila * c
    for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) poner(ox + x, oy + y)
    for (const l of new Set<Lado>([entra, sale])) {
      for (let a = lo; a <= hi; a++) {
        if (l === 'norte') for (let y = 0; y < lo; y++) poner(ox + a, oy + y)
        if (l === 'sur') for (let y = hi + 1; y < c; y++) poner(ox + a, oy + y)
        if (l === 'oeste') for (let x = 0; x < lo; x++) poner(ox + x, oy + a)
        if (l === 'este') for (let x = hi + 1; x < c; x++) poner(ox + x, oy + a)
      }
    }
  })
  return resultado
}

/**
 * Vados del río: casillas de río transitables que cruzan todo el ancho del cauce.
 * Entre `config.vados.min` y `max` franjas de `grosor` casillas a lo largo del cauce,
 * repartidas en tramos iguales (sin tocar la primera ni la última fila/columna) y con
 * posición sorteada solo a partir de la semilla. Como la decoración, usa un flujo derivado
 * de la semilla y no el RNG del estado: así el valle de M1 no cambia con la misma semilla.
 * Las franjas se colocan en filas/columnas donde el río tiene su ancho normal (no en los
 * tramos desviados), para que el vado no sea una tira larga a lo largo del cauce.
 * Devuelve claves de casilla globales, en orden de `rio`.
 */
export function generarVados(
  valle: Valle,
  rio: readonly Casilla[],
  semilla: number,
  config: Pick<ConfigValle, 'vados'>,
): number[] {
  const lado = valle.parcelasPorLado * valle.casillasPorParcela
  const cauce = valle.rio.map((i) => valle.parcelas[i]).filter((p) => p !== undefined)
  const vertical = esVertical(valle, cauce)
  let rng = (semilla ^ 0x5bd1e995) >>> 0
  const sortear = (): number => {
    const r = siguienteAleatorio(rng)
    rng = r.estadoRng
    return r.valor
  }
  const util = Math.max(1, lado - 2)
  const grosor = Math.min(config.vados.grosor, util)
  const { min, max } = config.vados
  const pedidos = min + Math.floor(sortear() * (max - min + 1))
  const cantidad = Math.max(1, Math.min(pedidos, Math.floor(util / grosor)))
  const tramo = Math.floor(util / cantidad)
  // Casillas de río por fila (río vertical) o columna (horizontal).
  const porEje = new Array<number>(lado).fill(0)
  for (const c of rio) porEje[vertical ? c.y : c.x] = (porEje[vertical ? c.y : c.x] ?? 0) + 1
  const normal = Math.min(...porEje.filter((n) => n > 0))
  const franjas: number[] = []
  for (let i = 0; i < cantidad; i++) {
    const inicio = 1 + i * tramo
    const posibles = Array.from({ length: tramo - grosor + 1 }, (_, d) => inicio + d)
    const rectas = posibles.filter((p) =>
      Array.from({ length: grosor }, (_, g) => porEje[p + g]).every((n) => n === normal),
    )
    const candidatas = rectas.length > 0 ? rectas : posibles
    franjas.push(candidatas[Math.floor(sortear() * candidatas.length)] as number)
  }
  const enFranja = (a: number): boolean => franjas.some((f) => a >= f && a < f + grosor)
  return rio.filter((c) => enFranja(vertical ? c.y : c.x)).map((c) => claveCasilla(lado, c.x, c.y))
}
