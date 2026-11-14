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
  CONFIG_TIEMPO,
  CULTIVOS,
  diasHastaMadurar,
  estaRegada,
  personajeAlDespertar,
  plantaEn,
  plantaNueva,
  tierraValida,
  vistaDePlanta,
  type EstadoJuego,
} from './index'
import { crecerPlantas, motivoNoRegar } from './riego'
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
const riegaOk = (e: EstadoJuego): EstadoJuego => (riega(e) as { estado: EstadoJuego }).estado
const amanece = (e: EstadoJuego): EstadoJuego => ({
  ...empezarDiaSiguiente(e, 'dormir').estado,
  personaje: e.personaje,
})
const vista = (e: EstadoJuego) => vistaDePlanta(plantaEn(e, 50, 51) as never)
/** Carácter de tierra de (50, 51). */
const suelo = (e: EstadoJuego) => e.tierra[sitio(50, 51)]
/** Estado con (50, 51) arada y sin planta. */
const sinPlanta = (): EstadoJuego => ({ ...conPlanta(), plantas: [] })
const regadaHoy = (e: EstadoJuego) => estaRegada(e, 50, 51)
const diasN = CONFIG_CULTIVOS.tierra.diasSinRegarAHierba
const marchitaEn = (e: EstadoJuego): EstadoJuego => ({
  ...e,
  plantas: [[sitio(50, 51), CULTIVOS.indexOf('rabano'), 0, 0, 3, 1]],
})

describe('data: necesidad de agua y tierra', () => {
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
  it('el esquema exige tierra.diasSinRegarAHierba entre 1 y 9', () => {
    const con = (n: unknown) =>
      v.safeParse(EsquemaConfigCultivos, { ...cultivosJson, tierra: { diasSinRegarAHierba: n } })
        .success
    expect(con(0)).toBe(false)
    expect(con(10)).toBe(false)
    expect(con(1)).toBe(true)
    expect(con(9)).toBe(true)
  })
  it('cada cultivo se marchita justo al llegar a los días sin regar de sus datos', () => {
    for (const c of CULTIVOS) {
      const dias = CONFIG_CULTIVOS.cultivos[c].necesidadAgua.diasSinRegar
      let e = conPlanta(c)
      for (let d = 1; d < dias; d++) e = amanece(e)
      expect(vista(e)?.marchita).toBe(false)
      e = amanece(e)
      expect(vista(e)?.marchita).toBe(true)
    }
  })
})

describe('regadera', () => {
  it('riega una planta, la tierra queda mojada, gasta energía y emite el evento', () => {
    const e = conPlanta()
    const r = riega(e)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(regadaHoy(r.estado)).toBe(true)
    expect(suelo(r.estado)).toBe('A')
    expect(r.estado.energia).toBeLessThan(e.energia)
    expect(r.eventos).toContainEqual({ tipo: 'tierra-regada', x: 50, y: 51 })
    expect(tierraValida(r.estado)).toBe(true)
  })
  it('también riega tierra arada sin planta', () => {
    const e = sinPlanta()
    const r = riega(e)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(regadaHoy(r.estado)).toBe(true)
    expect(r.estado.plantas).toBe(e.plantas)
    expect(r.estado.energia).toBeLessThan(e.energia)
  })
  it.each([
    [
      'tierra sin arar',
      (e: EstadoJuego) => ({ ...e, plantas: [], tierra: '.'.repeat(e.tierra.length) }),
      'no-arada',
    ],
    ['ya regada hoy', riegaOk, 'ya-regada'],
    ['planta marchita', marchitaEn, 'planta-marchita'],
    ['planta madura', () => conPlanta('rabano', 4), 'planta-madura'],
  ] as const)('rechaza sin gastar energía: %s', (_n, prepara, motivo) => {
    const s = prepara(conPlanta())
    expect(motivoNoRegar(s, 50, 51)).toBe(motivo)
    const r = riega(s)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe(motivo)
    expect(r.estado).toBe(s)
  })
})

describe('crecimiento diario', () => {
  it('regada crece un día; sin regar se detiene y cuenta días sin agua; todo queda sin regar', () => {
    const e = conPlanta()
    const a = amanece(riegaOk(e))
    expect(vista(a)).toMatchObject({ dias: 1, diasSinAgua: 0, marchita: false })
    expect(regadaHoy(a)).toBe(false)
    expect(suelo(a)).toBe('a')
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
    e = amanece(riegaOk(e))
    expect(vista(e)).toMatchObject({ diasSinAgua: 0, marchita: false, dias: 1 })
  })
  it('una marchita no se recupera ni crece aunque pasen los días', () => {
    let e = conPlanta()
    for (let i = 0; i < 3; i++) e = amanece(e)
    const antes = vista(e)
    for (let i = 0; i < 5; i++) e = amanece(e)
    expect(vista(e)).toEqual(antes)
  })
  it('una madura espera sin marchitarse ni necesitar agua', () => {
    let e = conPlanta('rabano', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.rabano))
    for (let i = 0; i < 10; i++) e = amanece(e)
    expect(vista(e)).toMatchObject({ dias: 4, marchita: false, diasSinAgua: 0 })
  })
  it('simulación: regando cada día madura en diasHastaMadurar y sigue viva', () => {
    for (const c of CULTIVOS) {
      let e = conPlanta(c)
      const total = diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
      for (let d = 0; d < total; d++) e = amanece({ ...riegaOk(e), energia: 100 })
      expect(vista(e)).toMatchObject({ dias: total, marchita: false })
    }
  })
  it('sin plantas ni tierra arada devuelve el mismo estado', () => {
    expect(crecerPlantas(base).estado).toBe(base)
  })
  it('con un estado de tierra inválido lo devuelve intacto', () => {
    const malo = { ...conPlanta(), tierra: 'xx' }
    expect(crecerPlantas(malo).estado).toBe(malo)
  })
})

describe('cambio de día por comandos', () => {
  it('Dormir hace crecer lo plantado', () => {
    const e0 = conPlanta()
    const e = { ...e0, personaje: personajeAlDespertar(e0) }
    const r = aplicarComando(e, { tipo: 'Dormir' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.dia).toBe(e.dia + 1)
    expect(vista(r.estado)?.diasSinAgua).toBe(1)
  })
  it('el desmayo también (pasar de la hora de fin de jornada)', () => {
    const r = aplicarComando(conPlanta(), { tipo: 'AvanzarTiempo', minutos: 1440 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.eventos.some((ev) => ev.tipo === 'desmayo')).toBe(true)
    expect(vista(r.estado)?.diasSinAgua).toBe(1)
  })
})

describe('tierra arada sin planta', () => {
  it('sin regar durante los días de los datos vuelve a hierba', () => {
    let e = sinPlanta()
    for (let d = 1; d < diasN; d++) {
      e = amanece(e)
      expect(suelo(e)).not.toBe('.')
      expect(tierraValida(e)).toBe(true)
    }
    e = amanece(e)
    expect(suelo(e)).toBe('.')
  })
  it('regar reinicia la cuenta', () => {
    let e = sinPlanta()
    for (let d = 1; d < diasN; d++) e = amanece(e)
    e = amanece(riegaOk(e))
    expect(suelo(e)).toBe('a')
    for (let d = 1; d < diasN; d++) e = amanece(e)
    expect(suelo(e)).not.toBe('.')
  })
  it('con planta (aunque sea marchita) la tierra no vuelve a hierba', () => {
    let e = conPlanta()
    for (let d = 0; d < diasN + 5; d++) e = amanece(e)
    expect(suelo(e)).toBe('a')
    expect(vista(e)).toBeDefined()
  })
})

describe('cambio de estación', () => {
  const ultimoDia = CONFIG_TIEMPO.diasPorEstacion
  it('marchita los cultivos que no son de la nueva estación (también los maduros) y avisa', () => {
    const r = empezarDiaSiguiente({ ...conPlanta('rabano', 2), dia: ultimoDia }, 'dormir')
    expect(vista(r.estado)?.marchita).toBe(true)
    expect(r.eventos).toContainEqual({ tipo: 'planta-marchita', x: 50, y: 51, cultivo: 'rabano' })
    const m = empezarDiaSiguiente({ ...conPlanta('rabano', 4), dia: ultimoDia }, 'dormir')
    expect(vista(m.estado)?.marchita).toBe(true)
  })
  it('dentro de la estación no marchita por esto', () => {
    const e = { ...conPlanta(), dia: ultimoDia - 1 }
    expect(vista(empezarDiaSiguiente(riegaOk(e), 'dormir').estado)?.marchita).toBe(false)
  })
})

describe('limpiar una marchita con la azada', () => {
  const usa = (e: EstadoJuego) =>
    aplicarComando({ ...e, herramienta: 'azada' }, { tipo: 'UsarHerramienta', x: 50, y: 51 })
  it('quita la planta y la casilla queda arada', () => {
    const e = marchitaEn(conPlanta())
    const r = usa(e)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.plantas).toHaveLength(0)
    expect(suelo(r.estado)).toBe('a')
    expect(tierraValida(r.estado)).toBe(true)
    expect(r.eventos).toContainEqual({ tipo: 'marchita-limpiada', x: 50, y: 51 })
    expect(r.estado.energia).toBeLessThan(e.energia)
  })
  it('una planta viva no se arranca con la azada (ya-arada)', () => {
    const r = usa(conPlanta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('ya-arada')
  })
})

describe('propiedades del riego', () => {
  const regaDia = fc.array(fc.boolean(), { minLength: 0, maxLength: 20 })
  it('dias <= madurez, marchita solo con los días secos seguidos de los datos, estado siempre válido', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CULTIVOS), regaDia, (c, plan) => {
        let e = conPlanta(c)
        const total = diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
        const limite = CONFIG_CULTIVOS.cultivos[c].necesidadAgua.diasSinRegar
        let secos = 0
        let marchita = false
        let dias = 0
        for (const riegaHoy of plan) {
          if (riegaHoy) {
            const r = riega(e)
            if (r.ok) e = r.estado
          }
          const regada = regadaHoy(e)
          e = amanece({ ...e, energia: 100 })
          const maduro = dias >= total
          if (!marchita && !maduro) {
            if (regada) {
              dias++
              secos = 0
            } else if (++secos >= limite) marchita = true
          }
          expect(tierraValida(e)).toBe(true)
          expect(vista(e)).toMatchObject({ dias, marchita })
          expect(regadaHoy(e)).toBe(false)
          expect(vista(e)?.dias).toBeLessThanOrEqual(total)
        }
      }),
    )
  })
  it('es determinista: mismos pasos sobre el mismo estado, mismo resultado', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('regar', 'dormir'), { maxLength: 15 }), (plan) => {
        const corre = () => {
          let e = conPlanta()
          const eventos: unknown[] = []
          for (const p of plan) {
            if (p === 'regar') {
              const r = riega({ ...e, energia: 100 })
              if (r.ok) {
                e = r.estado
                eventos.push(r.eventos)
              }
            } else {
              const r = empezarDiaSiguiente(e, 'dormir')
              e = { ...r.estado, personaje: e.personaje }
              eventos.push(r.eventos)
            }
          }
          return { e, eventos }
        }
        expect(corre()).toEqual(corre())
      }),
    )
  })
})
