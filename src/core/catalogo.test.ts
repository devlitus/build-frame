/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de catálogo conocido en tests */
import { describe, expect, it } from 'vitest'
import {
  catalogo,
  crearEstadoInicial,
  defEdificio,
  diasRestantes,
  entradaCatalogo,
  faltaPagar,
  restoTrasPagar,
  TIPOS_EDIFICIO,
  type EstadoJuego,
} from './index'

const base = crearEstadoInicial({ semilla: 42 })
const con = (e: Partial<EstadoJuego>): EstadoJuego => ({ ...base, ...e })

describe('catálogo de edificios (M4-05)', () => {
  it('lista todos los tipos del catálogo, en orden', () => {
    expect(catalogo(base).map((e) => e.tipo)).toEqual([...TIPOS_EDIFICIO])
  })

  it('con el lote de bienvenida y 1.100 monedas se puede construir todo', () => {
    for (const e of catalogo(base)) {
      expect(e.motivo).toBeUndefined()
      expect(e.faltan).toEqual({ dinero: 0, madera: 0, piedra: 0 })
    }
  })

  it('sin dinero: fondos-insuficientes y cuánto falta', () => {
    const e = entradaCatalogo(con({ dinero: 100 }), 'cobertizo')
    expect(e.motivo).toBe('fondos-insuficientes')
    expect(e.faltan).toEqual({ dinero: 200, madera: 0, piedra: 0 })
  })

  it('sin materiales: materiales-insuficientes y cuánto falta de cada uno', () => {
    const e = entradaCatalogo(con({ materiales: { madera: 30, piedra: 4 } }), 'cobertizo')
    expect(e.motivo).toBe('materiales-insuficientes')
    expect(e.faltan).toEqual({ dinero: 0, madera: 20, piedra: 6 })
  })

  it('si faltan dinero y materiales gana el dinero (como en colocacionValida)', () => {
    const e = entradaCatalogo(con({ dinero: 0, materiales: { madera: 0, piedra: 0 } }), 'cobertizo')
    expect(e.motivo).toBe('fondos-insuficientes')
    expect(e.faltan).toEqual({ dinero: 300, madera: 50, piedra: 10 })
  })

  it('la casa es gratis: se puede «pagar» con 0 de todo', () => {
    const e = entradaCatalogo(con({ dinero: 0, materiales: { madera: 0, piedra: 0 } }), 'casa')
    expect(e.motivo).toBeUndefined()
  })

  it('un edificio único que ya existe (obra incluida) da unico-ya-existe', () => {
    const e = entradaCatalogo(
      con({ edificios: [{ id: 1, tipo: 'casa', x: 0, y: 0, obra: { diaInicio: 1, diaFin: 4 } }] }),
      'casa',
    )
    expect(e.motivo).toBe('unico-ya-existe')
    // Los que no son únicos no se ven afectados.
    expect(
      entradaCatalogo(
        con({ edificios: [{ id: 1, tipo: 'caja-envio', x: 0, y: 0, obra: null }] }),
        'caja-envio',
      ).motivo,
    ).toBeUndefined()
  })

  it('faltaPagar coincide con el motivo de pago de colocacionValida para un dinero no entero', () => {
    expect(faltaPagar(con({ dinero: Number.NaN }), defEdificio('caja-envio')!)).toBe(
      'fondos-insuficientes',
    )
  })

  it('restoTrasPagar resta el coste de cada cosa', () => {
    const def = defEdificio('cobertizo')!
    expect(restoTrasPagar(base, def.coste)).toEqual({
      dinero: base.dinero - 300,
      madera: base.materiales.madera - 50,
      piedra: base.materiales.piedra - 10,
    })
  })

  it('es pura: no muta el estado', () => {
    const antes = JSON.stringify(base)
    catalogo(base)
    expect(JSON.stringify(base)).toBe(antes)
  })
})

describe('diasRestantes', () => {
  it('es diaFin - dia y nunca negativo', () => {
    const obra = { diaInicio: 2, diaFin: 5 }
    expect(diasRestantes(obra, 2)).toBe(3)
    expect(diasRestantes(obra, 4)).toBe(1)
    expect(diasRestantes(obra, 5)).toBe(0)
    expect(diasRestantes(obra, 9)).toBe(0)
  })
})
