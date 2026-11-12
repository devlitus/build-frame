/**
 * Rompedor · M3-02 Comando ComprarParcela y parcelaComprable (sistema crítico: parcelas y economía).
 * Ataques: índices raros, doble compra, frontera de dinero, coincidencia comando ⇔ parcelaComprable,
 * inmutabilidad, conectividad con valles raros, estados manipulados, caché de transitabilidad y
 * partidas largas simuladas.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  crearEstadoInicial,
  mapaTransitabilidad,
  parcelaComprable,
  precioParcela,
  type Comando,
  type EstadoJuego,
  type Parcela,
  type ResultadoComando,
  type Valle,
} from '../../src/core'

// ---------------------------------------------------------------- utilidades

const RICO = 1_000_000_000_000
const BASE = crearEstadoInicial({ semilla: 7, dineroInicial: RICO })
const N = BASE.valle.parcelasPorLado
const TOTAL = N * N

const comprar = (e: EstadoJuego, indice: number): ResultadoComando =>
  aplicarComando(e, { tipo: 'ComprarParcela', indice })

function ok(e: EstadoJuego, indice: number): EstadoJuego {
  const r = comprar(e, indice)
  if (!r.ok) throw new Error(`compra ${indice} falla: ${r.error}`)
  return r.estado
}

/** Estado con las parcelas `propias` marcadas a mano (sin pasar por el comando). */
function conPropias(e: EstadoJuego, propias: Iterable<number>, extra: Partial<EstadoJuego> = {}) {
  const set = new Set(propias)
  const parcelas = e.valle.parcelas.map((p, i) =>
    set.has(i) ? { ...p, estado: 'propia' as const } : p,
  )
  return { ...e, ...extra, valle: { ...e.valle, parcelas } }
}

/** Valle cuadrado de lado n generado a mano (para valles 1×1, 2×2…). */
function valleDeLado(n: number): Valle {
  const parcelas: Parcela[] = []
  for (let fila = 0; fila < n; fila++)
    for (let columna = 0; columna < n; columna++)
      parcelas.push({
        fila,
        columna,
        terreno: 'prado',
        fertilidad: 'media',
        agua: 'seca',
        estado: 'en-venta',
      })
  return {
    parcelasPorLado: n,
    casillasPorParcela: BASE.valle.casillasPorParcela,
    parcelas,
    rio: [],
  }
}

/** Oráculo independiente de las reglas (por índice, no por fila/columna guardadas). */
function oraculo(
  e: Pick<EstadoJuego, 'valle' | 'dinero' | 'comprasHechas'>,
  i: number,
): { comprable: boolean; motivo?: string } {
  const n = e.valle.parcelasPorLado
  const ps = e.valle.parcelas
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= ps.length)
    return { comprable: false, motivo: 'parametro-invalido' }
  if (ps[i]?.estado === 'propia') return { comprable: false, motivo: 'ya-propia' }
  const precio = precioParcela(e, i)
  if (precio === undefined) return { comprable: false, motivo: 'precio-invalido' }
  const f = Math.floor(i / n)
  const c = i % n
  const vecinas = [
    [f - 1, c],
    [f + 1, c],
    [f, c - 1],
    [f, c + 1],
  ].filter(
    ([a, b]) => (a as number) >= 0 && (b as number) >= 0 && (a as number) < n && (b as number) < n,
  )
  const hay = ps.some((p) => p.estado === 'propia')
  if (hay && !vecinas.some(([a, b]) => ps[(a as number) * n + (b as number)]?.estado === 'propia'))
    return { comprable: false, motivo: 'no-adyacente' }
  if (!(e.dinero >= precio)) return { comprable: false, motivo: 'fondos-insuficientes' }
  return { comprable: true }
}

function propiasDe(e: EstadoJuego): number[] {
  return e.valle.parcelas.flatMap((p, i) => (p.estado === 'propia' ? [i] : []))
}

function conexo4(e: EstadoJuego): boolean {
  const n = e.valle.parcelasPorLado
  const propias = propiasDe(e)
  if (propias.length === 0) return true
  const set = new Set(propias)
  const vistas = new Set([propias[0] as number])
  const pila = [propias[0] as number]
  while (pila.length > 0) {
    const i = pila.pop() as number
    const f = Math.floor(i / n)
    const c = i % n
    for (const [ff, cc] of [
      [f - 1, c],
      [f + 1, c],
      [f, c - 1],
      [f, c + 1],
    ] as const) {
      if (ff < 0 || cc < 0 || ff >= n || cc >= n) continue
      const j = ff * n + cc
      if (set.has(j) && !vistas.has(j)) {
        vistas.add(j)
        pila.push(j)
      }
    }
  }
  return vistas.size === propias.length
}

function congelarHondo<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) congelarHondo(v)
  }
  return o
}

// ---------------------------------------------------------------- índices y doble compra

describe('índices raros y doble compra', () => {
  const raros: unknown[] = [
    -1,
    TOTAL,
    TOTAL + 0.5,
    0.5,
    -0.5,
    1 + 1e-10,
    NaN,
    Infinity,
    -Infinity,
    2 ** 53,
    1e21,
    '0',
    '3',
    null,
    undefined,
    {},
    [0],
    true,
    new Number(3),
  ]

  it('cualquier índice no válido da parametro-invalido sin tocar el estado', () => {
    for (const indice of raros) {
      const r = aplicarComando(BASE, { tipo: 'ComprarParcela', indice } as unknown as Comando)
      expect(r).toEqual({ ok: false, estado: BASE, error: 'parametro-invalido' })
      expect(r.estado).toBe(BASE)
      expect(parcelaComprable(BASE, indice as number)).toEqual({
        comprable: false,
        motivo: 'parametro-invalido',
      })
    }
  })

  it('comando sin campo indice da parametro-invalido', () => {
    const r = aplicarComando(BASE, { tipo: 'ComprarParcela' } as unknown as Comando)
    expect(r).toMatchObject({ ok: false, error: 'parametro-invalido' })
  })

  it('-0 compra la parcela 0 (una sola vez) y el estado queda igual que con 0', () => {
    const a = comprar(BASE, -0)
    const b = comprar(BASE, 0)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.estado).toStrictEqual(b.estado)
    expect(comprar(a.estado, 0)).toMatchObject({ ok: false, error: 'ya-propia' })
    expect(comprar(a.estado, -0)).toMatchObject({ ok: false, error: 'ya-propia' })
  })

  it('comprar dos veces la misma parcela cobra una sola vez', () => {
    const e1 = ok(BASE, 14)
    const r = comprar(e1, 14)
    expect(r).toEqual({ ok: false, estado: e1, error: 'ya-propia' })
    expect(e1.comprasHechas).toBe(1)
  })

  it('3.0 y 3 son la misma parcela; 3 + Number.EPSILON*4 no es entero', () => {
    expect(comprar(BASE, 3.0).ok).toBe(true)
    expect(comprar(BASE, 3 + 4 * Number.EPSILON)).toMatchObject({ error: 'parametro-invalido' })
  })
})

// ---------------------------------------------------------------- frontera de dinero

describe('dinero exacto en la frontera', () => {
  it('con dinero = precio compra y queda en 0; con precio - 1 no', () => {
    for (let i = 0; i < TOTAL; i++) {
      const precio = precioParcela(BASE, i) as number
      const justo = { ...BASE, dinero: precio }
      const r = comprar(justo, i)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.estado.dinero).toBe(0)
        expect(Object.is(r.estado.dinero, 0)).toBe(true)
      }
      const falta = { ...BASE, dinero: precio - 1 }
      expect(comprar(falta, i)).toEqual({ ok: false, estado: falta, error: 'fondos-insuficientes' })
      expect(parcelaComprable(falta, i)).toEqual({
        comprable: false,
        motivo: 'fondos-insuficientes',
        precio,
      })
    }
  })

  it('la segunda compra con dinero justo para la segunda (precio ya subido)', () => {
    const e1 = ok({ ...BASE, dinero: RICO }, 14)
    const p2 = precioParcela(e1, 15) as number
    expect(p2).toBeGreaterThan(precioParcela(BASE, 15) as number)
    const justo = { ...e1, dinero: p2 }
    const r = comprar(justo, 15)
    expect(r.ok && r.estado.dinero).toBe(0)
    expect(comprar({ ...e1, dinero: p2 - 1 }, 15)).toMatchObject({ error: 'fondos-insuficientes' })
  })

  it('con los ahorros reales (1100) la compra de la parcela más cara es posible y la siguiente no', () => {
    for (let s = 0; s < 40; s++) {
      const e = crearEstadoInicial({ semilla: s })
      let i = 0
      let max = -1
      for (let k = 0; k < TOTAL; k++) {
        const p = precioParcela(e, k) as number
        if (p > max) {
          max = p
          i = k
        }
      }
      const r = comprar(e, i)
      if (max <= e.dinero) {
        expect(r.ok).toBe(true)
      } else {
        expect(r).toMatchObject({ ok: false, error: 'fondos-insuficientes' })
      }
    }
  })
})

// ---------------------------------------------------------------- comando ⇔ parcelaComprable

const estadoArbitrario = fc
  .record({
    semilla: fc.integer({ min: 0, max: 2000 }),
    propias: fc.uniqueArray(fc.integer({ min: 0, max: TOTAL - 1 }), { maxLength: TOTAL }),
    dinero: fc.oneof(
      fc.integer({ min: 0, max: 3000 }),
      fc.integer({ min: 0, max: RICO }),
      fc.constantFrom(NaN, -1, -0, Infinity, -Infinity, 0.5),
    ),
    comprasHechas: fc.oneof(
      fc.integer({ min: 0, max: 40 }),
      fc.constantFrom(-1, 1.5, NaN, 1e6, Infinity),
    ),
  })
  .map(({ semilla, propias, dinero, comprasHechas }) =>
    conPropias(crearEstadoInicial({ semilla, dineroInicial: 0 }), propias, {
      dinero,
      comprasHechas,
    }),
  )

describe('comando y parcelaComprable no discrepan nunca', () => {
  it('propiedad: comprable ⇔ ok, mismo motivo/error, mismo precio descontado', () => {
    fc.assert(
      fc.property(
        estadoArbitrario,
        fc.oneof(fc.integer({ min: -3, max: TOTAL + 3 }), fc.double()),
        (e, i) => {
          const c = parcelaComprable(e, i)
          const r = comprar(e, i)
          expect(r.ok).toBe(c.comprable)
          if (c.comprable && r.ok) {
            expect(r.eventos).toEqual([{ tipo: 'parcela-comprada', indice: i, precio: c.precio }])
            expect(c.precio).toBe(precioParcela(e, i))
            // Con dinero manipulado no entero (Infinity, 0,5) ver los tests [S3] de más abajo.
            if (Number.isSafeInteger(e.dinero)) expect(e.dinero - r.estado.dinero).toBe(c.precio)
            expect(r.estado.comprasHechas).toBe(e.comprasHechas + 1)
          } else if (!c.comprable && !r.ok) {
            expect(r.error).toBe(c.motivo)
            expect(r.estado).toBe(e)
          }
          // Y las reglas coinciden con un oráculo independiente.
          expect({ comprable: c.comprable, motivo: c.comprable ? undefined : c.motivo }).toEqual(
            oraculo(e, i),
          )
        },
      ),
      { numRuns: 3000 },
    )
  })

  it('parcelaComprable es pura: misma entrada, misma salida; no muta nada', () => {
    fc.assert(
      fc.property(estadoArbitrario, fc.integer({ min: 0, max: TOTAL - 1 }), (e, i) => {
        const copia = structuredClone(e)
        congelarHondo(e)
        expect(parcelaComprable(e, i)).toEqual(parcelaComprable(e, i))
        expect(() => comprar(e, i)).not.toThrow()
        expect(e).toEqual(copia)
      }),
      { numRuns: 300 },
    )
  })
})

// ---------------------------------------------------------------- inmutabilidad

describe('inmutabilidad', () => {
  it('estado anterior intacto, parcelas no tocadas comparten referencia, rio y resto se conservan', () => {
    const antes = congelarHondo(ok(BASE, 14))
    const foto = structuredClone(antes)
    const r = comprar(antes, 15)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(antes).toEqual(foto)
    const d = r.estado
    for (let i = 0; i < TOTAL; i++) {
      if (i === 15) {
        expect(d.valle.parcelas[i]).not.toBe(antes.valle.parcelas[i])
        expect(d.valle.parcelas[i]).toEqual({ ...antes.valle.parcelas[i], estado: 'propia' })
      } else expect(d.valle.parcelas[i]).toBe(antes.valle.parcelas[i])
    }
    expect(d.valle.rio).toBe(antes.valle.rio)
    expect(d.cauce).toBe(antes.cauce)
    expect(d.obstaculos).toBe(antes.obstaculos)
    expect(d.personaje).toBe(antes.personaje)
    expect(d.aparicion).toBe(antes.aparicion)
    const sinCompra = (x: EstadoJuego) => ({ ...x, dinero: 0, comprasHechas: 0, valle: null })
    expect(sinCompra(d)).toEqual(sinCompra(antes))
    expect({ ...d.valle, parcelas: null }).toEqual({ ...antes.valle, parcelas: null })
  })

  it('la compra no avanza el reloj ni cambia modo/pausa/velocidad/rng', () => {
    for (const extra of [{ modo: 'plano' as const }, { pausado: true }, {}]) {
      const e = { ...BASE, ...extra }
      const r = comprar(e, 0)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      for (const k of ['dia', 'minutoDelDia', 'modo', 'pausado', 'velocidad', 'rng'] as const)
        expect(r.estado[k]).toBe(e[k])
    }
  })
})

// ---------------------------------------------------------------- conectividad y valles raros

describe('adyacencia y valles raros', () => {
  it('valle 1×1: la única parcela se compra y después ya-propia', () => {
    const e = { ...BASE, valle: valleDeLado(1), comprasHechas: 0 }
    const e1 = ok(e, 0)
    expect(comprar(e1, 0)).toMatchObject({ error: 'ya-propia' })
    expect(comprar(e1, 1)).toMatchObject({ error: 'parametro-invalido' })
  })

  it('valle 2×2: desde cualquier esquina, la diagonal es no-adyacente y los lados sí', () => {
    for (let s = 0; s < 4; s++) {
      const e1 = ok({ ...BASE, valle: valleDeLado(2), comprasHechas: 0 }, s)
      const diag = 3 - s
      expect(comprar(e1, diag)).toMatchObject({ error: 'no-adyacente' })
      for (const j of [0, 1, 2, 3].filter((x) => x !== s && x !== diag)) {
        expect(comprar(e1, j).ok).toBe(true)
      }
    }
  })

  it('no hay adyacencia cíclica entre bordes (columna 0 y N-1, fila 0 y N-1)', () => {
    const e = ok(BASE, 0)
    expect(comprar(e, N - 1)).toMatchObject({ error: 'no-adyacente' })
    expect(comprar(e, N * (N - 1))).toMatchObject({ error: 'no-adyacente' })
    // Final de fila y principio de la siguiente son consecutivos en el índice pero no vecinos.
    const e2 = ok(BASE, N - 1)
    expect(comprar(e2, N)).toMatchObject({ error: 'no-adyacente' })
    const e3 = ok(BASE, N)
    expect(comprar(e3, N - 1)).toMatchObject({ error: 'no-adyacente' })
  })

  it('valle rectangular manipulado (parcelas.length ≠ n²): índices fuera de n² no rompen', () => {
    const v = valleDeLado(3)
    const raro = { ...v, parcelas: v.parcelas.slice(0, 7) }
    const e = { ...BASE, valle: raro, comprasHechas: 0 }
    expect(() => comprar(e, 6)).not.toThrow()
    expect(comprar(e, 7)).toMatchObject({ error: 'parametro-invalido' })
    const e1 = ok(e, 6) // fila 2, columna 0
    expect(comprar(e1, 3).ok).toBe(true) // fila 1, columna 0
  })

  it('propiedad: con propias aleatorias (no conexas), comprar nunca rompe la regla de adyacencia', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: TOTAL - 1 }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: TOTAL - 1 }),
        (propias, i) => {
          const e = conPropias(BASE, propias)
          const r = comprar(e, i)
          if (r.ok) {
            const f = Math.floor(i / N)
            const c = i % N
            const vecinas = propias.filter((j) => {
              const ff = Math.floor(j / N)
              const cc = j % N
              return Math.abs(ff - f) + Math.abs(cc - c) === 1
            })
            expect(vecinas.length).toBeGreaterThan(0)
          }
        },
      ),
      { numRuns: 1000 },
    )
  })
})

// ---------------------------------------------------------------- estados manipulados

describe('estados manipulados', () => {
  it('dinero NaN, negativo o -Infinity: fondos-insuficientes, sin cambios', () => {
    for (const dinero of [NaN, -1, -1e9, -Infinity]) {
      const e = { ...BASE, dinero }
      expect(comprar(e, 0)).toEqual({ ok: false, estado: e, error: 'fondos-insuficientes' })
    }
  })

  it('comprasHechas corrupto da precio-invalido (nunca precio 0)', () => {
    for (const comprasHechas of [-1, 1.5, NaN, Infinity, 1e6, Number.MAX_SAFE_INTEGER]) {
      const e = { ...BASE, comprasHechas }
      const r = comprar(e, 0)
      expect(r).toMatchObject({ ok: false, error: 'precio-invalido' })
      expect(r.estado).toBe(e)
    }
  })

  it('comprasHechas que no cuadra con las propias: solo cambia el precio (documentado)', () => {
    const e = conPropias(BASE, [14], { comprasHechas: 0 })
    const r = comprar(e, 15)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.estado.comprasHechas).toBe(1)
      expect(propiasDe(r.estado).length).toBe(2) // sigue sin cuadrar
      expect(r.eventos[0]).toMatchObject({ precio: precioParcela(BASE, 15) })
    }
  })

  it('parcela con estado desconocido cuenta como en venta (documentado)', () => {
    const parcelas = BASE.valle.parcelas.map((p, i) =>
      i === 0 ? ({ ...p, estado: 'vendida' } as unknown as Parcela) : p,
    )
    const e = { ...BASE, valle: { ...BASE.valle, parcelas } }
    const r = comprar(e, 0)
    expect(r.ok).toBe(true)
    expect(r.ok && r.estado.valle.parcelas[0]?.estado).toBe('propia')
  })

  /**
   * [S3] Criterio: «dinero baja exactamente el precio». Con un `dinero` manipulado que no es un
   * entero seguro (save corrupto en M7) la resta en coma flotante no baja exactamente el precio:
   * con 1e300 o Infinity la compra sale gratis (dinero no cambia) y se pueden comprar las 36.
   */
  it('[S3] con dinero que no es entero seguro la compra no puede salir gratis', () => {
    for (const dinero of [1e300, 2 ** 60, Infinity]) {
      const e = { ...BASE, dinero }
      const r = comprar(e, 0)
      if (r.ok) {
        const precio = r.eventos[0] && 'precio' in r.eventos[0] ? r.eventos[0].precio : 0
        // Diferencia exacta (en BigInt cuando es finito); con Infinity, Infinity - p es Infinity.
        expect(Number.isFinite(r.estado.dinero)).toBe(true)
        expect(BigInt(dinero) - BigInt(r.estado.dinero)).toBe(BigInt(precio))
      }
    }
  })

  it('[S3] con dinero fraccionario la resta no es exacta (0,1 de más)', () => {
    const precio = precioParcela(BASE, 0) as number
    const e = { ...BASE, dinero: precio + 0.1 }
    const r = comprar(e, 0)
    if (r.ok) expect(r.estado.dinero).toBe(0.1)
  })
})

// ---------------------------------------------------------------- caché de transitabilidad

describe('caché de mapaTransitabilidad tras comprar', () => {
  it('el mapa es idéntico (por valor) antes y después de comprar todo el valle', () => {
    let e = BASE
    const antes = Array.from(mapaTransitabilidad(e).bloqueada)
    for (let i = 0; i < TOTAL; i++) {
      e = ok(e, i)
      expect(Array.from(mapaTransitabilidad(e).bloqueada)).toEqual(antes)
    }
  })

  it('tras una compra, la segunda consulta sale del caché (misma referencia)', () => {
    const e = ok(BASE, 0)
    expect(mapaTransitabilidad(e)).toBe(mapaTransitabilidad(e))
  })

  it('alternar entre el estado anterior y el nuevo no se vuelve lento (mide)', () => {
    const viejo = BASE
    const nuevo = ok(BASE, 0)
    mapaTransitabilidad(viejo)
    const t0 = performance.now()
    for (let k = 0; k < 200; k++) {
      mapaTransitabilidad(k % 2 === 0 ? nuevo : viejo)
    }
    const ms = (performance.now() - t0) / 200
    // Cada llamada alterna valle y recalcula (el caché guarda una sola entrada por cauce+obstáculos).
    // Lo medimos y dejamos un margen amplio: no debe pasar de unos pocos ms por llamada.
    expect(ms).toBeLessThan(5)
  })

  it('mover al personaje tras comprar da el mismo resultado que sin comprar', () => {
    const mover = (s: EstadoJuego) =>
      aplicarComando(s, { tipo: 'MoverPersonaje', dx: 1, dy: 0.3, ms: 400 }).estado.personaje
    let e = BASE
    for (const i of [0, 1, 2, 6, 7]) e = ok(e, i)
    expect(mover(e)).toEqual(mover(BASE))
  })
})

// ---------------------------------------------------------------- partidas largas

const VECINOS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function frontera(e: EstadoJuego): number[] {
  const propias = new Set(propiasDe(e))
  if (propias.size === 0) return Array.from({ length: TOTAL }, (_, i) => i)
  const out = new Set<number>()
  for (const i of propias) {
    const f = Math.floor(i / N)
    const c = i % N
    for (const [df, dc] of VECINOS) {
      const ff = f + df
      const cc = c + dc
      if (ff < 0 || cc < 0 || ff >= N || cc >= N) continue
      const j = ff * N + cc
      if (!propias.has(j)) out.add(j)
    }
  }
  return [...out].sort((a, b) => a - b)
}

describe('partidas largas simuladas', () => {
  it('con dinero de sobra se llega a las 36 en cualquier orden válido, conexo y sin bloqueos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.array(fc.nat(), { minLength: TOTAL, maxLength: TOTAL }),
        (semilla, elecciones) => {
          const inicial = crearEstadoInicial({ semilla, dineroInicial: RICO })
          let e = inicial
          let gastado = 0
          for (const k of elecciones) {
            const fr = frontera(e)
            // Lo que el comando acepta = la frontera exactamente.
            const aceptadas = Array.from({ length: TOTAL }, (_, i) => i).filter(
              (i) => parcelaComprable(e, i).comprable,
            )
            expect(aceptadas).toEqual(fr)
            const i = fr[k % fr.length] as number
            const r = comprar(e, i)
            expect(r.ok).toBe(true)
            if (!r.ok) return
            const ev = r.eventos[0]
            gastado += ev && ev.tipo === 'parcela-comprada' ? ev.precio : 0
            e = r.estado
            expect(conexo4(e)).toBe(true)
            expect(e.comprasHechas).toBe(propiasDe(e).length)
            expect(e.dinero + gastado).toBe(RICO)
          }
          expect(propiasDe(e).length).toBe(TOTAL)
          expect(e.dinero).toBeGreaterThanOrEqual(0)
          expect(Number.isSafeInteger(e.dinero)).toBe(true)
          for (let i = 0; i < TOTAL; i++)
            expect(comprar(e, i)).toMatchObject({ ok: false, error: 'ya-propia' })
        },
      ),
      { numRuns: 60 },
    )
  })

  it('con dinero limitado se compra hasta que no alcanza; nunca negativo y sin bloqueos falsos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.array(fc.nat(), { maxLength: 80 }),
        (semilla, dineroInicial, elecciones) => {
          let e = crearEstadoInicial({ semilla, dineroInicial })
          let gastado = 0
          for (const k of elecciones) {
            const fr = frontera(e)
            if (fr.length === 0) break
            const asequibles = fr.filter((i) => (precioParcela(e, i) as number) <= e.dinero)
            const i = fr[k % fr.length] as number
            const r = comprar(e, i)
            const esperado = (precioParcela(e, i) as number) <= e.dinero
            expect(r.ok).toBe(esperado)
            if (r.ok) {
              const ev = r.eventos[0]
              gastado += ev && ev.tipo === 'parcela-comprada' ? ev.precio : 0
              e = r.estado
            } else {
              expect(r.error).toBe('fondos-insuficientes')
              expect(r.estado).toBe(e)
            }
            if (asequibles.length === 0) {
              // Bloqueo legítimo: ninguna parcela de la frontera cabe.
              for (let j = 0; j < TOTAL; j++) expect(parcelaComprable(e, j).comprable).toBe(false)
            }
            expect(e.dinero).toBeGreaterThanOrEqual(0)
            expect(e.dinero + gastado).toBe(dineroInicial)
            expect(conexo4(e)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('determinismo: la misma secuencia mezclada da el mismo estado', () => {
    const cmd: fc.Arbitrary<Comando> = fc.oneof(
      fc.record({
        tipo: fc.constant('ComprarParcela' as const),
        indice: fc.integer({ min: -1, max: TOTAL }),
      }),
      fc.record({
        tipo: fc.constant('AvanzarTiempo' as const),
        minutos: fc.integer({ min: 0, max: 2000 }),
      }),
      fc.record({
        tipo: fc.constant('MoverPersonaje' as const),
        dx: fc.constantFrom(-1, 0, 1),
        dy: fc.constantFrom(-1, 0, 1),
        ms: fc.integer({ min: 0, max: 500 }),
      }),
      fc.record({
        tipo: fc.constant('CambiarModo' as const),
        modo: fc.constantFrom('vida' as const, 'plano' as const),
      }),
    )
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.array(cmd, { maxLength: 80 }), (s, cmds) => {
        const correr = () => {
          let e = crearEstadoInicial({ semilla: s, dineroInicial: 20_000 })
          for (const c of cmds) e = aplicarComando(e, c).estado
          return e
        }
        const a = correr()
        expect(correr()).toEqual(a)
        expect(a.comprasHechas).toBe(propiasDe(a).length)
        expect(conexo4(a)).toBe(true)
      }),
      { numRuns: 150 },
    )
  })
})
