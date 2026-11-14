import { HERRAMIENTAS, OBJETOS, TIPOS_EDIFICIO } from './datos/claves'
import { CONFIG_INVENTARIO } from './datos/inventario'
import type { DefObjeto } from './datos/esquemas'
import type { Edificio, TipoEdificio } from './edificios'

export { HERRAMIENTAS, OBJETOS }
export type Herramienta = (typeof HERRAMIENTAS)[number]
export type ObjetoId = (typeof OBJETOS)[number]

/** Una ranura del inventario: un objeto y cuántos hay apilados (1 a la pila máxima del objeto). */
export interface Ranura {
  readonly objeto: ObjetoId
  readonly cantidad: number
}

/**
 * Objetos del jugador, en el orden en que se fueron guardando. Invariantes (los comprueba
 * `inventarioValido`): cantidades enteras > 0, ninguna ranura por encima de la pila máxima de su
 * objeto y, por objeto, como mucho una ranura incompleta. Las herramientas no ocupan ranuras; la
 * madera y la piedra no son objetos (van en `materiales`).
 */
export type Inventario = readonly Ranura[]

export const esHerramienta = (h: unknown): h is Herramienta =>
  typeof h === 'string' && (HERRAMIENTAS as readonly string[]).includes(h)

export const esObjeto = (o: unknown): o is ObjetoId =>
  typeof o === 'string' && (OBJETOS as readonly string[]).includes(o)

/** Definición del objeto en el catálogo, o `undefined` si no existe. */
export function defObjeto(objeto: unknown): DefObjeto | undefined {
  return esObjeto(objeto) ? CONFIG_INVENTARIO.objetos[objeto] : undefined
}

export const esSemilla = (objeto: unknown): objeto is ObjetoId =>
  defObjeto(objeto)?.categoria === 'semilla'

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

/**
 * Ranuras del inventario: la base más las de cada edificio **terminado** (`obra === null`) según
 * `data/inventario.json`. Una obra o un edificio demolido no suman.
 */
export function capacidadInventario(edificios: readonly Pick<Edificio, 'tipo' | 'obra'>[]): number {
  let n = CONFIG_INVENTARIO.capacidadBase
  if (!Array.isArray(edificios)) return n
  for (const e of edificios) {
    const tipo: unknown = e?.tipo
    if (e?.obra === null && (TIPOS_EDIFICIO as readonly unknown[]).includes(tipo)) {
      n += CONFIG_INVENTARIO.ranurasPorEdificio[tipo as TipoEdificio]
    }
  }
  return n
}

/** Cantidad total del objeto (suma de todas sus ranuras). */
export function cantidadDe(inventario: Inventario, objeto: ObjetoId): number {
  let n = 0
  for (const r of inventario) if (r.objeto === objeto) n += r.cantidad
  return n
}

/** El inventario cumple los invariantes (un guardado manipulado podría no hacerlo). */
export function inventarioValido(inventario: unknown): inventario is Inventario {
  if (!Array.isArray(inventario)) return false
  const incompletas = new Set<string>()
  for (const r of inventario as unknown[]) {
    if (typeof r !== 'object' || r === null) return false
    const { objeto, cantidad } = r as Record<string, unknown>
    const def = defObjeto(objeto)
    if (!def || !entero(cantidad) || cantidad < 1 || cantidad > def.pilaMaxima) return false
    if (cantidad < def.pilaMaxima) {
      if (incompletas.has(objeto as string)) return false
      incompletas.add(objeto as string)
    }
  }
  return true
}

/**
 * Guarda `cantidad` del objeto: rellena primero su ranura incompleta y abre ranuras nuevas al
 * final. Todo o nada: devuelve `undefined` si la cantidad o el objeto no valen, si el inventario
 * ya está **por encima** de su capacidad (no admite nada nuevo hasta que baje) o si no caben.
 * Con el inventario justo en su capacidad aún se puede rellenar una ranura incompleta.
 */
export function anadirObjeto(
  inventario: Inventario,
  objeto: ObjetoId,
  cantidad: number,
  capacidad: number,
): Inventario | undefined {
  const def = defObjeto(objeto)
  if (!def || !entero(cantidad) || cantidad < 1 || !entero(capacidad)) return undefined
  if (inventario.length > capacidad) return undefined
  const { pilaMaxima } = def
  let restante = cantidad
  const rellenado = inventario.map((r) => {
    if (restante === 0 || r.objeto !== objeto || r.cantidad >= pilaMaxima) return r
    const n = Math.min(pilaMaxima - r.cantidad, restante)
    restante -= n
    return { objeto, cantidad: r.cantidad + n }
  })
  const completas = Math.floor(restante / pilaMaxima)
  const resto = restante % pilaMaxima
  if (rellenado.length + completas + (resto > 0 ? 1 : 0) > capacidad) return undefined
  const nuevas: Ranura[] = []
  for (let i = 0; i < completas; i++) nuevas.push({ objeto, cantidad: pilaMaxima })
  if (resto > 0) nuevas.push({ objeto, cantidad: resto })
  return [...rellenado, ...nuevas]
}

/**
 * Saca `cantidad` del objeto, vaciando antes la ranura incompleta y luego las últimas; las
 * ranuras que quedan vacías desaparecen. Devuelve `undefined` si no hay tantas.
 */
export function quitarObjeto(
  inventario: Inventario,
  objeto: ObjetoId,
  cantidad: number,
): Inventario | undefined {
  const def = defObjeto(objeto)
  if (!def || !entero(cantidad) || cantidad < 1) return undefined
  if (cantidadDe(inventario, objeto) < cantidad) return undefined
  const indices = inventario
    .map((r, i) => (r.objeto === objeto ? i : -1))
    .filter((i) => i >= 0)
    // Primero la incompleta y después de la última a la primera.
    .sort((a, b) => {
      const ia = (inventario[a]?.cantidad ?? 0) < def.pilaMaxima ? 0 : 1
      const ib = (inventario[b]?.cantidad ?? 0) < def.pilaMaxima ? 0 : 1
      return ia - ib || b - a
    })
  const cantidades = inventario.map((r) => r.cantidad)
  let restante = cantidad
  for (const i of indices) {
    if (restante === 0) break
    const n = Math.min(cantidades[i] ?? 0, restante)
    cantidades[i] = (cantidades[i] ?? 0) - n
    restante -= n
  }
  return inventario
    .map((r, i) => ({ objeto: r.objeto, cantidad: cantidades[i] ?? 0 }))
    .filter((r) => r.cantidad > 0)
}

/** Inventario con el que empieza una partida: el lote de regalo de `data/inventario.json`. */
export function inventarioInicial(): Inventario {
  let inv: Inventario = []
  for (const { objeto, cantidad } of CONFIG_INVENTARIO.loteInicial) {
    // El esquema garantiza que el lote cabe en la capacidad base.
    inv = anadirObjeto(inv, objeto, cantidad, CONFIG_INVENTARIO.capacidadBase) ?? inv
  }
  return inv
}
