/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de índices y catálogo conocidos en tests */
/**
 * Rompedor · M4-03 Obras que duran días.
 * Ataques: obra y desmayo en la misma tirada, desmayos seguidos, `diaFin` en el límite de
 * MAX_SAFE_INTEGER, estados corruptos (aplicarComando nunca debe lanzar ni colgarse), casa en
 * bordes y esquinas, junto al río, rodeada, con la puerta en un vado, oráculo independiente
 * de `personajeAlDespertar` (BFS propio), determinismo, pureza (dinero, materiales, zonas,
 * parcelas, rng), encierro tras despertar y partidas largas con fast-check.
 */
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  CONFIG_EDIFICIOS,
  CONFIG_PERSONAJE,
  CONFIG_TIEMPO,
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  personajeAlDespertar,
  tiempoDetenido,
  ZONAS,
  type Comando,
  type Edificio,
  type EstadoJuego,
  type EventoJuego,
  type Obstaculo,
  type TipoEdificio,
} from '../../src/core'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const RICO = 1_000_000_000
const MUCHO = { madera: 1_000_000, piedra: 1_000_000 }
const M = CONFIG_PERSONAJE.tamanoCaja / 2
const FIN = CONFIG_TIEMPO.horaFin
const def = (t: TipoEdificio) => CONFIG_EDIFICIOS.edificios[t]

function nuevo(semilla: number): EstadoJuego {
  const e = crearEstadoInicial({ semilla, dineroInicial: RICO, materialesIniciales: MUCHO })
  return {
    ...e,
    valle: { ...e.valle, parcelas: e.valle.parcelas.map((p) => ({ ...p, estado: 'propia' })) },
  }
}
const BASE = nuevo(42)
const LADO = ladoValle(BASE.valle)

const cmd = (e: EstadoJuego, c: unknown) => aplicarComando(e, c as Comando)
const desmayar = (e: EstadoJuego) =>
  cmd({ ...e, modo: 'vida', pausado: false }, { tipo: 'AvanzarTiempo', minutos: 1e9 })
const edif = (
  id: number,
  tipo: TipoEdificio,
  x: number,
  y: number,
  obra: Edificio['obra'] = null,
): Edificio => ({ id, tipo, x, y, obra })

/** Agua (río sin vados), calculada aquí sin las funciones del núcleo que calculan el mapa. */
function aguaPropia(e: EstadoJuego): Uint8Array {
  const a = new Uint8Array(LADO * LADO)
  for (const c of casillasRio(e.valle, e.cauce.ancho)) a[c.y * LADO + c.x] = 1
  for (const k of e.cauce.vados) a[k] = 0
  return a
}

/** Alcanzables desde la aparición (BFS 4-conexo propio). */
function alcanzablesPropio(e: EstadoJuego): Uint8Array {
  const bloq = aguaPropia(e)
  for (const o of e.obstaculos) bloq[o.y * LADO + o.x] = 1
  for (const b of e.edificios) {
    const d = def(b.tipo)
    for (let y = b.y; y < b.y + d.alto; y++)
      for (let x = b.x; x < b.x + d.ancho; x++)
        if (x >= 0 && y >= 0 && x < LADO && y < LADO) bloq[y * LADO + x] = 1
  }
  const vista = new Uint8Array(LADO * LADO)
  const ini = Math.floor(e.aparicion.y) * LADO + Math.floor(e.aparicion.x)
  if (bloq[ini] === 1) return vista
  const cola = [ini]
  vista[ini] = 1
  while (cola.length) {
    const i = cola.pop()!
    const x = i % LADO
    const y = (i - x) / LADO
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= LADO || ny >= LADO) continue
      const k = ny * LADO + nx
      if (vista[k] || bloq[k]) continue
      vista[k] = 1
      cola.push(k)
    }
  }
  return vista
}

/** ¿La caja del personaje solo toca casillas alcanzables (y dentro del valle)? */
function cajaLibre(e: EstadoJuego, px: number, py: number): boolean {
  const vista = alcanzablesPropio(e)
  for (let y = Math.floor(py - M); y <= Math.ceil(py + M) - 1; y++)
    for (let x = Math.floor(px - M); x <= Math.ceil(px + M) - 1; x++) {
      if (x < 0 || y < 0 || x >= LADO || y >= LADO) return false
      if (vista[y * LADO + x] !== 1) return false
    }
  return true
}

/**
 * Oráculo de `personajeAlDespertar` escrito desde su documentación: puerta si libre; si no,
 * mínima distancia Chebyshev a la huella, luego distancia euclídea a la puerta, luego y, luego x.
 */
function oraculoDespertar(e: EstadoJuego): { x: number; y: number } {
  const casa = e.edificios
    .filter((b) => b.tipo === 'casa' && b.obra === null)
    .sort((a, b) => a.id - b.id)[0]
  if (!casa) return { x: e.aparicion.x, y: e.aparicion.y }
  const vista = alcanzablesPropio(e)
  const libre = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < LADO && y < LADO && vista[y * LADO + x] === 1
  const d = def('casa')
  const px = casa.x + Math.floor(d.ancho / 2)
  const py = casa.y + d.alto
  if (libre(px, py)) return { x: px + 0.5, y: py + 0.5 }
  const x0 = casa.x
  const x1 = casa.x + d.ancho - 1
  const y0 = casa.y
  const y1 = casa.y + d.alto - 1
  let mejor: [number, number, number, number] | null = null
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++) {
      if (!libre(x, y)) continue
      const cheb = Math.max(x0 - x, 0, x - x1, y0 - y, 0, y - y1)
      if (cheb === 0) continue
      const c: [number, number, number, number] = [cheb, (x - px) ** 2 + (y - py) ** 2, y, x]
      if (
        !mejor ||
        c[0] < mejor[0] ||
        (c[0] === mejor[0] &&
          (c[1] < mejor[1] ||
            (c[1] === mejor[1] && (c[2] < mejor[2] || (c[2] === mejor[2] && c[3] < mejor[3])))))
      )
        mejor = c
    }
  if (!mejor) return { x: e.aparicion.x, y: e.aparicion.y }
  return { x: mejor[3] + 0.5, y: mejor[2] + 0.5 }
}

/** Ejecuta `f` con un tope de tiempo real: lanza ERR_SCRIPT_EXECUTION_TIMEOUT si se cuelga. */
function conTope<T>(f: () => T, ms = 1000): T {
  return vm.runInNewContext('f()', { f }, { timeout: ms }) as T
}

/** Esquina de una casa cuya huella es tierra seca y transitable (sin obstáculos ni agua). */
function sitiosCasa(e: EstadoJuego): { x: number; y: number }[] {
  const vista = alcanzablesPropio(e)
  const d = def('casa')
  const out: { x: number; y: number }[] = []
  const ax = Math.floor(e.aparicion.x)
  const ay = Math.floor(e.aparicion.y)
  for (let y = 0; y + d.alto <= LADO; y++)
    for (let x = 0; x + d.ancho <= LADO; x++) {
      let ok = !(ax >= x && ax < x + d.ancho && ay >= y && ay < y + d.alto)
      for (let yy = y; ok && yy < y + d.alto; yy++)
        for (let xx = x; ok && xx < x + d.ancho; xx++) ok = vista[yy * LADO + xx] === 1
      if (ok) out.push({ x, y })
    }
  return out
}

// ---------------------------------------------------------------------------------------------

describe('M4-03 rompedor: momento exacto de terminar', () => {
  it('obra de n días iniciada el día d termina exactamente al empezar d+n (ni antes ni después), con comandos reales', () => {
    for (const tipo of TIPOS) {
      let e = BASE
      const s = sitiosCasa(e).find((p) => p.y > 5 && p.x > 5)!
      e = cmd(e, {
        tipo: 'PintarZona',
        x0: s.x,
        y0: s.y,
        x1: s.x + 3,
        y1: s.y + 2,
        zona: def(tipo).zonas[0],
      }).estado
      e = cmd(e, { tipo: 'CambiarModo', modo: 'plano' }).estado
      const r = cmd(e, { tipo: 'Construir', tipoEdificio: tipo, x: s.x, y: s.y })
      expect(r.ok).toBe(true)
      e = cmd(r.estado, { tipo: 'CambiarModo', modo: 'vida' }).estado
      const d0 = e.dia
      for (let k = 1; k <= def(tipo).dias + 2; k++) {
        const r2 = desmayar(e)
        expect(r2.ok).toBe(true)
        e = r2.estado
        expect(e.dia).toBe(d0 + k)
        const terminadas = r2.ok ? r2.eventos.filter((v) => v.tipo === 'obra-terminada') : []
        if (k < def(tipo).dias) expect(e.edificios[0]!.obra).not.toBeNull()
        if (k === def(tipo).dias) {
          expect(e.edificios[0]!.obra).toBeNull()
          expect(terminadas).toEqual([{ tipo: 'obra-terminada', id: 1, tipoEdificio: tipo }])
        } else expect(terminadas).toEqual([])
      }
    }
  })

  it('obra y desmayo en la misma tirada enorme: un solo día, eventos [desmayo, obra-terminada…] en orden de id', () => {
    const s = sitiosCasa(BASE)
    const lejos = s.filter((_p, i) => i % 97 === 0).slice(0, 3)
    const edificios = [
      edif(9, 'caja-envio', lejos[0]!.x, lejos[0]!.y, { diaInicio: 1, diaFin: 2 }),
      edif(3, 'caja-envio', lejos[1]!.x, lejos[1]!.y, { diaInicio: 1, diaFin: 2 }),
      edif(5, 'caja-envio', lejos[2]!.x, lejos[2]!.y, { diaInicio: 1, diaFin: 3 }),
    ]
    const e: EstadoJuego = { ...BASE, edificios, dia: 1, minutoDelDia: 400 }
    const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: Number.MAX_SAFE_INTEGER })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.dia).toBe(2)
    expect(r.estado.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio)
    expect(r.eventos).toEqual([
      { tipo: 'desmayo' },
      { tipo: 'obra-terminada', id: 3, tipoEdificio: 'caja-envio' },
      { tipo: 'obra-terminada', id: 9, tipoEdificio: 'caja-envio' },
    ])
    expect(r.estado.edificios.map((b) => b.obra)).toEqual([null, null, { diaInicio: 1, diaFin: 3 }])
    // Orden en la lista intacto.
    expect(r.estado.edificios.map((b) => b.id)).toEqual([9, 3, 5])
  })

  it('justo hasta las 02:00 no hay desmayo ni obra terminada; un minuto más sí', () => {
    const s = sitiosCasa(BASE)[0]!
    const e: EstadoJuego = {
      ...BASE,
      dia: 4,
      minutoDelDia: FIN - 10,
      edificios: [edif(1, 'casa', s.x, s.y, { diaInicio: 2, diaFin: 5 })],
    }
    const r1 = cmd(e, { tipo: 'AvanzarTiempo', minutos: 10 })
    expect(r1.ok && r1.eventos).toEqual([])
    expect(r1.estado.edificios[0]!.obra).not.toBeNull()
    const r2 = cmd(r1.estado, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(r2.ok && r2.eventos.map((v) => v.tipo)).toEqual(['desmayo', 'obra-terminada'])
  })

  it('en Plano o en pausa no avanza nada aunque la obra esté vencida', () => {
    const s = sitiosCasa(BASE)[0]!
    const e: EstadoJuego = {
      ...BASE,
      minutoDelDia: FIN,
      edificios: [edif(1, 'casa', s.x, s.y, { diaInicio: 1, diaFin: 1 })],
    }
    for (const est of [
      { ...e, modo: 'plano' as const },
      { ...e, pausado: true },
    ]) {
      const r = cmd(est, { tipo: 'AvanzarTiempo', minutos: 1e9 })
      expect(r.ok).toBe(true)
      expect(r.estado).toBe(est)
    }
  })

  it('diaFin = MAX_SAFE_INTEGER termina en el último día posible; después, limite-de-dia sin tocar nada', () => {
    const s = sitiosCasa(BASE)[0]!
    const MAX = Number.MAX_SAFE_INTEGER
    const e: EstadoJuego = {
      ...BASE,
      dia: MAX - 1,
      minutoDelDia: FIN,
      edificios: [edif(1, 'casa', s.x, s.y, { diaInicio: MAX - 4, diaFin: MAX })],
    }
    const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(r.ok).toBe(true)
    expect(r.estado.dia).toBe(MAX)
    expect(r.estado.edificios[0]!.obra).toBeNull()
    const r2 = cmd({ ...r.estado, minutoDelDia: FIN }, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toBe('limite-de-dia')
    // Construir el último día: la caja (1 día) no cabe y la rechaza por límite.
    let p: EstadoJuego = { ...r.estado, modo: 'plano' }
    const c = sitiosCasa(p).find((q) => q.x > 0)!
    p = cmd(p, {
      tipo: 'PintarZona',
      x0: c.x,
      y0: c.y,
      x1: c.x,
      y1: c.y,
      zona: 'vivienda',
    }).estado
    const r3 = cmd(p, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: c.x, y: c.y })
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error).toBe('limite-de-dia')
  })
})

describe('M4-03 rompedor: dónde se despierta', () => {
  it('oráculo independiente: casa terminada en cualquier sitio seco (bordes, esquinas, río), con obstáculos y edificios alrededor', () => {
    const sitios = sitiosCasa(BASE)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: sitios.length - 1 }),
        fc.array(
          fc.record({ dx: fc.integer({ min: -3, max: 6 }), dy: fc.integer({ min: -3, max: 5 }) }),
          { maxLength: 25 },
        ),
        fc.array(
          fc.record({
            tipo: fc.constantFrom<TipoEdificio>('caja-envio', 'cobertizo'),
            dx: fc.integer({ min: -4, max: 6 }),
            dy: fc.integer({ min: -3, max: 5 }),
          }),
          { maxLength: 4 },
        ),
        fc.boolean(),
        (i, rocas, otros, borde) => {
          const s = borde
            ? (sitios.filter((p) => p.x === 0 || p.y === 0 || p.x === LADO - 4 || p.y === LADO - 3)[
                i % 50
              ] ?? sitios[i]!)
            : sitios[i]!
          const ax = Math.floor(BASE.aparicion.x)
          const ay = Math.floor(BASE.aparicion.y)
          const enCasa = (x: number, y: number) =>
            x >= s.x && x < s.x + 4 && y >= s.y && y < s.y + 3
          const obst: Obstaculo[] = [...BASE.obstaculos]
          for (const r of rocas) {
            const x = s.x + r.dx
            const y = s.y + r.dy
            if (x < 0 || y < 0 || x >= LADO || y >= LADO || enCasa(x, y)) continue
            if (x === ax && y === ay) continue
            obst.push({ tipo: 'roca', x, y, variante: 0 })
          }
          const edificios: Edificio[] = [edif(1, 'casa', s.x, s.y, { diaInicio: 1, diaFin: 2 })]
          otros.forEach((o, k) => {
            const d = def(o.tipo)
            const x = s.x + o.dx
            const y = s.y + o.dy
            for (let yy = y; yy < y + d.alto; yy++)
              for (let xx = x; xx < x + d.ancho; xx++)
                if (enCasa(xx, yy) || (xx === ax && yy === ay)) return
            edificios.push(edif(k + 2, o.tipo, x, y))
          })
          const e: EstadoJuego = { ...BASE, obstaculos: obst, edificios, minutoDelDia: FIN }
          const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
          expect(r.ok).toBe(true)
          const p = r.estado.personaje
          const esperado = oraculoDespertar(r.estado)
          expect({ x: p.x, y: p.y }).toEqual(esperado)
          expect(p.orientacion).toBe('sur')
          expect(cajaLibre(r.estado, p.x, p.y)).toBe(true)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('puerta en un vado: despierta en el vado (transitable y alcanzable)', () => {
    const lado = LADO
    const agua = new Set(casillasRio(BASE.valle, BASE.cauce.ancho).map((c) => c.y * lado + c.x))
    let hecho = 0
    for (const k of BASE.cauce.vados) {
      const vx = k % lado
      const vy = (k - vx) / lado
      const cx = vx - 2
      const cy = vy - 3
      let ok = cx >= 0 && cy >= 0
      for (let y = cy; ok && y < cy + 3; y++)
        for (let x = cx; ok && x < cx + 4; x++) ok = !agua.has(y * lado + x)
      if (!ok) continue
      const e: EstadoJuego = {
        ...BASE,
        obstaculos: [],
        minutoDelDia: FIN,
        edificios: [edif(1, 'casa', cx, cy)],
      }
      const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
      expect({ x: r.estado.personaje.x, y: r.estado.personaje.y }).toEqual({
        x: vx + 0.5,
        y: vy + 0.5,
      })
      expect(cajaLibre(r.estado, r.estado.personaje.x, r.estado.personaje.y)).toBe(true)
      hecho++
    }
    // Si ningún vado tiene tierra seca encima, al menos lo comprobamos con otras semillas.
    for (let s = 1; hecho === 0 && s < 60; s++) {
      const b = nuevo(s)
      const ag = new Set(casillasRio(b.valle, b.cauce.ancho).map((c) => c.y * lado + c.x))
      for (const k of b.cauce.vados) {
        const vx = k % lado
        const vy = (k - vx) / lado
        const cx = vx - 2
        const cy = vy - 3
        let ok = cx >= 0 && cy >= 0
        for (let y = cy; ok && y < cy + 3; y++)
          for (let x = cx; ok && x < cx + 4; x++) ok = !ag.has(y * lado + x)
        if (!ok) continue
        const e: EstadoJuego = {
          ...b,
          obstaculos: [],
          minutoDelDia: FIN,
          edificios: [edif(1, 'casa', cx, cy)],
        }
        const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
        expect({ x: r.estado.personaje.x, y: r.estado.personaje.y }).toEqual({
          x: vx + 0.5,
          y: vy + 0.5,
        })
        hecho++
      }
    }
    expect(hecho).toBeGreaterThan(0)
  })

  it('casa totalmente rodeada por rocas (anillo 1 y 2 cerrados): despierta fuera, alcanzable, igual que el oráculo', () => {
    const s = sitiosCasa(BASE).find((p) => p.x > 10 && p.y > 10 && p.x < 80 && p.y < 60)!
    const obst: Obstaculo[] = []
    for (let y = s.y - 2; y <= s.y + 4; y++)
      for (let x = s.x - 2; x <= s.x + 5; x++) {
        const dentro = x >= s.x && x < s.x + 4 && y >= s.y && y < s.y + 3
        if (!dentro) obst.push({ tipo: 'roca', x, y, variante: 0 })
      }
    const e: EstadoJuego = {
      ...BASE,
      obstaculos: obst,
      minutoDelDia: FIN,
      edificios: [edif(1, 'casa', s.x, s.y)],
    }
    const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
    const p = r.estado.personaje
    expect({ x: p.x, y: p.y }).toEqual(oraculoDespertar(r.estado))
    expect(cajaLibre(r.estado, p.x, p.y)).toBe(true)
  })

  it('tras despertar en la puerta, cerrar la puerta con cajas lo impide bloquea-paso (no queda encerrado)', () => {
    let e = BASE
    const s = sitiosCasa(e).find((p) => {
      // Puerta con vecinos O, E, S y un margen libres.
      const v = alcanzablesPropio(e)
      for (let y = p.y - 1; y <= p.y + 5; y++)
        for (let x = p.x - 2; x <= p.x + 6; x++) {
          const enC = x >= p.x && x < p.x + 4 && y >= p.y && y < p.y + 3
          if (!enC && (x < 0 || y < 0 || x >= LADO || y >= LADO || v[y * LADO + x] !== 1))
            return false
        }
      return true
    })!
    e = cmd(e, {
      tipo: 'PintarZona',
      x0: s.x - 2,
      y0: s.y - 1,
      x1: s.x + 6,
      y1: s.y + 5,
      zona: 'vivienda',
    }).estado
    e = cmd(e, { tipo: 'CambiarModo', modo: 'plano' }).estado
    const rc = cmd(e, { tipo: 'Construir', tipoEdificio: 'casa', x: s.x, y: s.y })
    expect(rc.ok).toBe(true)
    e = rc.estado
    for (let k = 0; k < 3; k++) e = desmayar(e).estado
    expect(e.edificios[0]!.obra).toBeNull()
    const px = s.x + 2
    const py = s.y + 3
    expect([e.personaje.x, e.personaje.y]).toEqual([px + 0.5, py + 0.5])
    e = { ...e, modo: 'plano' }
    const intentos: (string | true)[] = []
    for (const [x, y] of [
      [px - 1, py],
      [px + 1, py],
      [px, py + 1],
    ] as const) {
      const r = cmd(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x, y })
      intentos.push(r.ok ? true : r.error)
      if (r.ok) e = r.estado
    }
    expect(intentos).toEqual([true, true, 'bloquea-paso'])
    expect(cajaLibre(e, e.personaje.x, e.personaje.y)).toBe(true)
    // Y en Vida puede salir andando: 2 s hacia el sur-este no la dejan en la misma casilla.
    let v: EstadoJuego = { ...e, modo: 'vida' }
    for (let k = 0; k < 8; k++) v = cmd(v, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 250 }).estado
    expect(Math.floor(v.personaje.y)).toBeGreaterThan(py)
  })

  it('la casa en obra no cuenta: despierta en la aparición', () => {
    const s = sitiosCasa(BASE)[5]!
    const e: EstadoJuego = {
      ...BASE,
      minutoDelDia: FIN,
      personaje: { x: 3.3, y: 4.7, orientacion: 'norte' },
      edificios: [edif(1, 'casa', s.x, s.y, { diaInicio: 1, diaFin: 9 })],
    }
    const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(r.estado.personaje).toEqual({ ...BASE.aparicion, orientacion: 'sur' })
  })
})

describe('M4-03 rompedor: pureza y determinismo', () => {
  it('el desmayo no toca dinero, materiales, zonas, parcelas, rng, ids, cauce ni obstáculos; es determinista y sobrevive a JSON', () => {
    const s = sitiosCasa(BASE)[11]!
    const e: EstadoJuego = {
      ...BASE,
      minutoDelDia: FIN,
      zonas: BASE.zonas.replace(/^\.{5}/, 'vvvvv'),
      siguienteIdEdificio: 7,
      edificios: [
        edif(1, 'casa', s.x, s.y, { diaInicio: 1, diaFin: 2 }),
        edif(4, 'caja-envio', 0, 0, { diaInicio: 1, diaFin: 3 }),
      ],
    }
    const congelado = JSON.stringify(e)
    const r = cmd(e, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(JSON.stringify(e)).toBe(congelado)
    for (const k of [
      'dinero',
      'materiales',
      'zonas',
      'valle',
      'rng',
      'semilla',
      'siguienteIdEdificio',
      'cauce',
      'obstaculos',
      'aparicion',
      'comprasHechas',
      'velocidad',
      'modo',
      'pausado',
    ] as const)
      expect(r.estado[k]).toBe(e[k])
    const r2 = cmd(JSON.parse(congelado) as EstadoJuego, { tipo: 'AvanzarTiempo', minutos: 1 })
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r))
    expect(personajeAlDespertar(r.estado)).toEqual(personajeAlDespertar(r.estado))
  })
})

describe('M4-03 rompedor: estados corruptos (aplicarComando nunca lanza ni se cuelga)', () => {
  const s = sitiosCasa(BASE)[0]!
  const desm = (edificios: unknown) =>
    conTope(() =>
      cmd({ ...BASE, minutoDelDia: FIN, edificios } as unknown as EstadoJuego, {
        tipo: 'AvanzarTiempo',
        minutos: 1,
      }),
    )

  it('obras con diaFin raro no lanzan', () => {
    for (const obra of [
      { diaInicio: 1, diaFin: 1.5 },
      { diaInicio: 1, diaFin: Number.NaN },
      { diaInicio: 1, diaFin: Infinity },
      { diaInicio: 1, diaFin: -Infinity },
      { diaInicio: 1, diaFin: '2' },
      { diaInicio: 1, diaFin: null },
      { diaInicio: 1 },
      {},
      5,
      'obra',
      [],
    ]) {
      expect(() => desm([{ id: 1, tipo: 'casa', x: s.x, y: s.y, obra }])).not.toThrow()
    }
  })

  it('edificios con tipo, id o coordenadas raros (pequeñas) no lanzan', () => {
    for (const b of [
      { id: 1, tipo: 'constructor', x: 1, y: 1, obra: null },
      { id: 1, tipo: '__proto__', x: 1, y: 1, obra: null },
      { id: Number.NaN, tipo: 'casa', x: s.x, y: s.y, obra: null },
      { id: 1, tipo: 'casa', x: Number.NaN, y: s.y, obra: null },
      { id: 1, tipo: 'casa', x: -500, y: -500, obra: null },
      { id: 1, tipo: 'casa', x: 1.5, y: 2.25, obra: null },
      { id: 1, tipo: 'casa', x: '3', y: '4', obra: null },
    ]) {
      expect(() => desm([b])).not.toThrow()
    }
  })

  it('[S3] desmayo con `edificios` ausente o null lanza (antes de M4-03 el desmayo no miraba edificios)', () => {
    expect(() => desm(undefined)).not.toThrow()
    expect(() => desm(null)).not.toThrow()
  })

  it('[S3] desmayo con un `null` dentro de `edificios` lanza (MoverPersonaje sí da estado-invalido)', () => {
    expect(() => desm([null])).not.toThrow()
  })

  it('[S3] desmayo con un edificio sin campo `obra` (heredado o hecho a mano) lanza', () => {
    expect(() => desm([{ id: 1, tipo: 'caja-envio', x: s.x, y: s.y }])).not.toThrow()
  })

  it('[S3, cuelgue] casa terminada con coordenadas enormes (2^54, 1e300, ±Infinity): el desmayo entra en un bucle infinito', () => {
    // `x++` no cambia un número por encima de 2^53: el bucle del anillo en personajeAlDespertar
    // no termina nunca. `conTope` corta al segundo con ERR_SCRIPT_EXECUTION_TIMEOUT.
    const colgados: string[] = []
    for (const [x, y] of [
      [2 ** 54, 10],
      [1e300, 10],
      [Infinity, 10],
      [-Infinity, 10],
      [10, 1e300],
    ] as const) {
      try {
        desm([{ id: 1, tipo: 'casa', x, y, obra: null }])
      } catch (err) {
        colgados.push(`(${x}, ${y}): ${(err as { code?: string }).code ?? String(err)}`)
      }
    }
    expect(colgados).toEqual([])
  }, 30_000)
})

// ---------------------------------------------------------------------------------------------
// Partidas largas

type Paso =
  { k: 'cmd'; c: unknown } | { k: 'edif'; t: TipoEdificio; x: number; y: number } | { k: 'dormir' }

function arbPartida(ax: number, ay: number) {
  const cerca = (r: number, c: number) =>
    fc.integer({ min: Math.max(0, c - r), max: Math.min(LADO - 1, c + r) })
  const c: fc.Arbitrary<Paso> = fc.oneof(
    {
      weight: 4,
      arbitrary: fc
        .record({ t: fc.constantFrom(...TIPOS), x: cerca(14, ax), y: cerca(14, ay) })
        .map(({ t, x, y }) => ({
          k: 'cmd' as const,
          c: { tipo: 'Construir', tipoEdificio: t, x, y },
        })),
    },
    {
      weight: 3,
      arbitrary: fc
        .record({
          x: cerca(14, ax),
          y: cerca(14, ay),
          w: fc.integer({ min: 0, max: 8 }),
          h: fc.integer({ min: 0, max: 8 }),
          z: fc.constantFrom(...ZONAS),
        })
        .map(({ x, y, w, h, z }) => ({
          k: 'cmd' as const,
          c: { tipo: 'PintarZona', x0: x, y0: y, x1: x + w, y1: y + h, zona: z },
        })),
    },
    {
      weight: 6,
      arbitrary: fc
        .record({ t: fc.constantFrom(...TIPOS), x: cerca(14, ax), y: cerca(14, ay) })
        .map(({ t, x, y }) => ({ k: 'edif' as const, t, x, y })),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom('vida', 'plano')
        .map((m) => ({ k: 'cmd' as const, c: { tipo: 'CambiarModo', modo: m } })),
    },
    { weight: 1, arbitrary: fc.constant<Paso>({ k: 'cmd', c: { tipo: 'Pausar' } }) },
    { weight: 2, arbitrary: fc.constant<Paso>({ k: 'cmd', c: { tipo: 'Reanudar' } }) },
    {
      weight: 3,
      arbitrary: fc
        .record({
          dx: fc.constantFrom(-1, 0, 1, 0.5),
          dy: fc.constantFrom(-1, 0, 1, -0.5),
          ms: fc.integer({ min: 0, max: 250 }),
        })
        .map((m) => ({ k: 'cmd' as const, c: { tipo: 'MoverPersonaje', ...m } })),
    },
    {
      weight: 3,
      arbitrary: fc
        .constantFrom(1, 59, 600, 1199, 1200, 5000, Number.MAX_SAFE_INTEGER)
        .map((minutos) => ({ k: 'cmd' as const, c: { tipo: 'AvanzarTiempo', minutos } })),
    },
    { weight: 3, arbitrary: fc.constant<Paso>({ k: 'dormir' }) },
  )
  return fc.array(c, { minLength: 10, maxLength: 70 })
}

function verificar(antes: EstadoJuego, c: unknown, contadores: { dias: number; fin: number }) {
  const r = cmd(antes, c)
  const d = r.estado
  const tipo = (c as { tipo: string }).tipo
  if (!r.ok) {
    expect(d).toBe(antes)
    return d
  }
  const ev: readonly EventoJuego[] = r.eventos
  // Número de edificios: constante salvo Construir con éxito (+1).
  expect(d.edificios.length).toBe(antes.edificios.length + (tipo === 'Construir' ? 1 : 0))
  // Dinero y materiales solo cambian al construir.
  if (tipo !== 'Construir') {
    expect(d.dinero).toBe(antes.dinero)
    expect(d.materiales).toEqual(antes.materiales)
    expect(d.rng).toBe(antes.rng)
  }
  // En Plano o en pausa el tiempo no avanza.
  if (tipo === 'AvanzarTiempo' && tiempoDetenido(antes)) expect(d).toBe(antes)
  const cambioDia = d.dia !== antes.dia
  if (cambioDia) {
    contadores.dias++
    expect(tipo).toBe('AvanzarTiempo')
    expect(d.dia).toBe(antes.dia + 1)
    expect(ev[0]).toEqual({ tipo: 'desmayo' })
  }
  // Invariante: toda obra vigente acaba en un día futuro.
  for (const b of d.edificios) if (b.obra) expect(b.obra.diaFin).toBeGreaterThan(d.dia)
  // Ninguna obra resucita; las que terminan lo hacen exactamente el día diaFin; eventos = cambios.
  const terminadas: { tipo: 'obra-terminada'; id: number; tipoEdificio: TipoEdificio }[] = []
  antes.edificios.forEach((b, i) => {
    const n = d.edificios[i]!
    expect(n.id).toBe(b.id)
    expect(n.x).toBe(b.x)
    expect(n.y).toBe(b.y)
    if (b.obra === null) expect(n.obra).toBeNull()
    else if (n.obra === null) {
      expect(cambioDia).toBe(true)
      expect(b.obra.diaFin).toBe(d.dia)
      terminadas.push({ tipo: 'obra-terminada', id: b.id, tipoEdificio: b.tipo })
      contadores.fin++
    } else expect(n.obra).toEqual(b.obra)
  })
  terminadas.sort((a, b) => a.id - b.id)
  expect(ev.filter((v) => v.tipo === 'obra-terminada')).toEqual(terminadas)
  // El personaje nunca en casilla bloqueada ni con la caja tocando algo.
  expect(cajaLibre(d, d.personaje.x, d.personaje.y)).toBe(true)
  if (cambioDia) {
    expect({ x: d.personaje.x, y: d.personaje.y }).toEqual(oraculoDespertar(d))
    expect(d.personaje.orientacion).toBe('sur')
  }
  return d
}

function jugar(semilla: number, pasos: Paso[], contadores: { dias: number; fin: number }) {
  let e = nuevo(semilla)
  for (const p of pasos) {
    if (p.k === 'cmd') e = verificar(e, p.c, contadores)
    else if (p.k === 'dormir') {
      e = verificar(e, { tipo: 'CambiarModo', modo: 'vida' }, contadores)
      e = verificar(e, { tipo: 'Reanudar' }, contadores)
      e = verificar(e, { tipo: 'AvanzarTiempo', minutos: 1e9 }, contadores)
    } else {
      const d = def(p.t)
      e = verificar(
        e,
        {
          tipo: 'PintarZona',
          x0: p.x,
          y0: p.y,
          x1: p.x + d.ancho - 1,
          y1: p.y + d.alto - 1,
          zona: d.zonas[d.zonas.length - 1],
        },
        contadores,
      )
      e = verificar(e, { tipo: 'CambiarModo', modo: 'plano' }, contadores)
      e = verificar(e, { tipo: 'Construir', tipoEdificio: p.t, x: p.x, y: p.y }, contadores)
    }
  }
  return e
}

describe('M4-03 rompedor: partidas largas', () => {
  it('invariantes de obras, eventos y personaje en partidas con Construir, zonas, modos, pausa, movimiento y desmayos; deterministas', () => {
    const contadores = { dias: 0, fin: 0 }
    const semillas = [42, 7, 1234]
    for (const semilla of semillas) {
      const b = nuevo(semilla)
      const ax = Math.floor(b.aparicion.x)
      const ay = Math.floor(b.aparicion.y)
      fc.assert(
        fc.property(arbPartida(ax, ay), (pasos) => {
          const fin = jugar(semilla, pasos, contadores)
          const otra = jugar(semilla, pasos, { dias: 0, fin: 0 })
          expect(JSON.stringify(otra)).toBe(JSON.stringify(fin))
        }),
        { numRuns: 60 },
      )
    }
    // Que el ataque llegue de verdad a terminar obras y cambiar de día.
    expect(contadores.dias).toBeGreaterThan(300)
    expect(contadores.fin).toBeGreaterThan(100)
  }, 120_000)
})
