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
 * pinta una ficha con su inicial). El plantón ya tiene icono; las semillas usan el genérico de
 * «semillas» como *placeholder* hasta que llegue `iconos/semilla-<id>` (lote 2 del arte de M5);
 * los productos de cosecha aún no tienen.
 */
export function rutaIconoObjeto(objeto: ObjetoId): string | undefined {
  const categoria = defObjeto(objeto)?.categoria
  if (categoria === 'planton') return rutaIcono('planton')
  if (categoria === 'semilla') return rutaIcono('semillas')
  return undefined
}
