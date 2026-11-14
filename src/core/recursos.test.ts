import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  casillaBloqueada,
  CONFIG_RECURSOS,
  costeEnergia,
  crearEstadoInicial,
  crecerPlantones,
  golpesNecesarios,
  ladoValle,
  mapaTransitabilidad,
  puedePlantarPlanton,
  siguienteAleatorio,
  terrenoDeCasilla,
  type Comando,
  type EstadoJuego,
  type Obstaculo,
} from './index'

const base = crearEstadoInicial({ semilla: 42 })
/** Valle despejado: todas las parcelas propias, sin obstáculos; personaje en (50, 50). */
const limpio: EstadoJuego = {
  ...base,
  valle: { ...base.valle, parcelas: base.valle.parcelas.map((p) => ({ ...p, estado: 'propia' })) },
  obstaculos: [],
  inventario: [],
  materiales: { madera: 0, piedra: 0 },
  edificios: [],
  personaje: { x: 50.5, y: 50.5, orientacion: 'sur' },
  herramienta: 'hacha',
}
const con = (...obstaculos: Obstaculo[]): EstadoJuego => ({ ...limpio, obstaculos })
const arbol: Obstaculo = { tipo: 'arbol', x: 51, y: 50, variante: 0.5 }
const roca: Obstaculo = { tipo: 'roca', x: 49, y: 50, variante: 0.5 }
const usar = (e: EstadoJuego, x: number, y: number, h = e.herramienta) => {
  const c: Comando = { tipo: 'UsarHerramienta', x, y }
  return aplicarComando({ ...e, herramienta: h }, c)
}
const terreno = terrenoDeCasilla(limpio, 51, 50) as 'prado' | 'bosque' | 'rocoso'
const terrenoR = terrenoDeCasilla(limpio, 49, 50) as 'prado' | 'bosque' | 'rocoso'
const golpesA = golpesNecesarios(arbol, terreno)
const golpesR = golpesNecesarios(roca, terrenoR)
const llena = () =>
  Array.from({ length: capacidadInventario([]) }, () => ({
    objeto: 'patata' as const,
    cantidad: 99,
  }))

/** Estado del RNG para el que el sorteo del plantón sale (o no) con la probabilidad de los datos. */
function rngQue(sale: boolean): number {
  for (let r = 0; ; r++) {
    if (siguienteAleatorio(r).valor < CONFIG_RECURSOS.arbol.probabilidadPlanton === sale) return r
  }
}

/** Repite el uso `n` veces con la energía llena, acumulando el estado y los eventos. */
function repetir(e: EstadoJuego, n: number, x: number, y: number, h: 'hacha' | 'pico') {
  let estado: EstadoJuego = { ...e, herramienta: h }
  const eventos: string[] = []
  for (let i = 0; i < n; i++) {
    const r = usar({ ...estado, energia: 100 }, x, y)
    if (!r.ok) throw new Error(r.error)
    estado = r.estado
    eventos.push(...r.eventos.map((ev) => ev.tipo))
  }
  return { estado, eventos }
}

describe('datos de recursos', () => {
  it('los golpes y el botín son enteros positivos por terreno', () => {
    expect(golpesA).toBeGreaterThanOrEqual(1)
    expect(golpesR).toBeGreaterThanOrEqual(1)
    expect(CONFIG_RECURSOS.arbol.madera[terreno]).toBeGreaterThan(0)
    expect(CONFIG_RECURSOS.roca.piedra[terrenoR]).toBeGreaterThan(0)
  })
  it('el rocoso cuesta más picar que el prado', () => {
    expect(CONFIG_RECURSOS.roca.golpes.rocoso).toBeGreaterThan(CONFIG_RECURSOS.roca.golpes.prado)
  })
  it('la probabilidad del plantón está entre 0 y 1', () => {
    expect(CONFIG_RECURSOS.arbol.probabilidadPlanton).toBeGreaterThanOrEqual(0)
    expect(CONFIG_RECURSOS.arbol.probabilidadPlanton).toBeLessThanOrEqual(1)
  })
})

describe('hacha', () => {
  it('un golpe que no basta gasta energía, cuenta el golpe y no da botín', () => {
    expect(golpesA).toBeGreaterThanOrEqual(2)
    const e = con(arbol)
    const r = usar(e, 51, 50)
    expect(r.ok).toBe(true)
    expect(r.estado.energia).toBe(e.energia - costeEnergia('hacha'))
    expect(r.estado.obstaculos[0]).toMatchObject({ tipo: 'arbol', golpes: 1 })
    expect(r.estado.materiales).toEqual(e.materiales)
    expect(r.ok && r.eventos.map((v) => v.tipo)).toEqual([
      'herramienta-usada',
      'obstaculo-golpeado',
    ])
  })
  it('talar un árbol lo quita, da madera y a veces un plantón', () => {
    const { estado, eventos } = repetir(
      { ...con(arbol), rng: rngQue(true) },
      golpesA,
      51,
      50,
      'hacha',
    )
    expect(estado.obstaculos).toEqual([])
    expect(estado.materiales.madera).toBe(CONFIG_RECURSOS.arbol.madera[terreno])
    expect(estado.materiales.piedra).toBe(0)
    expect(cantidadDe(estado.inventario, 'planton')).toBe(CONFIG_RECURSOS.arbol.plantones)
    expect(eventos.filter((t) => t === 'obstaculo-quitado')).toHaveLength(1)
  })
  it('el plantón sale por probabilidad con el RNG del estado, de forma determinista', () => {
    const sin = repetir({ ...con(arbol), rng: rngQue(false) }, golpesA, 51, 50, 'hacha').estado
    expect(cantidadDe(sin.inventario, 'planton')).toBe(0)
    expect(sin.materiales.madera).toBe(CONFIG_RECURSOS.arbol.madera[terreno])
    const a = repetir({ ...con(arbol), rng: rngQue(true) }, golpesA, 51, 50, 'hacha').estado
    const b = repetir({ ...con(arbol), rng: rngQue(true) }, golpesA, 51, 50, 'hacha').estado
    expect(a).toEqual(b)
    expect(a.rng).not.toBe(rngQue(true))
  })
  it('cambiar de herramienta no pierde los golpes dados', () => {
    let e = repetir(con(arbol), 1, 51, 50, 'hacha').estado
    for (const herramienta of ['pico', 'azada', 'hacha'] as const) {
      e = aplicarComando(e, { tipo: 'ElegirHerramienta', herramienta }).estado
    }
    expect(e.obstaculos[0]).toMatchObject({ tipo: 'arbol', golpes: 1 })
    const { estado } = repetir(e, golpesA - 1, 51, 50, 'hacha')
    expect(estado.obstaculos).toEqual([])
  })
  it('cada golpe gasta el coste de la herramienta', () => {
    const { estado } = repetir(con(arbol), 1, 51, 50, 'hacha')
    expect(estado.energia).toBe(100 - costeEnergia('hacha'))
  })
  it('un golpe al aire (sin árbol) se acepta, gasta energía y no cambia el mundo', () => {
    const e = con(roca)
    for (const [x, y] of [
      [51, 50],
      [49, 50],
    ] as const) {
      const r = usar(e, x, y, 'hacha')
      expect(r.ok).toBe(true)
      expect(r.estado.energia).toBe(e.energia - costeEnergia('hacha'))
      expect(r.estado.obstaculos).toBe(e.obstaculos)
      expect(r.estado.materiales).toBe(e.materiales)
      expect(r.ok && r.eventos.map((v) => v.tipo)).toEqual(['herramienta-usada'])
    }
  })
  it('un árbol, roca o plantón de una parcela ajena se rechaza con no-propia, sin gastar energía', () => {
    const ajena: EstadoJuego = {
      ...con(arbol, roca, { tipo: 'planton', x: 50, y: 49, variante: 0, diaPlantado: 1 }),
      valle: {
        ...limpio.valle,
        parcelas: limpio.valle.parcelas.map((p) => ({ ...p, estado: 'en-venta' as const })),
      },
    }
    for (const [x, y, h] of [
      [51, 50, 'hacha'],
      [50, 49, 'hacha'],
      [49, 50, 'pico'],
    ] as const) {
      const r = usar(ajena, x, y, h)
      expect(r).toMatchObject({ ok: false, error: 'no-propia' })
      expect(r.estado).toEqual({ ...ajena, herramienta: h })
    }
    // Primero la parcela, luego la energía.
    expect(usar({ ...ajena, energia: 0 }, 51, 50, 'hacha')).toMatchObject({ error: 'no-propia' })
  })
  it('el golpe al aire en parcela ajena se acepta; plantar en ella lo ignora el efecto', () => {
    const ajena: EstadoJuego = {
      ...limpio,
      inventario: [{ objeto: 'planton', cantidad: 1 }],
      valle: {
        ...limpio.valle,
        parcelas: limpio.valle.parcelas.map((p) => ({ ...p, estado: 'en-venta' as const })),
      },
    }
    expect(usar(ajena, 51, 50, 'hacha')).toMatchObject({ ok: true })
    const m = usar(ajena, 51, 50, 'mano')
    expect(m).toMatchObject({ ok: true })
    expect(m.estado.obstaculos).toEqual([])
    expect(m.estado.inventario).toEqual(ajena.inventario)
  })
  it('sin energía no tala', () => {
    const e = { ...con(arbol), energia: costeEnergia('hacha') - 1 }
    expect(usar(e, 51, 50)).toMatchObject({ ok: false, error: 'sin-energia' })
  })
  it('fuera de alcance se rechaza', () => {
    const e = con({ ...arbol, x: 53 })
    expect(usar(e, 53, 50)).toMatchObject({ ok: false, error: 'fuera-de-alcance' })
  })
  it('con la mochila llena se tala igual y el plantón se pierde', () => {
    const { estado } = repetir(
      { ...con(arbol), inventario: llena(), rng: rngQue(true) },
      golpesA,
      51,
      50,
      'hacha',
    )
    expect(estado.obstaculos).toEqual([])
    expect(estado.materiales.madera).toBe(CONFIG_RECURSOS.arbol.madera[terreno])
    expect(cantidadDe(estado.inventario, 'planton')).toBe(0)
  })
  it('con la mochila llena avisa de que el plantón se perdió', () => {
    const e: EstadoJuego = {
      ...con({ ...arbol, golpes: golpesA - 1 }),
      inventario: llena(),
      rng: rngQue(true),
    }
    const r = usar(e, 51, 50, 'hacha')
    expect(r.ok && r.eventos.map((v) => v.tipo)).toContain('planton-perdido')
    // Si el sorteo no da plantón no hay nada que perder.
    const s = usar({ ...e, rng: rngQue(false) }, 51, 50, 'hacha')
    expect(s.ok && s.eventos.map((v) => v.tipo)).not.toContain('planton-perdido')
  })
  it('no muta el estado de entrada', () => {
    const e = con(arbol)
    const copia = structuredClone(e)
    usar(e, 51, 50)
    expect(e).toEqual(copia)
  })
  it('arranca un plantón de un golpe sin botín', () => {
    const p: Obstaculo = { tipo: 'planton', x: 51, y: 50, variante: 0, diaPlantado: 1 }
    const r = usar(con(p), 51, 50)
    expect(r.ok).toBe(true)
    expect(r.estado.obstaculos).toEqual([])
    expect(r.estado.materiales).toEqual(limpio.materiales)
    expect(cantidadDe(r.estado.inventario, 'planton')).toBe(0)
  })
})

describe('pico', () => {
  it('picar una roca da piedra tras los golpes del terreno', () => {
    const { estado } = repetir(con(roca), golpesR, 49, 50, 'pico')
    expect(estado.obstaculos).toEqual([])
    expect(estado.materiales.piedra).toBe(CONFIG_RECURSOS.roca.piedra[terrenoR])
    expect(estado.materiales.madera).toBe(0)
    expect(estado.inventario).toEqual([])
  })
  it('un golpe parcial deja la roca con un golpe contado', () => {
    expect(golpesR).toBeGreaterThanOrEqual(2)
    const r = usar(con(roca), 49, 50, 'pico')
    expect(r.estado.obstaculos[0]).toMatchObject({ tipo: 'roca', golpes: 1 })
  })
  it('sobre un árbol no hace nada (solo gasta energía)', () => {
    const e = con(arbol)
    const r = usar(e, 51, 50, 'pico')
    expect(r.ok).toBe(true)
    expect(r.estado.obstaculos).toBe(e.obstaculos)
    expect(r.estado.energia).toBe(e.energia - costeEnergia('pico'))
  })
  it('un botín que desbordaría los materiales es un estado inválido y no cambia nada', () => {
    const e: EstadoJuego = {
      ...con({ ...roca, golpes: golpesR - 1 }),
      materiales: { madera: 0, piedra: Number.MAX_SAFE_INTEGER },
    }
    const r = usar(e, 49, 50, 'pico')
    expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
    expect(r.estado).toEqual({ ...e, herramienta: 'pico' })
  })
})

describe('replantar con la mano', () => {
  const conPlanton = (e: EstadoJuego): EstadoJuego => ({
    ...e,
    inventario: [{ objeto: 'planton', cantidad: 2 }],
  })
  it('planta un plantón en una casilla libre y lo gasta', () => {
    const e = conPlanton(limpio)
    const r = usar(e, 51, 50, 'mano')
    expect(r.ok).toBe(true)
    expect(r.estado.obstaculos).toHaveLength(1)
    expect(r.estado.obstaculos[0]).toMatchObject({
      tipo: 'planton',
      x: 51,
      y: 50,
      diaPlantado: e.dia,
    })
    expect(cantidadDe(r.estado.inventario, 'planton')).toBe(1)
    expect(r.ok && r.eventos.map((v) => v.tipo)).toContain('planton-plantado')
    expect(r.estado.energia).toBe(e.energia)
  })
  it('no planta sin plantones', () => {
    expect(usar(limpio, 51, 50, 'mano').estado.obstaculos).toEqual([])
  })
  it('no planta sobre un obstáculo, bajo el personaje ni en parcela ajena', () => {
    const e = conPlanton(con(arbol))
    expect(usar(e, 51, 50, 'mano').estado.obstaculos).toHaveLength(1)
    const e2 = conPlanton(limpio)
    expect(puedePlantarPlanton(e2, 50, 50)).toBe(false)
    const ajena: EstadoJuego = {
      ...e2,
      valle: {
        ...e2.valle,
        parcelas: e2.valle.parcelas.map((p) => ({ ...p, estado: 'en-venta' as const })),
      },
    }
    expect(puedePlantarPlanton(ajena, 51, 50)).toBe(false)
  })
  it('no planta en zona de cultivo ni de huerto, ni en la aparición', () => {
    const e = conPlanton(limpio)
    const idx = 50 * ladoValle(e.valle) + 51
    const con1 = (c: string) => ({
      ...e,
      zonas: e.zonas.slice(0, idx) + c + e.zonas.slice(idx + 1),
    })
    expect(puedePlantarPlanton(con1('c'), 51, 50)).toBe(false)
    expect(puedePlantarPlanton(con1('h'), 51, 50)).toBe(false)
    expect(puedePlantarPlanton(con1('a'), 51, 50)).toBe(true)
    expect(puedePlantarPlanton({ ...e, aparicion: { x: 51.5, y: 50.5 } }, 51, 50)).toBe(false)
  })
  it('el chain de la mano no hace nada si no se puede plantar', () => {
    const e = conPlanton(con(arbol))
    const r = usar(e, 51, 50, 'mano')
    expect(r.estado.obstaculos).toBe(e.obstaculos)
    expect(r.estado.inventario).toBe(e.inventario)
  })
  it('el plantón no bloquea el paso hasta que crece', () => {
    const p = usar(conPlanton(limpio), 51, 50, 'mano').estado
    expect(casillaBloqueada(mapaTransitabilidad(p), 51, 50)).toBe(false)
    const dias = CONFIG_RECURSOS.planton.diasCrecimiento
    const g = crecerPlantones({ ...p, dia: p.dia + dias, personaje: { ...p.personaje, x: 40.5 } })
    expect(g.obstaculos[0]?.tipo).toBe('arbol')
    expect(casillaBloqueada(mapaTransitabilidad(g), 51, 50)).toBe(true)
  })
  it('si la casilla está ocupada el crecimiento espera', () => {
    const p = usar(conPlanton(limpio), 51, 50, 'mano').estado
    const dias = CONFIG_RECURSOS.planton.diasCrecimiento
    const encima = { ...p, dia: p.dia + dias, personaje: { ...p.personaje, x: 51.5, y: 50.5 } }
    expect(crecerPlantones(encima).obstaculos[0]?.tipo).toBe('planton')
    const libre = { ...encima, personaje: { ...encima.personaje, x: 40.5 } }
    expect(crecerPlantones(libre).obstaculos[0]?.tipo).toBe('arbol')
  })
  it('no planta donde cerraría el paso', () => {
    // Una fila de árboles con un solo hueco: taparlo aislaría la zona del otro lado.
    const lado = ladoValle(limpio.valle)
    const muro: Obstaculo[] = []
    for (let x = 0; x < lado; x++) {
      if (x !== 5) muro.push({ tipo: 'arbol', x, y: 3, variante: 0 })
    }
    const e = conPlanton({
      ...limpio,
      obstaculos: muro,
      aparicion: { x: 1.5, y: 1.5 },
      personaje: { x: 1.5, y: 1.5, orientacion: 'sur' },
    })
    expect(puedePlantarPlanton(e, 5, 3)).toBe(false)
  })
  it('el plantón se convierte en árbol a los días de crecimiento', () => {
    const p = usar(conPlanton(limpio), 51, 50, 'mano').estado
    const dias = CONFIG_RECURSOS.planton.diasCrecimiento
    expect(crecerPlantones({ ...p, dia: p.dia + dias - 1 }).obstaculos[0]?.tipo).toBe('planton')
    expect(
      crecerPlantones({ ...p, dia: p.dia + dias, personaje: { ...p.personaje, x: 40.5 } })
        .obstaculos[0],
    ).toMatchObject({ tipo: 'arbol', x: 51, y: 50 })
    expect(crecerPlantones(limpio)).toBe(limpio)
  })
  it('crece con los cambios de día (desmayo)', () => {
    let e = usar(conPlanton(limpio), 51, 50, 'mano').estado
    for (let i = 0; i < CONFIG_RECURSOS.planton.diasCrecimiento; i++) {
      const r = aplicarComando({ ...e, minutoDelDia: 1560 }, { tipo: 'AvanzarTiempo', minutos: 1 })
      expect(r.ok).toBe(true)
      e = r.estado
    }
    expect(e.obstaculos[0]?.tipo).toBe('arbol')
  })
  it('ciclo completo: talar, replantar y que vuelva a ser árbol', () => {
    const a = repetir(con(arbol), golpesA, 51, 50, 'hacha').estado
    const b = usar(
      { ...a, inventario: [{ objeto: 'planton', cantidad: 1 }] },
      51,
      50,
      'mano',
    ).estado
    expect(b.obstaculos[0]?.tipo).toBe('planton')
    const c = { ...b, dia: b.dia + CONFIG_RECURSOS.planton.diasCrecimiento }
    expect(
      crecerPlantones({ ...c, personaje: { ...c.personaje, x: 40.5 } }).obstaculos[0]?.tipo,
    ).toBe('arbol')
  })
})
