/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conocidos en tests */
/**
 * E2E-16 · Rompedor. Whole-game simulation of M5 on the core: N days of random play mixing every
 * M2–M5 command — walk (A* + `SeguidorCamino`, as a tap does), time, faints, sleep, modes, pause,
 * buy parcels, paint zones, build, pick tools and seeds, and use them (till, sow, water, harvest,
 * chop, mine, replant). Replaces the game-logic part of the e2e walk-throughs (humo «pintar una
 * zona y construir…», cosechar.spec, energia(-rompedor).spec, inventario(-rompedor).spec,
 * m4-global «partida completa por la interfaz») with checks after every command:
 * - money and materials are safe integers ≥ 0; money only goes down by the parcel price or the
 *   building cost; materials change exactly by the loot events and the building cost;
 * - energy is an integer in [0, max]; an accepted tool use costs exactly its energy; a faint
 *   leaves `ENERGIA_TRAS_DESMAYO`, sleeping leaves the maximum; both go to the next day at 06:00;
 * - the inventory is valid, changes exactly by the events (harvest, sowing, saplings) and never
 *   opens a slot beyond its capacity;
 * - the soil is valid; a rejected command returns the same object; JSON round trip; determinism.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  colocacionValida,
  CONFIG_ENERGIA,
  capacidadInventario,
  costeEnergia,
  crearEstadoInicial,
  cultivoDeSemilla,
  defEdificio,
  ENERGIA_MAXIMA,
  ENERGIA_TRAS_DESMAYO,
  HERRAMIENTAS,
  inventarioValido,
  semillaDe,
  tierraValida,
  type Comando,
  type EstadoJuego,
  type EventoJuego,
  type ObjetoId,
  type TipoEdificio,
  type Zona,
} from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const ZONAS_: readonly Zona[] = ['cultivo', 'huerto', 'vivienda', 'almacen']

type Accion =
  | { k: 'tiempo'; minutos: number }
  | { k: 'desmayo' }
  | { k: 'dormir' }
  | { k: 'andar'; dx: number; dy: number; ms: number }
  | { k: 'modo'; plano: boolean }
  | { k: 'pausa'; si: boolean }
  | { k: 'comprar'; f: number }
  | { k: 'pintar'; f: number; ox: number; oy: number; w: number; h: number; zona: number }
  | { k: 'construir'; tipo: number; f: number; ox: number; oy: number }
  | { k: 'ir'; f: number; ox: number; oy: number }
  | { k: 'irObstaculo'; roca: boolean; f: number }
  | { k: 'talar'; roca: boolean; f: number }
  | { k: 'herramienta'; h: number }
  | { k: 'semilla'; f: number }
  | { k: 'usar'; dx: number; dy: number }
  | { k: 'usar9'; veces: number }
  | { k: 'cmd'; c: Comando }

const u = fc.double({ min: 0, max: 0.999999, noNaN: true })
const accionArb: fc.Arbitrary<Accion> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('tiempo' as const),
      minutos: fc.integer({ min: 0, max: 600 }),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ k: 'desmayo' as const }) },
  { weight: 2, arbitrary: fc.constant({ k: 'dormir' as const }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('andar' as const),
      dx: fc.constantFrom(-1, 0, 1),
      dy: fc.constantFrom(-1, 0, 1),
      ms: fc.integer({ min: 0, max: 250 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('modo' as const), plano: fc.boolean() }) },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant('pausa' as const),
      si: fc.constantFrom(true, false, false),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('comprar' as const), f: u }) },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('pintar' as const),
      f: u,
      ox: u,
      oy: u,
      w: fc.integer({ min: 0, max: 8 }),
      h: fc.integer({ min: 0, max: 8 }),
      zona: fc.integer({ min: 0, max: 3 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('construir' as const),
      tipo: fc.integer({ min: 0, max: 2 }),
      f: u,
      ox: u,
      oy: u,
    }),
  },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('ir' as const), f: u, ox: u, oy: u }) },
  {
    weight: 2,
    arbitrary: fc.record({ k: fc.constant('irObstaculo' as const), roca: fc.boolean(), f: u }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ k: fc.constant('talar' as const), roca: fc.boolean(), f: u }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('herramienta' as const),
      h: fc.integer({ min: 0, max: HERRAMIENTAS.length - 1 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('semilla' as const), f: u }) },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('usar' as const),
      dx: fc.integer({ min: -2, max: 2 }),
      dy: fc.integer({ min: -2, max: 2 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      k: fc.constant('usar9' as const),
      veces: fc.integer({ min: 1, max: 5 }),
    }),
  },
)

function propias(e: EstadoJuego): number[] {
  const l: number[] = []
  e.valle.parcelas.forEach((p, i) => p.estado === 'propia' && l.push(i))
  return l
}

function casillaEnPropia(e: EstadoJuego, f: number, ox: number, oy: number) {
  const p = propias(e)
  const c = e.valle.casillasPorParcela
  const n = e.valle.parcelasPorLado
  const i = p.length > 0 ? p[Math.floor(f * p.length)]! : Math.floor(f * n * n)
  return { x: (i % n) * c + Math.floor(ox * c), y: Math.floor(i / n) * c + Math.floor(oy * c) }
}

function esPropia(e: EstadoJuego, x: number, y: number): boolean {
  const c = e.valle.casillasPorParcela
  const n = e.valle.parcelasPorLado
  return e.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]?.estado === 'propia'
}

/** Commands of one abstract action, resolved against the state at that moment (walks are lazy). */
function* resolver(e: () => EstadoJuego, a: Accion): Generator<Comando> {
  switch (a.k) {
    case 'tiempo':
      yield { tipo: 'AvanzarTiempo', minutos: a.minutos }
      return
    case 'desmayo':
      yield { tipo: 'AvanzarTiempo', minutos: 1500 }
      return
    case 'dormir':
      yield { tipo: 'Dormir' }
      return
    case 'andar':
      yield { tipo: 'MoverPersonaje', dx: a.dx, dy: a.dy, ms: a.ms }
      return
    case 'modo':
      yield { tipo: 'CambiarModo', modo: a.plano ? 'plano' : 'vida' }
      return
    case 'pausa':
      yield a.si ? { tipo: 'Pausar' } : { tipo: 'Reanudar' }
      return
    case 'comprar':
      yield { tipo: 'ComprarParcela', indice: Math.floor(a.f * e().valle.parcelas.length) }
      return
    case 'pintar': {
      const p = casillaEnPropia(e(), a.f, a.ox, a.oy)
      yield {
        tipo: 'PintarZona',
        x0: p.x,
        y0: p.y,
        x1: p.x + a.w,
        y1: p.y + a.h,
        zona: ZONAS_[a.zona]!,
      }
      return
    }
    case 'construir': {
      const p = casillaEnPropia(e(), a.f, a.ox, a.oy)
      yield { tipo: 'Construir', tipoEdificio: TIPOS[a.tipo]!, x: p.x, y: p.y }
      return
    }
    case 'ir':
    case 'irObstaculo':
    case 'talar': {
      let meta: { x: number; y: number } | undefined
      let objetivo: { x: number; y: number } | undefined
      if (a.k === 'ir') meta = casillaEnPropia(e(), a.f, a.ox, a.oy)
      else {
        const lista = e().obstaculos.filter(
          (o) => (a.roca ? o.tipo === 'roca' : o.tipo !== 'roca') && esPropia(e(), o.x, o.y),
        )
        const o = lista[Math.floor(a.f * lista.length)]
        // Aim at the obstacle itself: A* stops on the nearest free tile next to it.
        if (o) meta = objetivo = { x: o.x, y: o.y }
      }
      if (!meta) return
      if (a.k === 'talar')
        yield { tipo: 'ElegirHerramienta', herramienta: a.roca ? 'pico' : 'hacha' }
      const seg = new SeguidorCamino()
      seg.fijar(e(), e().personaje, { x: meta.x + 0.5, y: meta.y + 0.5 })
      for (let i = 0; i < 400 && seg.destino; i++) {
        const c = seg.siguiente(e().personaje, 50)
        if (c) yield c
      }
      if (a.k === 'talar' && objetivo)
        for (let g = 0; g < 6; g++) yield { tipo: 'UsarHerramienta', x: objetivo.x, y: objetivo.y }
      return
    }
    case 'herramienta':
      yield { tipo: 'ElegirHerramienta', herramienta: HERRAMIENTAS[a.h]! }
      return
    case 'semilla': {
      const semillas = e().inventario.filter((r) => cultivoDeSemilla(r.objeto) !== undefined)
      const r = semillas[Math.floor(a.f * (semillas.length + 1))]
      yield { tipo: 'ElegirSemilla', objeto: r ? r.objeto : null }
      return
    }
    case 'usar': {
      const p = e().personaje
      yield { tipo: 'UsarHerramienta', x: Math.floor(p.x) + a.dx, y: Math.floor(p.y) + a.dy }
      return
    }
    case 'cmd':
      yield a.c
      return
    case 'usar9': {
      for (let v = 0; v < a.veces; v++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const p = e().personaje
            yield { tipo: 'UsarHerramienta', x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy }
          }
      return
    }
  }
}

const cuenta = (e: EstadoJuego, o: ObjetoId) =>
  e.inventario.filter((r) => r.objeto === o).reduce((s, r) => s + r.cantidad, 0)
const OBJETOS_VISTOS = (a: EstadoJuego, b: EstadoJuego) =>
  new Set<ObjetoId>([...a.inventario, ...b.inventario].map((r) => r.objeto))

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function comprobarEstado(e: EstadoJuego, ctx: string): void {
  ok(Number.isSafeInteger(e.dinero) && e.dinero >= 0, `${ctx}: money ${e.dinero}`)
  for (const m of ['madera', 'piedra'] as const)
    ok(Number.isSafeInteger(e.materiales[m]) && e.materiales[m] >= 0, `${ctx}: ${m}`)
  ok(
    Number.isInteger(e.energia) && e.energia >= 0 && e.energia <= ENERGIA_MAXIMA,
    `${ctx}: energy ${e.energia}`,
  )
  ok(inventarioValido(e.inventario), `${ctx}: invalid inventory`)
  ok(tierraValida(e), `${ctx}: invalid soil`)
  ok(e.minutoDelDia >= 360 && e.minutoDelDia <= 1560, `${ctx}: clock ${e.minutoDelDia}`)
}

/** Checks one accepted command against its events (exact bookkeeping). */
function comprobarPaso(
  antes: EstadoJuego,
  c: Comando,
  eventos: readonly EventoJuego[],
  e: EstadoJuego,
  ctx: string,
) {
  // Money: only parcels and buildings cost money (no selling or refunds in these actions).
  let gasto = 0
  let maderaPagada = 0
  let piedraPagada = 0
  for (const ev of eventos) {
    if (ev.tipo === 'parcela-comprada') gasto += ev.precio
    if (ev.tipo === 'obra-iniciada') {
      const coste = defEdificio(ev.tipoEdificio)!.coste
      gasto += coste.dinero
      maderaPagada += coste.madera
      piedraPagada += coste.piedra
    }
  }
  ok(
    e.dinero === antes.dinero - gasto,
    `${ctx}: money ${antes.dinero} -> ${e.dinero}, expected −${gasto}`,
  )
  // Materials: loot in, building cost out.
  let madera = 0
  let piedra = 0
  for (const ev of eventos)
    if (ev.tipo === 'obstaculo-quitado') {
      madera += ev.madera
      piedra += ev.piedra
    }
  ok(e.materiales.madera === antes.materiales.madera + madera - maderaPagada, `${ctx}: wood`)
  ok(e.materiales.piedra === antes.materiales.piedra + piedra - piedraPagada, `${ctx}: stone`)
  // Inventory: exactly what the events say.
  const esperado = new Map<ObjetoId, number>()
  const sumar = (o: ObjetoId, n: number) => esperado.set(o, (esperado.get(o) ?? 0) + n)
  for (const ev of eventos) {
    if (ev.tipo === 'planta-cosechada') sumar(ev.producto, ev.cantidad)
    if (ev.tipo === 'planta-sembrada') sumar(semillaDe(ev.cultivo), -1)
    if (ev.tipo === 'obstaculo-quitado' && ev.plantones > 0) sumar('planton', ev.plantones)
    if (ev.tipo === 'planton-plantado') sumar('planton', -1)
  }
  for (const o of OBJETOS_VISTOS(antes, e))
    ok(
      cuenta(e, o) - cuenta(antes, o) === (esperado.get(o) ?? 0),
      `${ctx}: inventory ${o} ${cuenta(antes, o)} -> ${cuenta(e, o)}`,
    )
  // Never opens a slot beyond the capacity (it may stay above it after demolishing a shed).
  const cap = capacidadInventario(e.edificios)
  if (e.inventario.length > antes.inventario.length)
    ok(e.inventario.length <= cap, `${ctx}: ${e.inventario.length} slots > capacity ${cap}`)
  // Energy and days.
  const desmayo = eventos.some((v) => v.tipo === 'desmayo')
  const dormido = eventos.some((v) => v.tipo === 'dormido')
  if (desmayo || dormido) {
    ok(e.dia === antes.dia + 1 && e.minutoDelDia === 360, `${ctx}: new day`)
    ok(
      e.energia === (dormido ? ENERGIA_MAXIMA : ENERGIA_TRAS_DESMAYO),
      `${ctx}: energy after the night ${e.energia}`,
    )
  } else if (c.tipo === 'UsarHerramienta') {
    ok(
      e.energia === antes.energia - costeEnergia(antes.herramienta),
      `${ctx}: energy ${antes.energia} -> ${e.energia}`,
    )
  } else ok(e.energia === antes.energia, `${ctx}: energy changed`)
}

interface Contador {
  [k: string]: number
}

/** Plays `acciones` from `e0`, checking every command. */
function jugar(e0: EstadoJuego, acciones: readonly Accion[], contador?: Contador): EstadoJuego {
  let e = e0
  comprobarEstado(e, 'start')
  let paso = 0
  for (const a of acciones) {
    for (const c of resolver(() => e, a)) {
      const antes = e
      const r = aplicarComando(antes, c)
      const ctx = `step ${paso++} ${JSON.stringify(c)} -> ${r.ok ? 'ok' : r.error}`
      if (contador) {
        const clave =
          c.tipo === 'UsarHerramienta'
            ? `Usar:${antes.herramienta}:${r.ok ? 'ok' : r.error}`
            : `${c.tipo}:${r.ok ? 'ok' : r.error}`
        contador[clave] = (contador[clave] ?? 0) + 1
        if (r.ok)
          for (const ev of r.eventos)
            contador[`ev:${ev.tipo}`] = (contador[`ev:${ev.tipo}`] ?? 0) + 1
      }
      if (!r.ok) {
        ok(r.estado === antes, `${ctx}: a rejection must return the same object`)
        continue
      }
      e = r.estado
      comprobarEstado(e, ctx)
      comprobarPaso(antes, c, r.eventos, e, ctx)
    }
  }
  expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  return e
}

/**
 * Opening of most games: buy the spawn parcel, paint crops north of the spawn, a house plot and a
 * store, put a shipping box in the store (first valid tile) and go back to Life.
 */
function apertura(inicio: EstadoJuego): Accion[] {
  const c = inicio.valle.casillasPorParcela
  const n = inicio.valle.parcelasPorLado
  const i = Math.floor(inicio.aparicion.y / c) * n + Math.floor(inicio.aparicion.x / c)
  const ax = Math.floor(inicio.aparicion.x)
  const ay = Math.floor(inicio.aparicion.y)
  const x0 = (i % n) * c
  const y0 = Math.floor(i / n) * c
  const cmds: Comando[] = [
    { tipo: 'CambiarModo', modo: 'plano' },
    { tipo: 'ComprarParcela', indice: i },
    { tipo: 'PintarZona', x0: ax - 4, y0: ay - 6, x1: ax + 4, y1: ay - 1, zona: 'cultivo' },
    { tipo: 'PintarZona', x0, y0, x1: x0 + 5, y1: y0 + 4, zona: 'vivienda' },
    { tipo: 'PintarZona', x0: x0 + c - 6, y0, x1: x0 + c - 1, y1: y0 + 4, zona: 'almacen' },
  ]
  let e = inicio
  for (const cmd of cmds) e = aplicarComando(e, cmd).estado
  let caja: Comando | undefined
  for (let y = y0; y <= y0 + 4 && !caja; y++)
    for (let x = x0 + c - 6; x < x0 + c && !caja; x++)
      if (colocacionValida(e, 'caja-envio', x, y).valida)
        caja = { tipo: 'Construir', tipoEdificio: 'caja-envio', x, y }
  const vida: Comando = { tipo: 'CambiarModo', modo: 'vida' }
  return [...cmds, ...(caja ? [caja] : []), vida].map((cmd): Accion => ({
    k: 'cmd' as const,
    c: cmd,
  }))
}

function jugarConCultivo(semilla: number, acciones: readonly Accion[], contador?: Contador) {
  const inicio = crearEstadoInicial({ semilla })
  return jugar(inicio, [...apertura(inicio), ...acciones], contador)
}

/** A farming routine biased towards the crop cycle: till, sow, water and sleep, then harvest. */
const rutinaArb: fc.Arbitrary<Accion[]> = fc
  .record({ semilla: u, dias: fc.integer({ min: 3, max: 10 }) })
  .map(({ semilla, dias }) => {
    const l: Accion[] = [
      { k: 'herramienta', h: HERRAMIENTAS.indexOf('azada') },
      { k: 'usar9', veces: 1 },
      { k: 'herramienta', h: HERRAMIENTAS.indexOf('semillas') },
      { k: 'semilla', f: semilla },
      { k: 'usar9', veces: 1 },
    ]
    for (let d = 0; d < dias; d++)
      l.push(
        { k: 'herramienta', h: HERRAMIENTAS.indexOf('regadera') },
        { k: 'usar9', veces: 1 },
        { k: 'dormir' },
      )
    l.push({ k: 'herramienta', h: HERRAMIENTAS.indexOf('mano') }, { k: 'usar9', veces: 1 })
    return l
  })

const partidaArb = fc
  .array(
    fc.oneof(
      { weight: 6, arbitrary: accionArb.map((a) => [a]) },
      { weight: 1, arbitrary: rutinaArb },
    ),
    {
      minLength: 40,
      maxLength: 120,
    },
  )
  .map((l) => l.flat())

describe('M5 simulation: whole games on the core', () => {
  it('invariants after every command (money, materials, energy, inventory, soil, days)', () => {
    const contador: Contador = {}
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), partidaArb, (semilla, acciones) => {
        jugarConCultivo(semilla, acciones, contador)
      }),
      { numRuns: 60 },
    )
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), partidaArb, (semilla, acciones) => {
        // Without the opening: no parcel, no zones; the game must stay sound anyway.
        jugar(crearEstadoInicial({ semilla }), acciones, contador)
      }),
      { numRuns: 20 },
    )
    if (process.env.COBERTURA) console.log(JSON.stringify(contador, null, 1))
    // The generators really play: every tool is accepted, crops are harvested, trees fall, rocks
    // break, the player sleeps and faints, parcels are bought and something is built.
    for (const clave of [
      'Usar:azada:ok',
      'Usar:semillas:ok',
      'Usar:regadera:ok',
      'Usar:mano:ok',
      'Usar:hacha:ok',
      'Usar:pico:ok',
      'ev:planta-cosechada',
      'ev:obstaculo-quitado',
      'ev:dormido',
      'ev:desmayo',
      'ComprarParcela:ok',
      'Construir:ok',
      'Usar:azada:sin-energia',
    ])
      expect(
        contador[clave] ?? 0,
        `coverage ${clave}: ${JSON.stringify(contador)}`,
      ).toBeGreaterThan(0)
  }, 240_000)

  it('energy: a long day of chopping runs out, tools that cost energy are refused, walking still works', () => {
    // Original e2e: energia.spec.ts «sin energía: el botón de acción avisa «Estás agotado» y moverse
    // sigue valiendo»; energia-rompedor «Z y E a la vez: sin energía, E avisa agotado y Z después
    // sigue durmiendo».
    let e = crearEstadoInicial({ semilla: 42 })
    e = aplicarComando(e, { tipo: 'ElegirHerramienta', herramienta: 'hacha' }).estado
    const p = e.personaje
    let usos = 0
    for (let i = 0; i < 100; i++) {
      const r = aplicarComando(e, {
        tipo: 'UsarHerramienta',
        x: Math.floor(p.x),
        y: Math.floor(p.y) - 1,
      })
      if (!r.ok) {
        expect(r.error).toBe('sin-energia')
        break
      }
      usos++
      e = r.estado
    }
    expect(usos).toBe(Math.floor(ENERGIA_MAXIMA / CONFIG_ENERGIA.costes.hacha))
    expect(e.energia).toBeLessThan(CONFIG_ENERGIA.costes.hacha)
    const andar = aplicarComando(e, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 })
    expect(andar.ok).toBe(true)
    const mano = aplicarComando(
      aplicarComando(e, { tipo: 'ElegirHerramienta', herramienta: 'mano' }).estado,
      { tipo: 'UsarHerramienta', x: Math.floor(p.x), y: Math.floor(p.y) - 1 },
    )
    expect(mano.ok).toBe(true)
    const dormir = aplicarComando(e, { tipo: 'Dormir' })
    expect(dormir.ok).toBe(true)
    expect(dormir.estado.energia).toBe(ENERGIA_MAXIMA)
  })

  it('determinism: the same seed and actions give the same final state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), partidaArb, (semilla, acciones) => {
        const a = jugarConCultivo(semilla, acciones)
        const b = jugarConCultivo(semilla, acciones)
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }),
      { numRuns: 10 },
    )
  }, 120_000)
})

describe('sleeping keeps the player choices', () => {
  it('sleeping while paused keeps the pause, and at x3 keeps the speed; the clock waits at 06:00', () => {
    // Original e2e: energia-rompedor.spec.ts «dormir en pausa conserva la pausa; a velocidad x3
    // conserva la velocidad».
    let e = crearEstadoInicial({ semilla: 42 })
    e = aplicarComando(e, { tipo: 'CambiarVelocidad', velocidad: 3 }).estado
    e = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 300 }).estado
    e = aplicarComando(e, { tipo: 'Pausar' }).estado
    const r = aplicarComando(e, { tipo: 'Dormir' })
    expect(r.ok).toBe(true)
    expect(r.estado).toMatchObject({
      pausado: true,
      velocidad: 3,
      minutoDelDia: 360,
      dia: e.dia + 1,
    })
    expect(r.estado.energia).toBe(ENERGIA_MAXIMA)
    const tras = aplicarComando(r.estado, { tipo: 'AvanzarTiempo', minutos: 120 }).estado
    expect(tras.minutoDelDia).toBe(360)
  })
})
