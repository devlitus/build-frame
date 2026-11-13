import { parcelaComprable, type EstadoJuego } from '../../core'

/** Cómo se ve cada parcela en el Modo Plano (GDD §6.2): tuya, a la venta y alcanzable, o no. */
export type EstadoVisualParcela = 'propia' | 'comprable' | 'no-comprable'

export type EntradaVisual = Pick<EstadoJuego, 'valle' | 'dinero' | 'comprasHechas'>

/** Clasifica una parcela con `parcelaComprable`, la única fuente de las reglas de compra. */
export function estadoVisualDe(estado: EntradaVisual, indice: number): EstadoVisualParcela {
  if (estado.valle.parcelas[indice]?.estado === 'propia') return 'propia'
  return parcelaComprable(estado, indice).comprable ? 'comprable' : 'no-comprable'
}

/** Clasificación de todas las parcelas del valle. */
export function clasificarParcelas(estado: EntradaVisual): readonly EstadoVisualParcela[] {
  return estado.valle.parcelas.map((_, i) => estadoVisualDe(estado, i))
}

/**
 * Clasificador con memoria de la última entrada: el tiempo cambia el estado en cada fotograma
 * pero la clasificación solo depende de (valle, dinero, comprasHechas); se recalcula únicamente
 * cuando alguno cambia (referencia del valle, no su contenido) y, si no, devuelve la misma
 * lista. `calculos` cuenta los recálculos reales (para pruebas).
 */
export function crearClasificador(): {
  (estado: EntradaVisual): readonly EstadoVisualParcela[]
  readonly calculos: number
} {
  let valle: EntradaVisual['valle'] | undefined
  let dinero = Number.NaN
  let compras = Number.NaN
  let resultado: readonly EstadoVisualParcela[] = []
  let calculos = 0
  const f = (estado: EntradaVisual): readonly EstadoVisualParcela[] => {
    if (
      valle === estado.valle &&
      Object.is(dinero, estado.dinero) &&
      Object.is(compras, estado.comprasHechas)
    )
      return resultado
    valle = estado.valle
    dinero = estado.dinero
    compras = estado.comprasHechas
    resultado = clasificarParcelas(estado)
    calculos++
    return resultado
  }
  Object.defineProperty(f, 'calculos', { get: () => calculos })
  return f as typeof f & { readonly calculos: number }
}
