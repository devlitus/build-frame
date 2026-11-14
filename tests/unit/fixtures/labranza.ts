import { CARACTER_ZONA, ladoValle, type EstadoJuego, type Zona } from '../../../src/core'

/**
 * Estado de pruebas con un cuadrado de casillas listo para arar: las parcelas que lo cubren son
 * propias, sus casillas llevan `zona` (por defecto cultivo) y no queda ningún obstáculo dentro.
 * El río no se toca: elige un centro lejos del cauce (la semilla 42 lo cumple en (50, 50)).
 */
export function conTierraLabrable(
  estado: EstadoJuego,
  cx: number,
  cy: number,
  radio = 2,
  zona: Zona = 'cultivo',
): EstadoJuego {
  const lado = ladoValle(estado.valle)
  const c = estado.valle.casillasPorParcela
  const celdas = estado.zonas.split('')
  const propias = new Set<number>()
  for (let y = cy - radio; y <= cy + radio; y++) {
    for (let x = cx - radio; x <= cx + radio; x++) {
      celdas[y * lado + x] = CARACTER_ZONA[zona]
      propias.add(Math.floor(y / c) * estado.valle.parcelasPorLado + Math.floor(x / c))
    }
  }
  const parcelas = estado.valle.parcelas.map((p, i) =>
    propias.has(i) ? { ...p, estado: 'propia' as const } : p,
  )
  return {
    ...estado,
    zonas: celdas.join(''),
    valle: { ...estado.valle, parcelas },
    obstaculos: estado.obstaculos.filter(
      (o) => Math.abs(o.x - cx) > radio || Math.abs(o.y - cy) > radio,
    ),
  }
}
