import type { ConfigPersonaje, ConfigValle } from './datos/esquemas'
import { decorarValle, type Obstaculo } from './decoracion'
import { casillasRio, claveCasilla, generarVados } from './rio'
import type { Valle } from './valle'

/** Río del valle: ancho del cauce y vados (claves de casilla globales, transitables). */
export interface Cauce {
  readonly ancho: number
  readonly vados: readonly number[]
}

/** Parte del estado que determina qué casillas se pueden pisar. */
export interface DatosMapa {
  readonly valle: Valle
  readonly cauce: Cauce
  readonly obstaculos: readonly Obstaculo[]
  /** Centro de la casilla de aparición, en unidades de casilla. */
  readonly aparicion: { readonly x: number; readonly y: number }
}

/** Resultado de `mapaTransitabilidad`: `bloqueada[y * lado + x] === 1` si no se puede pisar. */
export interface MapaTransitabilidad {
  readonly lado: number
  readonly bloqueada: Uint8Array
}

/** Lado del valle en casillas. */
export function ladoValle(valle: Valle): number {
  return valle.parcelasPorLado * valle.casillasPorParcela
}

/** Casillas de río que no son vado (agua). */
function aguaBloqueada(valle: Valle, cauce: Cauce): Uint8Array {
  const lado = ladoValle(valle)
  const mapa = new Uint8Array(lado * lado)
  for (const c of casillasRio(valle, cauce.ancho)) mapa[claveCasilla(lado, c.x, c.y)] = 1
  for (const k of cauce.vados) mapa[k] = 0
  return mapa
}

/**
 * Casillas alcanzables (4-conexas) desde `inicio` sin cruzar casillas bloqueadas.
 * Con `padres` rellena el árbol del recorrido (orden de vecinos fijo, determinista).
 */
function alcanzables(
  lado: number,
  bloqueada: Uint8Array,
  inicio: number,
  padres?: Int32Array,
): Uint8Array {
  const vista = new Uint8Array(lado * lado)
  if (bloqueada[inicio] === 1) return vista
  const pendientes = new Int32Array(lado * lado)
  let cabeza = 0
  let fin = 0
  pendientes[fin++] = inicio
  vista[inicio] = 1
  if (padres) padres[inicio] = -1
  while (cabeza < fin) {
    const i = pendientes[cabeza++] as number
    const x = i % lado
    const y = (i - x) / lado
    const vecinos = [
      y > 0 ? i - lado : -1,
      x > 0 ? i - 1 : -1,
      x < lado - 1 ? i + 1 : -1,
      y < lado - 1 ? i + lado : -1,
    ]
    for (const v of vecinos) {
      if (v < 0 || vista[v] === 1 || bloqueada[v] === 1) continue
      vista[v] = 1
      if (padres) padres[v] = i
      pendientes[fin++] = v
    }
  }
  return vista
}

/** Casilla libre más cercana (centro de casilla) al punto medio del borde del lado del pueblo. */
function elegirAparicion(
  lado: number,
  libre: (i: number) => boolean,
  ladoPueblo: ConfigPersonaje['ladoPueblo'],
): number {
  const objetivo = {
    norte: { x: lado / 2, y: 0 },
    sur: { x: lado / 2, y: lado },
    este: { x: lado, y: lado / 2 },
    oeste: { x: 0, y: lado / 2 },
  }[ladoPueblo]
  let mejor = -1
  let mejorD = Infinity
  for (let i = 0; i < lado * lado; i++) {
    if (!libre(i)) continue
    const x = (i % lado) + 0.5
    const y = Math.floor(i / lado) + 0.5
    const d = (x - objetivo.x) ** 2 + (y - objetivo.y) ** 2
    if (d < mejorD) {
      mejorD = d
      mejor = i
    }
  }
  return mejor
}

/**
 * Quita de forma determinista los obstáculos que dejan casillas libres aisladas:
 * por cada bolsa, los que hay en el camino más corto (BFS con orden fijo) hasta la
 * zona alcanzable desde la aparición.
 */
function quitarBolsas(
  lado: number,
  agua: Uint8Array,
  obstaculos: readonly Obstaculo[],
  inicio: number,
): Obstaculo[] {
  const porCasilla = new Map<number, Obstaculo>()
  for (const o of obstaculos) porCasilla.set(claveCasilla(lado, o.x, o.y), o)
  const padres = new Int32Array(lado * lado).fill(-1)
  const enBase = alcanzables(lado, agua, inicio, padres)
  const bloqueada = new Uint8Array(agua)
  for (const k of porCasilla.keys()) bloqueada[k] = 1
  let vista = alcanzables(lado, bloqueada, inicio)
  for (let i = 0; i < lado * lado; i++) {
    if (enBase[i] !== 1 || vista[i] === 1 || bloqueada[i] === 1) continue
    for (let p = i; p >= 0 && vista[p] !== 1; p = padres[p] as number) {
      porCasilla.delete(p)
      bloqueada[p] = 0
    }
    vista = alcanzables(lado, bloqueada, inicio)
  }
  return obstaculos.filter((o) => porCasilla.get(claveCasilla(lado, o.x, o.y)) === o)
}

/**
 * Genera lo que depende del valle y la semilla para el estado inicial: río (vados),
 * obstáculos y aparición. Determinista y sin consumir el RNG del estado (el valle
 * sigue siendo idéntico al de M1 con la misma semilla, salvo los vados).
 */
export function generarMundo(
  valle: Valle,
  semilla: number,
  config: Pick<ConfigValle, 'anchoRio' | 'densidadDecoracion' | 'vados'>,
  personaje: Pick<ConfigPersonaje, 'ladoPueblo'>,
): Pick<DatosMapa, 'cauce' | 'obstaculos' | 'aparicion'> {
  const lado = ladoValle(valle)
  const rio = casillasRio(valle, config.anchoRio)
  const claves = new Set(rio.map((c) => claveCasilla(lado, c.x, c.y)))
  const cauce: Cauce = { ancho: config.anchoRio, vados: generarVados(valle, rio, semilla, config) }
  const agua = aguaBloqueada(valle, cauce)
  // Los vados siguen siendo casillas de río: sin árboles ni rocas (como en M1).
  const crudos = decorarValle(valle, semilla, claves, config.densidadDecoracion)
  const ocupadas = new Set(crudos.map((o) => claveCasilla(lado, o.x, o.y)))
  const inicio = elegirAparicion(
    lado,
    (i) => agua[i] === 0 && !ocupadas.has(i),
    personaje.ladoPueblo,
  )
  if (inicio < 0) {
    throw new Error('Valle sin ninguna casilla libre: no hay dónde colocar la aparición')
  }
  const x = inicio % lado
  const y = (inicio - x) / lado
  return {
    cauce,
    obstaculos: quitarBolsas(lado, agua, crudos, inicio),
    aparicion: { x: x + 0.5, y: y + 0.5 },
  }
}

interface EntradaCache {
  readonly valle: Valle
  readonly aparicion: { readonly x: number; readonly y: number }
  readonly mapa: MapaTransitabilidad
}

const CACHE = new WeakMap<Cauce, WeakMap<readonly Obstaculo[], EntradaCache>>()

/**
 * Mapa de transitabilidad derivado del estado: bloquean el río (salvo los vados), los
 * obstáculos y toda casilla que no se alcance desde la aparición. Se cachea por
 * referencia de cauce y obstáculos; la entrada solo vale si el valle es el mismo y la
 * aparición (comparada por valor) coincide. Fuera del valle cuenta como bloqueado (`casillaBloqueada`).
 */
export function mapaTransitabilidad(datos: DatosMapa): MapaTransitabilidad {
  let porObstaculos = CACHE.get(datos.cauce)
  if (!porObstaculos) CACHE.set(datos.cauce, (porObstaculos = new WeakMap()))
  const hecho = porObstaculos.get(datos.obstaculos)
  if (
    hecho &&
    hecho.valle === datos.valle &&
    hecho.aparicion.x === datos.aparicion.x &&
    hecho.aparicion.y === datos.aparicion.y
  ) {
    return hecho.mapa
  }
  const lado = ladoValle(datos.valle)
  const bloqueada = aguaBloqueada(datos.valle, datos.cauce)
  for (const o of datos.obstaculos) bloqueada[claveCasilla(lado, o.x, o.y)] = 1
  const inicio = claveCasilla(lado, Math.floor(datos.aparicion.x), Math.floor(datos.aparicion.y))
  const vista = alcanzables(lado, bloqueada, inicio)
  for (let i = 0; i < bloqueada.length; i++) bloqueada[i] = vista[i] === 1 ? 0 : 1
  const mapa: MapaTransitabilidad = { lado, bloqueada }
  porObstaculos.set(datos.obstaculos, {
    valle: datos.valle,
    aparicion: { x: datos.aparicion.x, y: datos.aparicion.y },
    mapa,
  })
  return mapa
}

/** Fuera del valle cuenta como bloqueado. Acepta casillas enteras. */
export function casillaBloqueada(mapa: MapaTransitabilidad, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mapa.lado || y >= mapa.lado) return true
  return mapa.bloqueada[y * mapa.lado + x] === 1
}
