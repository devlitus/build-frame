import { CONFIG_PERSONAJE } from './datos/personaje'
import { casillasOcupadas, defEdificio, huellaDe } from './edificios'
import type { EstadoJuego } from './estado'
import { aguaBloqueada, ladoValle } from './mapa'
import { claveCasilla } from './rio'
import { aguaDe, zonaEn } from './zonas'

/**
 * Motivos por los que no se puede colocar un edificio, en orden de prioridad (la interfaz
 * muestra el primero que se cumple):
 * 1. `tipo-desconocido`: el tipo no está en el catálogo.
 * 2. `unico-ya-existe`: el edificio es único y ya hay uno (obra incluida).
 * 3. `fuera-del-valle`: alguna casilla de la huella queda fuera del valle (o `x`/`y` no son enteros).
 * 4. `no-propia`: alguna casilla es de una parcela que no se ha comprado.
 * 5. `agua`: alguna casilla es de río (vados incluidos).
 * 6. `obstaculo`: alguna casilla tiene un árbol o una roca.
 * 7. `ocupada`: alguna casilla ya es de otro edificio u obra.
 * 8. `aparicion`: la huella cubre la casilla de aparición.
 * 9. `personaje`: la huella toca la caja de colisión del personaje.
 * 10. `zona-incompatible`: alguna casilla no tiene una zona compatible con el edificio.
 * 11. `bloquea-paso`: tras colocarlo, alguna casilla transitable que era alcanzable desde la
 *     aparición dejaría de serlo (encierra la aparición o al personaje, o crea una bolsa
 *     cerrada). Es el más caro de calcular: solo se evalúa si no falla ninguno de los anteriores.
 * 12. `fondos-insuficientes`: falta dinero.
 * 13. `materiales-insuficientes`: falta madera o piedra.
 */
export const MOTIVOS_COLOCACION = [
  'tipo-desconocido',
  'unico-ya-existe',
  'fuera-del-valle',
  'no-propia',
  'agua',
  'obstaculo',
  'ocupada',
  'aparicion',
  'personaje',
  'zona-incompatible',
  'bloquea-paso',
  'fondos-insuficientes',
  'materiales-insuficientes',
] as const
export type MotivoColocacion = (typeof MOTIVOS_COLOCACION)[number]

export type ResultadoColocacion =
  { readonly valida: true } | { readonly valida: false; readonly motivo: MotivoColocacion }

export interface OpcionesColocacion {
  /** Edificio que se está moviendo: no choca consigo mismo ni cuenta para `unico`. */
  readonly ignorarId?: number
  /** No comprobar dinero ni materiales (mover un edificio no cuesta). */
  readonly ignorarCostes?: boolean
}

/** Parte del estado que necesita `colocacionValida`. */
export type EstadoColocacion = Pick<
  EstadoJuego,
  | 'valle'
  | 'cauce'
  | 'obstaculos'
  | 'aparicion'
  | 'personaje'
  | 'zonas'
  | 'edificios'
  | 'dinero'
  | 'materiales'
>

const cacheObstaculos = new WeakMap<EstadoJuego['obstaculos'], Map<number, ReadonlySet<number>>>()

function obstaculosDe(estado: EstadoColocacion, lado: number): ReadonlySet<number> {
  let porLado = cacheObstaculos.get(estado.obstaculos)
  if (!porLado) cacheObstaculos.set(estado.obstaculos, (porLado = new Map()))
  let set = porLado.get(lado)
  if (!set) {
    set = new Set(estado.obstaculos.map((o) => claveCasilla(lado, o.x, o.y)))
    porLado.set(lado, set)
  }
  return set
}

interface BaseAlcance {
  readonly edificios: EstadoColocacion['edificios']
  readonly valle: EstadoColocacion['valle']
  readonly cauce: EstadoColocacion['cauce']
  readonly obstaculos: EstadoColocacion['obstaculos']
  readonly ax: number
  readonly ay: number
  readonly ignorarId: number | undefined
  /** Casillas bloqueadas (agua, obstáculos, edificios salvo `ignorarId`). */
  readonly bloqueada: Uint8Array
  readonly inicio: number
  /** Casillas alcanzables desde la aparición antes de colocar. */
  readonly vista: Uint8Array
  readonly total: number
}

/** Última base calculada: el ratón pide muchas veces sobre el mismo estado. */
let ultimaBase: BaseAlcance | undefined

/** Recorrido 4-conexo desde `inicio`; para al llegar a `tope` casillas. Devuelve cuántas vio. */
function recorrer(
  lado: number,
  bloqueada: Uint8Array,
  inicio: number,
  vista: Uint8Array,
  tope: number,
): number {
  if (bloqueada[inicio] === 1) return 0
  const cola = new Int32Array(lado * lado)
  let cabeza = 0
  let fin = 0
  cola[fin++] = inicio
  vista[inicio] = 1
  const visitar = (v: number): void => {
    if (vista[v] === 0 && bloqueada[v] === 0) {
      vista[v] = 1
      cola[fin++] = v
    }
  }
  while (cabeza < fin && fin < tope) {
    const i = cola[cabeza++] as number
    const x = i % lado
    if (i >= lado) visitar(i - lado)
    if (x > 0) visitar(i - 1)
    if (x < lado - 1) visitar(i + 1)
    if (i + lado < lado * lado) visitar(i + lado)
  }
  return fin
}

function baseAlcance(
  estado: EstadoColocacion,
  lado: number,
  ignorarId: number | undefined,
): BaseAlcance {
  const b = ultimaBase
  const ax = Math.floor(estado.aparicion.x)
  const ay = Math.floor(estado.aparicion.y)
  if (
    b &&
    b.edificios === estado.edificios &&
    b.valle === estado.valle &&
    b.cauce === estado.cauce &&
    b.obstaculos === estado.obstaculos &&
    b.ax === ax &&
    b.ay === ay &&
    b.ignorarId === ignorarId
  ) {
    return b
  }
  const bloqueada = aguaBloqueada(estado.valle, estado.cauce)
  for (const k of obstaculosDe(estado, lado)) bloqueada[k] = 1
  for (const [k, id] of casillasOcupadas(estado.edificios, lado)) {
    if (id !== ignorarId) bloqueada[k] = 1
  }
  const inicio = ay * lado + ax
  const vista = new Uint8Array(lado * lado)
  const total =
    inicio >= 0 && inicio < lado * lado ? recorrer(lado, bloqueada, inicio, vista, Infinity) : 0
  return (ultimaBase = {
    edificios: estado.edificios,
    valle: estado.valle,
    cauce: estado.cauce,
    obstaculos: estado.obstaculos,
    ax,
    ay,
    ignorarId,
    bloqueada,
    inicio,
    vista,
    total,
  })
}

/**
 * ¿Dejaría la huella `h` sin alcanzar alguna casilla que hoy se alcanza desde la aparición?
 * Bloquear casillas solo puede reducir lo alcanzable, así que basta comparar el número.
 */
function bloqueaPaso(
  estado: EstadoColocacion,
  lado: number,
  h: { x0: number; y0: number; x1: number; y1: number },
  ignorarId: number | undefined,
): boolean {
  const base = baseAlcance(estado, lado, ignorarId)
  if (base.total === 0) return false
  const bloqueada = new Uint8Array(base.bloqueada)
  let propias = 0
  for (let cy = h.y0; cy <= h.y1; cy++) {
    for (let cx = h.x0; cx <= h.x1; cx++) {
      const k = cy * lado + cx
      bloqueada[k] = 1
      propias += base.vista[k] as number
    }
  }
  const objetivo = base.total - propias
  if (objetivo <= 0) return false
  return recorrer(lado, bloqueada, base.inicio, new Uint8Array(lado * lado), objetivo) < objetivo
}

/**
 * Única fuente de las reglas de colocación de edificios (GDD §6.3–6.5). Pura; nunca lanza con
 * un estado coherente. `(x, y)` es la esquina superior izquierda de la huella. Orden de los
 * motivos en `MOTIVOS_COLOCACION`. Sirve también para mover (`ignorarId`, `ignorarCostes`).
 */
export function colocacionValida(
  estado: EstadoColocacion,
  tipo: unknown,
  x: number,
  y: number,
  opciones: OpcionesColocacion = {},
): ResultadoColocacion {
  const no = (motivo: MotivoColocacion): ResultadoColocacion => ({ valida: false, motivo })
  const def = defEdificio(tipo)
  if (!def) return no('tipo-desconocido')
  if (def.unico && estado.edificios.some((e) => e.tipo === tipo && e.id !== opciones.ignorarId)) {
    return no('unico-ya-existe')
  }
  const { valle } = estado
  const lado = ladoValle(valle)
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return no('fuera-del-valle')
  const h = huellaDe(def, x, y)
  if (h.x0 < 0 || h.y0 < 0 || h.x1 >= lado || h.y1 >= lado) return no('fuera-del-valle')

  const c = valle.casillasPorParcela
  const agua = aguaDe(valle, estado.cauce.ancho, lado)
  const obstaculos = obstaculosDe(estado, lado)
  const ocupadas = casillasOcupadas(estado.edificios, lado)
  /** ¿Alguna casilla de la huella cumple `prueba`? */
  const alguna = (prueba: (cx: number, cy: number, k: number) => boolean): boolean => {
    for (let cy = h.y0; cy <= h.y1; cy++) {
      for (let cx = h.x0; cx <= h.x1; cx++) if (prueba(cx, cy, cy * lado + cx)) return true
    }
    return false
  }

  if (
    alguna((cx, cy) => {
      const p = valle.parcelas[Math.floor(cy / c) * valle.parcelasPorLado + Math.floor(cx / c)]
      return p?.estado !== 'propia'
    })
  ) {
    return no('no-propia')
  }
  if (alguna((_cx, _cy, k) => agua.has(k))) return no('agua')
  if (alguna((_cx, _cy, k) => obstaculos.has(k))) return no('obstaculo')
  if (
    alguna((_cx, _cy, k) => {
      const id = ocupadas.get(k)
      return id !== undefined && id !== opciones.ignorarId
    })
  ) {
    return no('ocupada')
  }
  const ax = Math.floor(estado.aparicion.x)
  const ay = Math.floor(estado.aparicion.y)
  if (ax >= h.x0 && ax <= h.x1 && ay >= h.y0 && ay <= h.y1) return no('aparicion')
  // Misma caja que `moverPersonaje`: las casillas que toca la caja centrada en el personaje.
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  const { x: px, y: py } = estado.personaje
  if (
    Math.floor(px - m) <= h.x1 &&
    Math.ceil(px + m) - 1 >= h.x0 &&
    Math.floor(py - m) <= h.y1 &&
    Math.ceil(py + m) - 1 >= h.y0
  ) {
    return no('personaje')
  }
  if (alguna((cx, cy) => !def.zonas.some((z) => z === zonaEn(estado, cx, cy)))) {
    return no('zona-incompatible')
  }
  if (bloqueaPaso(estado, lado, h, opciones.ignorarId)) return no('bloquea-paso')
  if (!opciones.ignorarCostes) {
    const { dinero, madera, piedra } = def.coste
    if (!Number.isSafeInteger(estado.dinero) || estado.dinero < dinero) {
      return no('fondos-insuficientes')
    }
    const mat = estado.materiales
    if (!(mat.madera >= madera) || !(mat.piedra >= piedra)) return no('materiales-insuficientes')
  }
  return { valida: true }
}
