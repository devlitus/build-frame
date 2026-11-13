/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conocidos en tests */
/**
 * Rompedor · pasada global de M4 (Zonas y construcción).
 * Partidas largas y aleatorias sobre el núcleo con TODOS los comandos de M2, M3 y M4 mezclados
 * (tiempo y desmayos, personaje, modos, pausa, velocidad, compra de parcelas con la economía real,
 * pintar y borrar zonas, construir, mover, demoler y cancelar). Las acciones se eligen de forma
 * abstracta y se resuelven contra el estado vigente (parcela propia, edificio existente…) para que
 * una buena parte se acepte.
 *
 * Invariantes en cada paso:
 * - dinero y materiales: enteros seguros ≥ 0;
 * - sin solapes; huellas dentro del valle, en parcelas propias, fuera del agua y de los obstáculos,
 *   sin tapar la aparición y siempre sobre una zona compatible;
 * - casa única; ids únicos y menores que `siguienteIdEdificio`;
 * - toda obra que sigue en pie termina en un día futuro (las vencidas se terminan al cambiar de día);
 * - patrimonio (dinero + madera + piedra + lo pagado por lo que sigue en pie) que nunca crece;
 *   solo baja al comprar parcela (el precio) o al demoler (lo no devuelto);
 * - el personaje y el punto donde despertaría están libres y alcanzables desde la aparición
 *   (recorrido propio, sin usar `mapaTransitabilidad`);
 * - `edificiosValidos`, zonas de lado² caracteres válidos y solo en propias sin agua;
 * - un comando rechazado devuelve el mismo objeto; el estado sobrevive a JSON.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aguaBloqueada,
  aplicarComando,
  CONFIG_PERSONAJE,
  crearEstadoInicial,
  defEdificio,
  edificiosValidos,
  huellaDe,
  ladoValle,
  personajeAlDespertar,
  reembolso,
  type Comando,
  type EstadoJuego,
  type TipoEdificio,
  type Zona,
} from '../../src/core'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const ZONAS_: readonly Zona[] = ['cultivo', 'huerto', 'vivienda', 'almacen']
const CARACTERES = new Set(['.', 'c', 'h', 'v', 'a'])
const LETRA: Record<string, Zona> = { c: 'cultivo', h: 'huerto', v: 'vivienda', a: 'almacen' }

/** Acción abstracta: los números en [0, 1) se resuelven contra el estado vigente. */
type Accion =
  | { k: 'tiempo'; minutos: number }
  | { k: 'desmayo' }
  | { k: 'andar'; dx: number; dy: number; ms: number }
  | { k: 'modo'; plano: boolean }
  | { k: 'pausa'; si: boolean }
  | { k: 'velocidad'; v: number }
  | { k: 'comprar'; f: number }
  | { k: 'pintar'; f: number; ox: number; oy: number; w: number; h: number; zona: number }
  | { k: 'borrar'; f: number; ox: number; oy: number; w: number; h: number }
  | { k: 'construir'; tipo: number; f: number; ox: number; oy: number }
  | { k: 'mover'; e: number; f: number; ox: number; oy: number }
  | { k: 'demoler'; e: number }
  | { k: 'cancelar'; e: number }

const u = fc.double({ min: 0, max: 0.999999, noNaN: true })
const accion: fc.Arbitrary<Accion> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('tiempo' as const),
      minutos: fc.integer({ min: 0, max: 900 }),
    }),
  },
  { weight: 2, arbitrary: fc.constant({ k: 'desmayo' as const }) },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('andar' as const),
      dx: fc.constantFrom(-1, -0.5, 0, 0.5, 1),
      dy: fc.constantFrom(-1, -0.5, 0, 0.5, 1),
      ms: fc.integer({ min: 0, max: 250 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('modo' as const),
      plano: fc.constantFrom(true, true, true, false),
    }),
  },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('pausa' as const), si: fc.boolean() }) },
  {
    weight: 1,
    arbitrary: fc.record({ k: fc.constant('velocidad' as const), v: fc.constantFrom(1, 2, 3, 4) }),
  },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('comprar' as const), f: u }) },
  {
    weight: 4,
    arbitrary: fc.record({
      k: fc.constant('pintar' as const),
      f: u,
      ox: u,
      oy: u,
      w: fc.integer({ min: 0, max: 10 }),
      h: fc.integer({ min: 0, max: 10 }),
      zona: fc.integer({ min: 0, max: 3 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('borrar' as const),
      f: u,
      ox: u,
      oy: u,
      w: fc.integer({ min: 0, max: 8 }),
      h: fc.integer({ min: 0, max: 8 }),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      k: fc.constant('construir' as const),
      tipo: fc.integer({ min: 0, max: 2 }),
      f: u,
      ox: u,
      oy: u,
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({ k: fc.constant('mover' as const), e: u, f: u, ox: u, oy: u }),
  },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('demoler' as const), e: u }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('cancelar' as const), e: u }) },
)

function propiasDe(e: EstadoJuego): number[] {
  const l: number[] = []
  e.valle.parcelas.forEach((p, i) => p.estado === 'propia' && l.push(i))
  return l
}

/** Casilla global dentro de la parcela propia elegida por `f`, con desplazamiento (ox, oy). */
function casillaEnPropia(
  e: EstadoJuego,
  f: number,
  ox: number,
  oy: number,
): { x: number; y: number } {
  const propias = propiasDe(e)
  const c = e.valle.casillasPorParcela
  const n = e.valle.parcelasPorLado
  const i = propias.length > 0 ? propias[Math.floor(f * propias.length)]! : Math.floor(f * n * n)
  return { x: (i % n) * c + Math.floor(ox * c), y: Math.floor(i / n) * c + Math.floor(oy * c) }
}

function resolver(e: EstadoJuego, a: Accion): Comando {
  switch (a.k) {
    case 'tiempo':
      return { tipo: 'AvanzarTiempo', minutos: a.minutos }
    case 'desmayo':
      return { tipo: 'AvanzarTiempo', minutos: 1500 }
    case 'andar':
      return { tipo: 'MoverPersonaje', dx: a.dx, dy: a.dy, ms: a.ms }
    case 'modo':
      return { tipo: 'CambiarModo', modo: a.plano ? 'plano' : 'vida' }
    case 'pausa':
      return a.si ? { tipo: 'Pausar' } : { tipo: 'Reanudar' }
    case 'velocidad':
      return { tipo: 'CambiarVelocidad', velocidad: a.v }
    case 'comprar': {
      const n = e.valle.parcelas.length
      // Prefiere parcelas comprables para que la partida avance.
      return { tipo: 'ComprarParcela', indice: Math.floor(a.f * n) }
    }
    case 'pintar': {
      const p = casillaEnPropia(e, a.f, a.ox, a.oy)
      return {
        tipo: 'PintarZona',
        x0: p.x,
        y0: p.y,
        x1: p.x + a.w,
        y1: p.y + a.h,
        zona: ZONAS_[a.zona]!,
      }
    }
    case 'borrar': {
      const p = casillaEnPropia(e, a.f, a.ox, a.oy)
      return { tipo: 'BorrarZona', x0: p.x, y0: p.y, x1: p.x + a.w, y1: p.y + a.h }
    }
    case 'construir': {
      const p = casillaEnPropia(e, a.f, a.ox, a.oy)
      return { tipo: 'Construir', tipoEdificio: TIPOS[a.tipo]!, x: p.x, y: p.y }
    }
    case 'mover': {
      const b = e.edificios[Math.floor(a.e * e.edificios.length)]
      const p = casillaEnPropia(e, a.f, a.ox, a.oy)
      return { tipo: 'MoverEdificio', id: b?.id ?? 999, x: p.x, y: p.y }
    }
    case 'demoler': {
      const b = e.edificios[Math.floor(a.e * e.edificios.length)]
      return { tipo: 'DemolerEdificio', id: b?.id ?? 999 }
    }
    case 'cancelar': {
      const b = e.edificios[Math.floor(a.e * e.edificios.length)]
      return { tipo: 'CancelarObra', id: b?.id ?? 999 }
    }
  }
}

function patrimonio(e: EstadoJuego): number {
  let p = e.dinero + e.materiales.madera + e.materiales.piedra
  for (const b of e.edificios) {
    const pg = b.pagado ?? defEdificio(b.tipo)!.coste
    p += pg.dinero + pg.madera + pg.piedra
  }
  return p
}

const cacheAgua = new WeakMap<object, Uint8Array>()
function aguaBloqueadaCache(e: EstadoJuego): Uint8Array {
  let a = cacheAgua.get(e.valle)
  if (!a) cacheAgua.set(e.valle, (a = aguaBloqueada(e.valle, e.cauce)))
  return a.slice()
}

/** Recorrido propio 4-conexo desde la aparición (agua sin vados, obstáculos y edificios bloquean). */
function alcanzable(e: EstadoJuego): { lado: number; vista: Uint8Array; bloq: Uint8Array } {
  const lado = ladoValle(e.valle)
  const bloq = aguaBloqueadaCache(e)
  for (const o of e.obstaculos) bloq[o.y * lado + o.x] = 1
  for (const b of e.edificios) {
    const h = huellaDe(defEdificio(b.tipo)!, b.x, b.y)
    for (let y = h.y0; y <= h.y1; y++) for (let x = h.x0; x <= h.x1; x++) bloq[y * lado + x] = 1
  }
  const vista = new Uint8Array(lado * lado)
  const ini = Math.floor(e.aparicion.y) * lado + Math.floor(e.aparicion.x)
  if (bloq[ini]) return { lado, vista, bloq }
  const cola = [ini]
  vista[ini] = 1
  while (cola.length) {
    const i = cola.pop()!
    const x = i % lado
    const vec = [
      i >= lado ? i - lado : -1,
      x > 0 ? i - 1 : -1,
      x < lado - 1 ? i + 1 : -1,
      i + lado < lado * lado ? i + lado : -1,
    ]
    for (const v of vec) {
      if (v >= 0 && !vista[v] && !bloq[v]) {
        vista[v] = 1
        cola.push(v)
      }
    }
  }
  return { lado, vista, bloq }
}

/** Casillas que toca la caja de colisión centrada en (px, py). */
function casillasCaja(px: number, py: number): { x: number; y: number }[] {
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  const l: { x: number; y: number }[] = []
  for (let y = Math.floor(py - m); y <= Math.ceil(py + m) - 1; y++) {
    for (let x = Math.floor(px - m); x <= Math.ceil(px + m) - 1; x++) l.push({ x, y })
  }
  return l
}

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cacheRio = new WeakMap<object, Set<number>>()
function rioDe(e: EstadoJuego): Set<number> {
  let r = cacheRio.get(e.valle)
  if (!r) {
    r = new Set<number>(e.cauce.vados)
    const agua = aguaBloqueada(e.valle, e.cauce)
    for (let i = 0; i < agua.length; i++) if (agua[i]) r.add(i)
    cacheRio.set(e.valle, r)
  }
  return r
}

function comprobarInvariantes(e: EstadoJuego, ctx: string): void {
  const lado = ladoValle(e.valle)
  const c = e.valle.casillasPorParcela
  const n = e.valle.parcelasPorLado
  ok(Number.isSafeInteger(e.dinero) && e.dinero >= 0, `${ctx} dinero ${e.dinero}`)
  for (const m of ['madera', 'piedra'] as const) {
    ok(Number.isSafeInteger(e.materiales[m]) && e.materiales[m] >= 0, `${ctx} ${m}`)
  }
  ok(edificiosValidos(e.edificios), ctx)
  // Zonas.
  ok(e.zonas.length === lado * lado, `${ctx} zonas mide ${e.zonas.length}`)
  // aguaBloqueada excluye los vados; los vados también son río para las zonas.
  const esRio = rioDe(e)
  for (let i = 0; i < e.zonas.length; i++) {
    const ch = e.zonas[i]!
    ok(CARACTERES.has(ch), `${ctx} carácter ${ch}`)
    if (ch !== '.') {
      const x = i % lado
      const y = Math.floor(i / lado)
      ok(
        e.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]!.estado === 'propia',
        `${ctx} zona en ajena`,
      )
      ok(!esRio.has(i), `${ctx} zona en río (${x},${y})`)
    }
  }
  // Edificios.
  const ocupada = new Map<number, number>()
  const obst = new Set(e.obstaculos.map((o) => o.y * lado + o.x))
  const ax = Math.floor(e.aparicion.x)
  const ay = Math.floor(e.aparicion.y)
  const ids = new Set<number>()
  let casas = 0
  for (const b of e.edificios) {
    ok(!ids.has(b.id), `${ctx} id repetido ${b.id}`)
    ids.add(b.id)
    ok(b.id < e.siguienteIdEdificio, ctx)
    if (b.tipo === 'casa') casas++
    const def = defEdificio(b.tipo)!
    const h = huellaDe(def, b.x, b.y)
    ok(h.x0 >= 0 && h.y0 >= 0 && h.x1 < lado && h.y1 < lado, `${ctx} fuera ${b.id}`)
    if (b.obra) ok(b.obra.diaFin > e.dia, `${ctx} obra ${b.id} vencida sin terminar`)
    for (let y = h.y0; y <= h.y1; y++) {
      for (let x = h.x0; x <= h.x1; x++) {
        const k = y * lado + x
        ok(!ocupada.has(k), `${ctx} solape ${b.id} con ${ocupada.get(k)} en (${x},${y})`)
        ocupada.set(k, b.id)
        ok(
          e.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]!.estado === 'propia',
          `${ctx} ajena`,
        )
        ok(!esRio.has(k), `${ctx} ${b.tipo} ${b.id} sobre río`)
        ok(!obst.has(k), `${ctx} sobre obstáculo`)
        ok(!(x === ax && y === ay), `${ctx} tapa aparición`)
        const z = LETRA[e.zonas[k]!]
        ok(
          z !== undefined && def.zonas.includes(z),
          `${ctx} ${b.tipo} ${b.id} en zona ${e.zonas[k]} (${x},${y})`,
        )
      }
    }
  }
  ok(casas <= 1, `${ctx} ${casas} casas`)
  // Alcance: personaje y despertar.
  const a = alcanzable(e)
  for (const k of casillasCaja(e.personaje.x, e.personaje.y)) {
    ok(a.vista[k.y * lado + k.x] === 1, `${ctx} personaje en (${k.x},${k.y}) no alcanzable`)
  }
  const d = personajeAlDespertar(e)
  for (const k of casillasCaja(d.x, d.y)) {
    ok(a.vista[k.y * lado + k.x] === 1, `${ctx} despertar en (${k.x},${k.y}) no alcanzable`)
  }
  const casa = e.edificios.find((b) => b.tipo === 'casa' && b.obra === null)
  if (casa) {
    // Si la puerta está libre y alcanzable, se despierta en ella.
    const def = defEdificio('casa')!
    const px = casa.x + Math.floor(def.ancho / 2)
    const py = casa.y + def.alto
    if (py < lado && a.vista[py * lado + px]) {
      expect({ x: d.x, y: d.y }, `${ctx} no despierta en la puerta libre`).toEqual({
        x: px + 0.5,
        y: py + 0.5,
      })
    }
  }
}

interface Cuenta {
  [clave: string]: number
}

function jugar(
  semilla: number,
  dinero: number,
  materiales: { madera: number; piedra: number },
  acciones: readonly Accion[],
  cuenta?: Cuenta,
): EstadoJuego {
  let e = crearEstadoInicial({ semilla, dineroInicial: dinero, materialesIniciales: materiales })
  comprobarInvariantes(e, 'inicio')
  acciones.forEach((a, paso) => {
    const cmd = resolver(e, a)
    const antes = e
    const pAntes = patrimonio(antes)
    const quitar = cmd.tipo === 'DemolerEdificio' ? reembolso(antes, cmd.id) : undefined
    const r = aplicarComando(antes, cmd)
    const ctx = `paso ${paso} ${JSON.stringify(cmd)} -> ${r.ok ? 'ok' : r.error}`
    if (cuenta)
      cuenta[`${cmd.tipo}:${r.ok ? 'ok' : r.error}`] =
        (cuenta[`${cmd.tipo}:${r.ok ? 'ok' : r.error}`] ?? 0) + 1
    if (!r.ok) {
      expect(r.estado, ctx).toBe(antes)
      return
    }
    e = r.estado
    comprobarInvariantes(e, ctx)
    const pDespues = patrimonio(e)
    switch (cmd.tipo) {
      case 'ComprarParcela': {
        const ev = r.eventos[0]
        expect(ev?.tipo, ctx).toBe('parcela-comprada')
        expect(pDespues, ctx).toBe(pAntes - (ev && 'precio' in ev ? ev.precio : NaN))
        break
      }
      case 'DemolerEdificio': {
        const b = antes.edificios.find((x) => x.id === cmd.id)!
        const pg = b.pagado ?? defEdificio(b.tipo)!.coste
        const dev = quitar!.coste
        expect(pDespues, ctx).toBe(
          pAntes - (pg.dinero + pg.madera + pg.piedra) + (dev.dinero + dev.madera + dev.piedra),
        )
        expect(pDespues <= pAntes, ctx).toBe(true)
        break
      }
      default:
        // Construir, cancelar, mover, zonas, tiempo, personaje: el patrimonio no cambia.
        expect(pDespues, ctx).toBe(pAntes)
    }
    // El desmayo nunca deja obras vencidas y lleva al día siguiente a las 06:00.
    if (r.eventos.some((v) => v.tipo === 'desmayo')) {
      expect(e.dia, ctx).toBe(antes.dia + 1)
      expect(
        e.edificios.every((b) => !b.obra || b.obra.diaFin > e.dia),
        ctx,
      ).toBe(true)
      expect(e.personaje, ctx).toEqual(personajeAlDespertar(e))
    }
  })
  // Al final, las obras que quedan terminan en a lo sumo 3 desmayos (la obra más larga dura 3 días).
  let f = e
  for (let i = 0; i < 3; i++) {
    f = aplicarComando(aplicarComando(f, { tipo: 'CambiarModo', modo: 'vida' }).estado, {
      tipo: 'Reanudar',
    }).estado
    const r = aplicarComando(f, { tipo: 'AvanzarTiempo', minutos: 1500 })
    expect(r.ok).toBe(true)
    f = r.estado
    comprobarInvariantes(f, `final ${i}`)
  }
  expect(
    f.edificios.every((b) => b.obra === null),
    'obras sin terminar tras 3 días',
  ).toBe(true)
  // JSON ida y vuelta.
  expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  return e
}

/** Prefijo que compra una parcela de la aparición y pinta casi entera de vivienda y almacén. */
function prefijo(): Accion[] {
  return [
    { k: 'modo', plano: true },
    { k: 'comprar', f: 0 },
  ]
}

describe('M4 global rompedor · partidas largas con todos los comandos', () => {
  it('invariantes en partidas aleatorias (economía real y holgada; parcelas, zonas, obras, mover, demoler, cancelar, tiempo)', () => {
    const cuenta: Cuenta = {}
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.constantFrom(1100, 5000, 100_000),
        fc.constantFrom({ madera: 80, piedra: 20 }, { madera: 600, piedra: 150 }),
        fc.array(accion, { minLength: 150, maxLength: 400 }),
        (semilla, dinero, materiales, acciones) => {
          jugar(semilla, dinero, materiales, [...prefijo(), ...acciones], cuenta)
        },
      ),
      { numRuns: 300 },
    )
    if (process.env.COBERTURA) console.log(JSON.stringify(cuenta))
    // Cobertura: la simulación hace de verdad cada cosa.
    for (const clave of [
      'ComprarParcela:ok',
      'PintarZona:ok',
      'BorrarZona:ok',
      'Construir:ok',
      'MoverEdificio:ok',
      'DemolerEdificio:ok',
      'CancelarObra:ok',
      'MoverPersonaje:ok',
    ]) {
      expect(cuenta[clave] ?? 0, `cobertura ${clave}: ${JSON.stringify(cuenta)}`).toBeGreaterThan(5)
    }
  }, 240_000)

  it('determinismo: misma semilla y acciones ⇒ mismo estado final', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(accion, { minLength: 30, maxLength: 120 }),
        (semilla, acciones) => {
          const a = jugar(semilla, 5000, { madera: 600, piedra: 150 }, [...prefijo(), ...acciones])
          const b = jugar(semilla, 5000, { madera: 600, piedra: 150 }, [...prefijo(), ...acciones])
          expect(JSON.stringify(a)).toBe(JSON.stringify(b))
        },
      ),
      { numRuns: 30 },
    )
  }, 120_000)
})
