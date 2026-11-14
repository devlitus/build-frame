import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import cultivosJson from '../../data/cultivos.json'
import { conTierraLabrable } from '../../tests/unit/fixtures/labranza'
import {
  aplicarComando,
  aplicarZonas,
  CARACTER_ZONA,
  colocacionValida,
  crearEstadoInicial,
  cantidadDe,
  CONFIG_CULTIVOS,
  CULTIVOS,
  diasHastaMadurar,
  estaArada,
  faseDe,
  ladoValle,
  plantaEn,
  tierraValida,
  type EstadoJuego,
} from './index'
import { EsquemaConfigCultivos } from './datos/esquemas'

const base = crearEstadoInicial({ semilla: 42 })
const lado = ladoValle(base.valle)
const e0: EstadoJuego = conTierraLabrable(
  { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
  50,
  50,
)
const usar = (e: EstadoJuego, x: number, y: number) =>
  aplicarComando(e, { tipo: 'UsarHerramienta', x, y })
const error = (r: ReturnType<typeof aplicarComando>) => (r.ok ? undefined : r.error)
const siembra = (e: EstadoJuego, semilla: EstadoJuego['semillaElegida']): EstadoJuego => ({
  ...e,
  herramienta: 'semillas',
  semillaElegida: semilla,
})
function ok(r: ReturnType<typeof aplicarComando>): EstadoJuego {
  if (!r.ok) throw new Error(`rechazado: ${r.error}`)
  return r.estado
}

describe('data/cultivos.json', () => {
  it('cumple el esquema y trae los 5 cultivos de primavera', () => {
    expect(v.safeParse(EsquemaConfigCultivos, cultivosJson).success).toBe(true)
    expect(Object.keys(CONFIG_CULTIVOS.cultivos).sort()).toEqual([...CULTIVOS].sort())
    for (const c of CULTIVOS) expect(CONFIG_CULTIVOS.cultivos[c].estaciones).toContain('primavera')
    expect(CONFIG_CULTIVOS.cultivos.fresa.rebrota).not.toBeNull()
  })
  type Catalogo = Record<string, Record<string, unknown> & { cosecha: Record<string, unknown> }>
  const pat = (c: Catalogo) => c.patata as Catalogo[string]
  const roto = (cambio: (c: Catalogo) => void) => {
    const copia = structuredClone(cultivosJson) as unknown as { cultivos: Catalogo }
    cambio(copia.cultivos)
    return v.safeParse(EsquemaConfigCultivos, copia).success
  }
  it('rechaza datos mal formados', () => {
    expect(roto((c) => delete c.patata)).toBe(false)
    expect(roto((c) => (pat(c).diasPorFase = [1, 2]))).toBe(false)
    expect(roto((c) => (pat(c).diasPorFase = [0, 2, 2]))).toBe(false)
    expect(roto((c) => (pat(c).estaciones = []))).toBe(false)
    expect(roto((c) => (pat(c).estaciones = ['primavera', 'primavera']))).toBe(false)
    expect(roto((c) => (pat(c).estaciones = ['mayo']))).toBe(false)
    expect(roto((c) => (pat(c).zonas = ['vivienda']))).toBe(false)
    expect(roto((c) => (pat(c).precioBase = 0))).toBe(false)
    expect(roto((c) => (pat(c).cosecha.cantidad = 0))).toBe(false)
    expect(roto((c) => (pat(c).extra = 1))).toBe(false)
    expect(roto((c) => (c.otro = pat(c)))).toBe(false)
  })
  it('las fases reparten los días de crecimiento', () => {
    const def = { diasPorFase: [2, 2, 3] }
    expect(diasHastaMadurar(def)).toBe(7)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 99].map((d) => faseDe(def, d))).toEqual([
      0, 0, 1, 1, 2, 2, 2, 3, 3,
    ])
  })
})

describe('azada: arar', () => {
  it('ara una casilla de cultivo y gasta energía', () => {
    const r = usar(e0, 50, 51)
    const e1 = ok(r)
    expect(estaArada(e1, 50, 51)).toBe(true)
    expect(estaArada(e1, 50, 50)).toBe(false)
    expect(e1.energia).toBeLessThan(e0.energia)
    expect(e1.plantas).toEqual([])
    expect(tierraValida(e1)).toBe(true)
    expect(r.ok && r.eventos).toContainEqual({ tipo: 'tierra-arada', x: 50, y: 51 })
  })
  it('también ara en zona huerto', () => {
    const e = conTierraLabrable(e0, 50, 50, 2, 'huerto')
    expect(ok(usar(e, 51, 50)).tierra).not.toBe(e.tierra)
  })
  it('rechaza ya-arada, zona, no-propia y ocupada sin cambiar el estado', () => {
    const e1 = ok(usar(e0, 50, 51))
    expect(error(usar(e1, 50, 51))).toBe('ya-arada')
    const almacen = conTierraLabrable(e0, 51, 51, 1, 'almacen')
    const sinZona = { ...e0, zonas: e0.zonas.replaceAll(CARACTER_ZONA.cultivo, '.') }
    expect(error(usar(sinZona, 50, 51))).toBe('zona')
    const viv = conTierraLabrable(e0, 50, 50, 2, 'vivienda')
    expect(error(usar(viv, 50, 51))).toBe('zona')
    const ajena: EstadoJuego = {
      ...e0,
      valle: {
        ...e0.valle,
        parcelas: e0.valle.parcelas.map((p) => ({ ...p, estado: 'en-venta' as const })),
      },
    }
    expect(error(usar(ajena, 50, 51))).toBe('no-propia')
    const conCaja = ok(
      aplicarComando(
        { ...almacen, modo: 'plano', dinero: 1e6, materiales: { madera: 999, piedra: 999 } },
        { tipo: 'Construir', tipoEdificio: 'caja-envio', x: 51, y: 51 },
      ),
    )
    expect(error(usar({ ...conCaja, modo: 'vida' }, 51, 51))).toBe('ocupada')
    expect(e0.tierra).toBe(base.tierra)
  })
})

describe('semillas: plantar', () => {
  const arado = ok(usar(e0, 50, 51))
  const conSemilla = siembra(arado, 'semilla-patata')
  it('planta, gasta exactamente 1 semilla y deja la casilla ocupada', () => {
    const antes = cantidadDe(conSemilla.inventario, 'semilla-patata')
    const r = usar(conSemilla, 50, 51)
    const e1 = ok(r)
    expect(cantidadDe(e1.inventario, 'semilla-patata')).toBe(antes - 1)
    expect(plantaEn(e1, 50, 51)).toEqual([51 * lado + 50, CULTIVOS.indexOf('patata'), 0, 0, 0, 0])
    expect(r.ok && r.eventos).toContainEqual({
      tipo: 'planta-sembrada',
      x: 50,
      y: 51,
      cultivo: 'patata',
    })
    expect(tierraValida(e1)).toBe(true)
    expect(error(usar(e1, 50, 51))).toBe('ocupada')
  })
  it('rechaza no-arada, fuera-de-estacion y zona', () => {
    expect(error(usar(conSemilla, 51, 51))).toBe('no-arada')
    expect(error(usar({ ...conSemilla, dia: 22 }, 50, 51))).toBe('fuera-de-estacion')
    const otraZona = {
      ...conSemilla,
      zonas: conSemilla.zonas.replaceAll(CARACTER_ZONA.cultivo, CARACTER_ZONA.vivienda),
    }
    expect(error(usar(otraZona, 50, 51))).toBe('zona')
  })
  it('sin-semillas cuando no quedan o el objeto no es una semilla', () => {
    expect(error(usar(siembra(arado, 'semilla-lechuga'), 50, 51))).toBe('sin-semillas')
    expect(error(usar(siembra(arado, 'planton'), 50, 51))).toBe('sin-semillas')
  })
})

describe('tierra, zonas y construcción', () => {
  const plantado = ok(usar(siembra(ok(usar(e0, 50, 51)), 'semilla-patata'), 50, 51))
  const arada = ok(usar(e0, 49, 49))
  const rect = (x: number, y: number) => ({ x0: x, y0: y, x1: x, y1: y })
  it('aplicarZonas no mueve una casilla con planta a otra zona que no sea de cultivo', () => {
    const r = aplicarZonas(plantado, rect(50, 51), CARACTER_ZONA.vivienda)
    expect(r.ok && r.zonas).toBe(plantado.zonas)
    expect(r.ok && r.tierra).toBe(plantado.tierra)
    const h = aplicarZonas(plantado, rect(50, 51), CARACTER_ZONA.huerto)
    expect(h.ok && h.cambiadas).toBe(1)
  })
  it('aplicarZonas limpia la tierra arada vacía que deja de ser labrable', () => {
    const r = aplicarZonas(arada, rect(49, 49), CARACTER_ZONA.vivienda)
    expect(r.ok && r.tierra[49 * lado + 49]).toBe('.')
    const h = aplicarZonas(arada, rect(49, 49), CARACTER_ZONA.huerto)
    expect(h.ok && h.tierra).toBe(arada.tierra)
  })
  it('colocacionValida da ocupada si hay planta', () => {
    const mal = { ...plantado, dinero: 1e6, materiales: { madera: 999, piedra: 999 } }
    expect(colocacionValida(mal, 'caja-envio', 50, 51)).toMatchObject({
      valida: false,
      motivo: 'ocupada',
    })
  })
})
