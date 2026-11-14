import type { ConfigValle } from './datos/esquemas'
import { CONFIG_VALLE } from './datos/valle'
import { claveCasilla } from './rio'
import { siguienteAleatorio } from './rng'
import type { Valle } from './valle'

/**
 * Árbol, roca o plantón colocados en una casilla; bloquean el paso. Se talan y pican con el hacha
 * y el pico (`recursos.ts`); el plantón es un árbol recién replantado que crece con los días.
 */
export interface Decoracion {
  readonly tipo: 'arbol' | 'roca' | 'planton'
  /** Casilla global. */
  readonly x: number
  readonly y: number
  /** 0–1: varía tamaño y forma de forma determinista. */
  readonly variante: number
  /** Golpes ya recibidos del hacha o el pico (ausente: ninguno). Al llegar a los de `data/recursos.json` se quita. */
  readonly golpes?: number
  /** Solo plantones: día en que se plantó; al cumplirse `diasCrecimiento` pasa a ser un árbol. */
  readonly diaPlantado?: number
}

export type Obstaculo = Decoracion

type Densidad = ConfigValle['densidadDecoracion']

/*
 * La decoración inicial usa un flujo aleatorio derivado de la semilla y del índice de parcela,
 * no el RNG del estado: así el valle de M1 se conserva idéntico con la misma semilla.
 */

/**
 * Coloca árboles y rocas de una parcela. Determinista: depende solo de la semilla,
 * el índice de la parcela y su terreno. Cada casilla consume siempre las mismas
 * tiradas, así quitar o mover el río no cambia el resto de la decoración.
 */
export function decorarParcela(
  valle: Valle,
  indice: number,
  semilla: number,
  casillasRio: ReadonlySet<number>,
  densidad: Densidad = CONFIG_VALLE.densidadDecoracion,
): Decoracion[] {
  const parcela = valle.parcelas[indice]
  if (!parcela) return []
  const c = valle.casillasPorParcela
  const lado = valle.parcelasPorLado * c
  const dens = densidad[parcela.terreno]
  let rng = (semilla + Math.imul(indice + 1, 0x9e3779b1)) >>> 0
  const sortear = (): number => {
    const r = siguienteAleatorio(rng)
    rng = r.estadoRng
    return r.valor
  }
  const salida: Decoracion[] = []
  for (let y = 0; y < c; y++) {
    for (let x = 0; x < c; x++) {
      const tirada = sortear()
      const variante = sortear()
      const gx = parcela.columna * c + x
      const gy = parcela.fila * c + y
      if (casillasRio.has(claveCasilla(lado, gx, gy))) continue
      if (tirada < dens.arbol) salida.push({ tipo: 'arbol', x: gx, y: gy, variante })
      else if (tirada < dens.arbol + dens.roca)
        salida.push({ tipo: 'roca', x: gx, y: gy, variante })
    }
  }
  return salida
}

export function decorarValle(
  valle: Valle,
  semilla: number,
  casillasRio: ReadonlySet<number>,
  densidad: Densidad = CONFIG_VALLE.densidadDecoracion,
): Decoracion[] {
  return valle.parcelas.flatMap((_, i) => decorarParcela(valle, i, semilla, casillasRio, densidad))
}
