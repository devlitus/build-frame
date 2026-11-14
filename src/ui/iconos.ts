import type { Herramienta, ObjetoId } from '../core'
import { defObjeto } from '../core'
import { dprActual, sufijoArte } from '../game/resolucion'

/** Ruta del icono (48×48 @1x, 96×96 @2x) según el DPR, como las texturas del valle (`arte.ts`). */
export function rutaIcono(nombre: string, dpr: number = dprActual()): string {
  return `assets/iconos/${nombre}${sufijoArte(dpr)}.webp`
}

export const rutaIconoHerramienta = (h: Herramienta): string => rutaIcono(h)

/**
 * Icono de un objeto del inventario, o `undefined` si todavía no tiene arte (entonces la interfaz
 * pinta una ficha con su inicial). El plantón y cada semilla (`iconos/semilla-<cultivo>`, que
 * coincide con el id del objeto) tienen icono; los productos de cosecha aún no (su arte es de M6).
 */
export function rutaIconoObjeto(objeto: ObjetoId): string | undefined {
  const categoria = defObjeto(objeto)?.categoria
  if (categoria === 'planton') return rutaIcono('planton')
  if (categoria === 'semilla') return rutaIcono(objeto)
  return undefined
}
