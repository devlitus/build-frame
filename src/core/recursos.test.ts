import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  CONFIG_RECURSOS,
  crearEstadoInicial,
  crecerPlantones,
  golpesNecesarios,
  puedePlantarPlanton,
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
})

describe('hacha', () => {
  it('un golpe que no basta gasta energía, cuenta el golpe y no da botín', () => {
    expect(golpesA).toBeGreaterThanOrEqual(2)
    const e = con(arbol)
    const r = usar(e, 51, 50)
    expect(r.ok).toBe(true)
    expect(r.estado.energia).toBe(e.energia - 4)
    expect(r.estado.obstaculos[0]).toMatchObject({ tipo: 'arbol', golpes: 1 })
    expect(r.estado.materiales).toEqual(e.materiales)
    expect(r.ok && r.eventos.map((v) => v.tipo)).toEqual([
      'herramienta-usada',
      'obstaculo-golpeado',
    ])
  })
  it('talar un árbol lo quita, da madera y un plantón', () => {
    const { estado, eventos } = repetir(con(arbol), golpesA, 51, 50, 'hacha')
    expect(estado.obstaculos).toEqual([])
    expect(estado.materiales.madera).toBe(CONFIG_RECURSOS.arbol.madera[terreno])
    expect(estado.materiales.piedra).toBe(0)
    expect(cantidadDe(estado.inventario, 'planton')).toBe(CONFIG_RECURSOS.arbol.plantones)
    expect(eventos.filter((t) => t === 'obstaculo-quitado')).toHaveLength(1)
  })
  it('cada golpe gasta el coste de la herramienta', () => {
    const { estado } = repetir(con(arbol), 1, 51, 50, 'hacha')
    expect(estado.energia).toBe(100 - 4)
  })
  it('un golpe al aire (sin árbol) se acepta, gasta energía y no cambia el mundo', () => {
    const e = con(roca)
    for (const [x, y] of [
      [51, 50],
      [49, 50],
    ] as const) {
      const r = usar(e, x, y, 'hacha')
      expect(r.ok).toBe(true)
      expect(r.estado.energia).toBe(e.energia - 4)
      expect(r.estado.obstaculos).toBe(e.obstaculos)
      expect(r.estado.materiales).toBe(e.materiales)
      expect(r.ok && r.eventos.map((v) => v.tipo)).toEqual(['herramienta-usada'])
    }
  })
  it('sin energía no tala', () => {
    const e = { ...con(arbol), energia: 3 }
    expect(usar(e, 51, 50)).toMatchObject({ ok: false, error: 'sin-energia' })
  })
  it('fuera de alcance se rechaza', () => {
    const e = con({ ...arbol, x: 53 })
    expect(usar(e, 53, 50)).toMatchObject({ ok: false, error: 'fuera-de-alcance' })
  })
  it('con la mochila llena se tala igual y el plantón se pierde', () => {
    const lleno = Array.from({ length: capacidadInventario([]) }, () => ({
      objeto: 'patata' as const,
      cantidad: 99,
    }))
    const { estado } = repetir({ ...con(arbol), inventario: lleno }, golpesA, 51, 50, 'hacha')
    expect(estado.obstaculos).toEqual([])
    expect(estado.materiales.madera).toBe(CONFIG_RECURSOS.arbol.madera[terreno])
    expect(cantidadDe(estado.inventario, 'planton')).toBe(0)
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
    expect(r.estado.energia).toBe(e.energia - 4)
  })
  it('el botín desbordado se rechaza sin cambiar nada', () => {
    const e: EstadoJuego = {
      ...con({ ...roca, golpes: golpesR - 1 }),
      materiales: { madera: 0, piedra: Number.MAX_SAFE_INTEGER },
    }
    expect(usar(e, 49, 50, 'pico')).toMatchObject({ ok: false, error: 'limite-de-recursos' })
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
  it('el plantón se convierte en árbol a los días de crecimiento', () => {
    const p = usar(conPlanton(limpio), 51, 50, 'mano').estado
    const dias = CONFIG_RECURSOS.planton.diasCrecimiento
    expect(crecerPlantones({ ...p, dia: p.dia + dias - 1 }).obstaculos[0]?.tipo).toBe('planton')
    expect(crecerPlantones({ ...p, dia: p.dia + dias }).obstaculos[0]).toMatchObject({
      tipo: 'arbol',
      x: 51,
      y: 50,
    })
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
    const b = usar(a, 51, 50, 'mano').estado
    expect(b.obstaculos[0]?.tipo).toBe('planton')
    const c = { ...b, dia: b.dia + CONFIG_RECURSOS.planton.diasCrecimiento }
    expect(crecerPlantones(c).obstaculos[0]?.tipo).toBe('arbol')
  })
})
