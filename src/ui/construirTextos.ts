import {
  entradaCatalogo,
  type Coste,
  type EntradaCatalogo,
  type ErrorComando,
  type EstadoCatalogo,
  type TipoEdificio,
  type Zona,
} from '../core'
import { formatearDinero } from './formatoDinero'
import { textoPrecio } from './parcelaTextos'
import { existeTexto, t, tp, type ClaveTexto } from './textos'

export function nombreEdificio(tipo: TipoEdificio): string {
  return t(`edificio_${tipo}` as ClaveTexto)
}

export function nombreZona(z: Zona): string {
  return t(`zona_${z}` as ClaveTexto)
}

/** «Vivienda o Almacén». */
export function textoZonas(zonas: readonly Zona[]): string {
  return zonas.map(nombreZona).join(t('edificioZonaUnion'))
}

/** «A, B y C»: une trozos con coma y «y» antes del último. */
function unir(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('')
  return (
    partes.slice(0, -1).join(t('costeUnion')) + t('costeUnionFinal') + partes[partes.length - 1]
  )
}

/** Trozos de texto de las cantidades que no son cero: «300 monedas», «50 de madera»… */
function trozos(c: Coste): string[] {
  const r: string[] = []
  if (c.dinero > 0) r.push(textoPrecio(c.dinero))
  if (c.madera > 0) r.push(tp('costeMadera', { n: formatearDinero(c.madera) }))
  if (c.piedra > 0) r.push(tp('costePiedra', { n: formatearDinero(c.piedra) }))
  return r
}

/** Coste en palabras («300 monedas, 50 de madera y 10 de piedra»); «Gratis» si no cuesta nada. */
export function textoCoste(c: Coste): string {
  const r = trozos(c)
  return r.length === 0 ? t('costeGratis') : unir(r)
}

/** Dinero, madera y piedra siempre (aunque sean 0): lo que te queda tras construir. */
export function textoResto(c: Coste): string {
  return unir([
    tp('restoDinero', { n: formatearDinero(c.dinero) }),
    tp('costeMadera', { n: formatearDinero(c.madera) }),
    tp('costePiedra', { n: formatearDinero(c.piedra) }),
  ])
}

/** Lo que se devuelve al demoler o cancelar, en palabras; «nada» si no es nada (la obra de la casa). */
export function textoReembolso(c: Coste): string {
  return sinNada(c) ? t('reembolsoNada') : textoCoste(c)
}

export function textoDias(dias: number): string {
  return tp(dias === 1 ? 'edificioDia' : 'edificioDias', { n: dias })
}

function sinNada(c: Coste): boolean {
  return !(c.dinero > 0 || c.madera > 0 || c.piedra > 0)
}

/** Motivo en texto por el que un edificio no se puede pagar o no se puede tener otro (entrada del catálogo). */
export function textoMotivoCatalogo(e: EntradaCatalogo): string | undefined {
  if (!e.motivo) return undefined
  if (e.motivo === 'unico-ya-existe') return t('catalogoUnico')
  // Con datos corruptos puede no faltar nada visible: nunca «Te faltan Gratis».
  if (sinNada(e.faltan)) return t('catalogoNoPagable')
  return tp('catalogoFalta', { lista: textoCoste(e.faltan) })
}

/**
 * Texto de cualquier motivo por el que no se puede construir (los de `MOTIVOS_COLOCACION` y
 * `solo-en-plano`). Los de pago y zona dicen cuánto falta y qué zona hace falta.
 */
export function textoColocacion(
  motivo: ErrorComando,
  tipo: TipoEdificio,
  estado: EstadoCatalogo,
): string {
  const clave = `colocacion_${motivo}`
  const e = entradaCatalogo(estado, tipo)
  if (motivo === 'fondos-insuficientes' && e.faltan.dinero <= 0) return t('catalogoNoPagable')
  if (motivo === 'materiales-insuficientes' && e.faltan.madera <= 0 && e.faltan.piedra <= 0) {
    return t('catalogoNoPagable')
  }
  return tp(existeTexto(clave) ? clave : 'colocacion_otro', {
    zonas: textoZonas(e.def.zonas),
    n: formatearDinero(e.faltan.dinero),
    lista: textoCoste({ dinero: 0, madera: e.faltan.madera, piedra: e.faltan.piedra }),
  })
}
