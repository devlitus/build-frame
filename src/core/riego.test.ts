import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import cultivosJson from '../../data/cultivos.json'
import { EsquemaConfigCultivos } from './datos/esquemas'
import { conTierraLabrable } from '../../tests/unit/fixtures/labranza'
import {
  aplicarComando,
  crearEstadoInicial,
  CONFIG_CULTIVOS,
  CULTIVOS,
  diasHastaMadurar,
  plantaEn,
  plantaNueva,
  tierraValida,
  vistaDePlanta,
  type EstadoJuego,
} from './index'
import { crecerPlantas, puedeRegar } from './riego'
import { empezarDiaSiguiente } from './obras'
import { ladoValle } from './mapa'

const base = crearEstadoInicial({ semilla: 42 })
const lado = ladoValle(base.valle)
const sitio = (x: number, y: number) => y * lado + x

/** Estado con una planta del cultivo `c` en (50, 51) sobre tierra arada, regadera en mano. */
function conPlanta(c: (typeof CULTIVOS)[number] = 'rabano', dias = 0): EstadoJuego {
  const e = conTierraLabrable(
    { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
    50,
    50,
  )
  const i = sitio(50, 51)
  const planta = [...plantaNueva(i, CULTIVOS.indexOf(c))] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  planta[2] = dias
  return {
    ...e,
    herramienta: 'regadera',
    tierra: e.tierra.slice(0, i) + 'a' + e.tierra.slice(i + 1),
    plantas: [planta],
  }
}
const riega = (e: EstadoJuego, x = 50, y = 51) =>
  aplicarComando(e, { tipo: 'UsarHerramienta', x, y })
const amanece = (e: EstadoJuego): EstadoJuego => ({
  ...empezarDiaSiguiente(e, 'dormir').estado,
  personaje: e.personaje,
})
const vista = (e: EstadoJuego) => vistaDePlanta(plantaEn(e, 50, 51) as never)

describe('data: necesidad de agua', () => {
  it('el esquema exige necesidadAgua con días enteros >= 1', () => {
    const copia = (n: unknown) => {
      const c = structuredClone(cultivosJson) as unknown as {
        cultivos: Record<string, Record<string, unknown>>
      }
      if (n === undefined) delete c.cultivos.patata?.necesidadAgua
      else (c.cultivos.patata as Record<string, unknown>).necesidadAgua = { diasSinRegar: n }
      return v.safeParse(EsquemaConfigCultivos, c).success
    }
    expect(copia(undefined)).toBe(false)
    expect(copia(0)).toBe(false)
    expect(copia(1.5)).toBe(false)
    expect(copia(2)).toBe(true)
  })
  it('cada cultivo aguanta 3 días seguidos sin regar', () => {
    for (const c of CULTIVOS) expect(CONFIG_CULTIVOS.cultivos[c].necesidadAgua.diasSinRegar).toBe(3)
  })
})

describe('regadera', () => {
  it('riega una planta, gasta energía y emite el evento', () => {
    const e = conPlanta()
    const r = riega(e)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(vista(r.estado)?.regada).toBe(true)
    expect(r.estado.energia).toBeLessThan(e.energia)
    expect(r.eventos).toContainEqual({ tipo: 'planta-regada', x: 50, y: 51 })
    expect(tierraValida(r.estado)).toBe(true)
  })
  it('sin efecto (sin planta, sin arar, ya regada, marchita o madura) se acepta y solo gasta energía', () => {
    const e = conPlanta()
    const sinEfecto = (s: EstadoJuego, x = 50, y = 51) => {
      expect(puedeRegar(s, x, y)).toBe(false)
      const r = riega(s, x, y)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.estado.plantas).toBe(s.plantas)
      expect(r.estado.energia).toBeLessThan(s.energia)
      expect(r.eventos.some((ev) => ev.tipo === 'planta-regada')).toBe(false)
    }
    sinEfecto({ ...e, plantas: [] })
    sinEfecto(e, 50, 50)
    sinEfecto((riega(e) as { estado: EstadoJuego }).estado)
    sinEfecto({ ...e, plantas: [[sitio(50, 51), 0, 0, 0, 3, 1]] })
    sinEfecto(conPlanta('rabano', 4))
  })
})

describe('crecimiento diario', () => {
  it('regada crece un día; sin regar se detiene y cuenta días sin agua', () => {
    const e = conPlanta()
    const a = amanece((riega(e) as { estado: EstadoJuego }).estado)
    expect(vista(a)).toMatchObject({ dias: 1, regada: false, diasSinAgua: 0, marchita: false })
    const b = amanece(a)
    expect(vista(b)).toMatchObject({ dias: 1, diasSinAgua: 1, marchita: false })
  })
  it('se marchita al tercer día sin agua y avisa con un evento', () => {
    let e = conPlanta()
    e = amanece(e)
    e = amanece(e)
    expect(vista(e)?.marchita).toBe(false)
    const r = empezarDiaSiguiente(e, 'dormir')
    expect(vista(r.estado)).toMatchObject({ marchita: true, diasSinAgua: 3, dias: 0 })
    expect(r.eventos).toContainEqual({ tipo: 'planta-marchita', x: 50, y: 51, cultivo: 'rabano' })
  })
  it('regar a tiempo reinicia la cuenta', () => {
    let e = amanece(amanece(conPlanta()))
    e = amanece((riega(e) as { estado: EstadoJuego }).estado)
    expect(vista(e)).toMatchObject({ diasSinAgua: 0, marchita: false, dias: 1 })
  })
  it('una marchita no se recupera ni crece aunque pasen los días', () => {
    let e = conPlanta()
    for (let i = 0; i < 3; i++) e = amanece(e)
    const antes = vista(e)
    for (let i = 0; i < 5; i++) e = amanece(e)
    expect(vista(e)).toEqual(antes)
  })
  it('una madura espera sin marchitarse', () => {
    let e = conPlanta('rabano', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.rabano))
    for (let i = 0; i < 10; i++) e = amanece(e)
    expect(vista(e)).toMatchObject({ dias: 4, marchita: false })
  })
  it('simulación: regando cada día madura en diasHastaMadurar y sigue viva', () => {
    for (const c of CULTIVOS) {
      let e = conPlanta(c)
      const total = diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
      for (let d = 0; d < total; d++) {
        e = amanece({ ...(riega(e) as { estado: EstadoJuego }).estado, energia: 100 })
      }
      expect(vista(e)).toMatchObject({ dias: total, marchita: false })
    }
  })
  it('comando Dormir también hace crecer lo plantado', () => {
    const e = amanece(conPlanta())
    expect(vista(e)?.diasSinAgua).toBe(1)
  })
  it('sin plantas devuelve el mismo estado', () => {
    expect(crecerPlantas(base).estado).toBe(base)
  })
})

describe('propiedades del riego', () => {
  const regaDia = fc.array(fc.boolean(), { minLength: 0, maxLength: 30 })
  it('dias <= madurez, marchita solo con 3 días secos seguidos, estado siempre válido', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CULTIVOS), regaDia, (c, plan) => {
        let e = conPlanta(c)
        const total = diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
        let secos = 0
        let marchita = false
        let dias = 0
        for (const riegaHoy of plan) {
          if (riegaHoy) {
            const r = riega(e)
            if (r.ok) e = r.estado
          }
          const v = vista(e)
          const regada = v?.regada === true
          e = amanece({ ...e, energia: 100 })
          const maduro = dias >= total
          if (!marchita && !maduro) {
            if (regada) {
              dias++
              secos = 0
            } else if (++secos >= 3) marchita = true
          }
          expect(tierraValida(e)).toBe(true)
          expect(vista(e)).toMatchObject({ dias, marchita, regada: false })
          expect(vista(e)?.dias).toBeLessThanOrEqual(total)
        }
      }),
    )
  })
  it('es determinista', () => {
    const e = conPlanta()
    expect(amanece(e)).toEqual(amanece(e))
  })
})
