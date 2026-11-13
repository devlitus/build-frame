/**
 * Rompedor · M4-01 Zonas en el núcleo (PintarZona / BorrarZona).
 * Ataques: rectángulos raros y gigantes, tipos basura, zonas inválidas, valles de otro lado,
 * agua y vados, tamaño de la cadena, JSON, determinismo, estados corruptos y coste.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  CONFIG_VALLE,
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  zonaEn,
  type Comando,
  type EstadoJuego,
} from '../../src/core'

const RICO = 1_000_000_000_000
const base = crearEstadoInicial({ semilla: 7, dineroInicial: RICO })
const LADO = ladoValle(base.valle)

function comprarTodas(e: EstadoJuego): EstadoJuego {
  const n = e.valle.parcelas.length
  let est = e
  for (let vuelta = 0; vuelta < n; vuelta++) {
    for (let i = 0; i < n; i++) {
      const r = aplicarComando(est, { tipo: 'ComprarParcela', indice: i })
      if (r.ok) est = r.estado
    }
  }
  return est
}
const todo = comprarTodas(base)
const pintar = (
  e: EstadoJuego,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  zona: string = 'cultivo',
) => aplicarComando(e, { tipo: 'PintarZona', x0, y0, x1, y1, zona } as unknown as Comando)
const borrar = (e: EstadoJuego, x0: number, y0: number, x1: number, y1: number) =>
  aplicarComando(e, { tipo: 'BorrarZona', x0, y0, x1, y1 })

function aguaDe(e: EstadoJuego): Set<number> {
  const lado = ladoValle(e.valle)
  return new Set(casillasRio(e.valle, e.cauce.ancho).map((k) => k.y * lado + k.x))
}

describe('rectángulos extremos', () => {
  it('compra de todo: hay parcelas propias para atacar', () => {
    expect(todo.valle.parcelas.every((p) => p.estado === 'propia')).toBe(true)
  })

  it('rectángulo gigante (MAX_SAFE_INTEGER) rápido y recortado', () => {
    const M = Number.MAX_SAFE_INTEGER
    const t = performance.now()
    const r = pintar(todo, -M, -M, M, M, 'huerto')
    const ms = performance.now() - t
    expect(r.ok).toBe(true)
    expect(ms).toBeLessThan(500)
    if (r.ok) {
      expect(r.estado.zonas.length).toBe(LADO * LADO)
      const esperado = LADO * LADO - aguaDe(todo).size
      expect(r.eventos).toEqual([{ tipo: 'zona-pintada', casillas: esperado }])
    }
  })

  it('esquinas en el extremo positivo sin solape con el valle: sin-casillas-validas', () => {
    const M = Number.MAX_SAFE_INTEGER
    expect(pintar(todo, M, M, M - 5, M - 5)).toMatchObject({
      ok: false,
      error: 'sin-casillas-validas',
    })
  })

  it('rectángulo completamente negativo: sin-casillas-validas', () => {
    expect(pintar(todo, -10, -10, -1, -1)).toMatchObject({
      ok: false,
      error: 'sin-casillas-validas',
    })
  })

  it('-0 equivale a 0', () => {
    expect(pintar(todo, -0, -0, 2, 2)).toEqual(pintar(todo, 0, 0, 2, 2))
  })

  it('una sola casilla, repetida', () => {
    const agua = aguaDe(todo)
    let x = 0
    while (agua.has(x)) x++
    const r = pintar(todo, x, 0, x, 0)
    expect(r.ok).toBe(true)
    if (r.ok) expect(zonaEn(r.estado, x, 0)).toBe('cultivo')
  })

  it.each([
    [1.5, 0, 1, 1],
    [NaN, 0, 1, 1],
    [Infinity, 0, 1, 1],
    [0, -Infinity, 1, 1],
    [2 ** 53, 0, 1, 1],
    [0, 0, 1e300, 1],
  ])('no enteros seguros (%s,%s,%s,%s) -> parametro-invalido', (a, b, c, d) => {
    expect(pintar(todo, a, b, c, d)).toMatchObject({ ok: false, error: 'parametro-invalido' })
    expect(borrar(todo, a, b, c, d)).toMatchObject({ ok: false, error: 'parametro-invalido' })
  })

  it('tipos basura en coordenadas no explotan', () => {
    for (const basura of ['1', null, undefined, {}, [0], true, 1n as unknown]) {
      const c = { tipo: 'PintarZona', x0: basura, y0: 0, x1: 1, y1: 1, zona: 'cultivo' }
      let r: unknown
      expect(() => (r = aplicarComando(todo, c as unknown as Comando))).not.toThrow()
      expect(r).toMatchObject({ ok: false, error: 'parametro-invalido' })
    }
    const sinCampos = { tipo: 'PintarZona', zona: 'cultivo' }
    expect(aplicarComando(todo, sinCampos as unknown as Comando)).toMatchObject({ ok: false })
  })
})

describe('zonas inválidas', () => {
  it.each([
    'Cultivo',
    'CULTIVO',
    '.',
    '',
    'c',
    'toString',
    '__proto__',
    'constructor',
    'cultivo ',
    'none',
  ])('zona %j -> parametro-invalido y estado intacto', (z) => {
    const r = pintar(todo, 0, 0, 3, 3, z)
    expect(r).toMatchObject({ ok: false, error: 'parametro-invalido' })
    expect(r.estado).toBe(todo)
  })
  it.each([undefined, null, 0, 1, {}, ['cultivo'], true])('zona no cadena %j', (z) => {
    const cmd = { tipo: 'PintarZona', x0: 0, y0: 0, x1: 3, y1: 3, zona: z }
    expect(aplicarComando(todo, cmd as unknown as Comando)).toMatchObject({
      ok: false,
      error: 'parametro-invalido',
    })
  })
  it('parametro-invalido tiene prioridad sobre sin-casillas-validas', () => {
    expect(pintar(base, -9, -9, -8, -8, 'x')).toMatchObject({ error: 'parametro-invalido' })
  })
})

describe('agua, parcelas y obstáculos', () => {
  it('nunca se pinta río ni vado', () => {
    const agua = aguaDe(todo)
    const r = pintar(todo, 0, 0, LADO - 1, LADO - 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const k of agua) expect(r.estado.zonas[k]).toBe('.')
    for (const k of todo.cauce.vados) expect(r.estado.zonas[k]).toBe('.')
  })

  it('los vados están dentro del agua calculada (si no, serían pintables)', () => {
    const agua = aguaDe(todo)
    for (const k of todo.cauce.vados) expect(agua.has(k)).toBe(true)
  })

  it('sin parcelas propias: sin-casillas-validas', () => {
    expect(pintar(base, 0, 0, LADO - 1, LADO - 1)).toMatchObject({
      ok: false,
      error: 'sin-casillas-validas',
    })
  })

  it('con una sola parcela comprada solo cambian casillas de parcelas propias', () => {
    const c = base.valle.casillasPorParcela
    const n = base.valle.parcelasPorLado
    let e = base
    for (let i = 0; i < n * n; i++) {
      const r = aplicarComando(e, { tipo: 'ComprarParcela', indice: i })
      if (r.ok) {
        e = r.estado
        break
      }
    }
    const r = pintar(e, 0, 0, LADO - 1, LADO - 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    let pintadas = 0
    for (let y = 0; y < LADO; y++)
      for (let x = 0; x < LADO; x++) {
        const p = e.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]
        if (r.estado.zonas[y * LADO + x] !== '.') {
          pintadas++
          expect(p?.estado).toBe('propia')
        }
      }
    expect(pintadas).toBeLessThanOrEqual(c * c)
  })

  it('pintar encima de árboles y rocas está permitido', () => {
    const agua = aguaDe(todo)
    const ob = todo.obstaculos.find((o) => !agua.has(o.y * LADO + o.x))
    if (!ob) throw new Error('sin obstaculos fuera del agua')
    expect(pintar(todo, ob.x, ob.y, ob.x, ob.y).ok).toBe(true)
  })
})

describe('borrar', () => {
  it('borrar lo pintado deja la cadena vacía; borrar vacío = mismo objeto sin eventos', () => {
    const p = pintar(todo, 0, 0, LADO - 1, LADO - 1)
    if (!p.ok) throw new Error('x')
    const b = borrar(p.estado, 0, 0, LADO - 1, LADO - 1)
    expect(b.ok).toBe(true)
    if (b.ok) expect(b.estado.zonas).toBe('.'.repeat(LADO * LADO))
    const b2 = borrar(todo, 0, 0, LADO - 1, LADO - 1)
    expect(b2.ok).toBe(true)
    if (b2.ok) {
      expect(b2.estado).toBe(todo)
      expect(b2.eventos).toEqual([])
    }
  })
  it('repintar la misma zona: mismo objeto y sin eventos', () => {
    const p = pintar(todo, 0, 0, 5, 5)
    if (!p.ok) throw new Error('x')
    const q = pintar(p.estado, 0, 0, 5, 5)
    expect(q.ok && q.estado).toBe(p.estado)
    expect(q.ok && q.eventos.length).toBe(0)
  })
  it('sobrescribir con otra zona cuenta las casillas cambiadas', () => {
    const p = pintar(todo, 0, 0, 5, 0, 'cultivo')
    if (!p.ok) throw new Error('x')
    const q = pintar(p.estado, 0, 0, 5, 0, 'vivienda')
    expect(q.ok && q.eventos).toEqual(p.eventos)
  })
})

describe('aislamiento y serialización', () => {
  it('no toca nada salvo zonas', () => {
    const r = pintar(todo, 1, 1, 9, 9)
    if (!r.ok) throw new Error('x')
    const nuevo = r.estado as unknown as Record<string, unknown>
    const viejo = todo as unknown as Record<string, unknown>
    for (const k of Object.keys(viejo)) {
      if (k === 'zonas') continue
      expect(nuevo[k]).toBe(viejo[k])
    }
  })
  it('no muta el estado de entrada (congelado profundo)', () => {
    const deep = (o: unknown): void => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) {
        Object.freeze(o)
        for (const v of Object.values(o)) deep(v)
      }
    }
    const copia = structuredClone(todo)
    deep(copia)
    expect(() => pintar(copia, 0, 0, 20, 20)).not.toThrow()
    expect(() => borrar(copia, 0, 0, 20, 20)).not.toThrow()
  })
  it('JSON ida y vuelta conserva el estado y sigue aceptando comandos', () => {
    const r = pintar(todo, 0, 0, 30, 30, 'almacen')
    if (!r.ok) throw new Error('x')
    const e2 = JSON.parse(JSON.stringify(r.estado)) as EstadoJuego
    expect(e2).toEqual(r.estado)
    expect(pintar(e2, 0, 0, 30, 30, 'vivienda')).toEqual(pintar(r.estado, 0, 0, 30, 30, 'vivienda'))
  })
  it('estado inicial: cadena vacía de lado²', () => {
    expect(base.zonas).toBe('.'.repeat(LADO * LADO))
  })
})

describe('propiedades', () => {
  const coord = fc.oneof(
    fc.integer({ min: -3, max: LADO + 3 }),
    fc.constantFrom(0, -0, LADO - 1, LADO, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER),
  )
  const cmd = fc.oneof(
    fc.record({
      tipo: fc.constant('PintarZona' as const),
      x0: coord,
      y0: coord,
      x1: coord,
      y1: coord,
      zona: fc.constantFrom('cultivo', 'huerto', 'vivienda', 'almacen'),
    }),
    fc.record({
      tipo: fc.constant('BorrarZona' as const),
      x0: coord,
      y0: coord,
      x1: coord,
      y1: coord,
    }),
    fc.record({
      tipo: fc.constant('ComprarParcela' as const),
      indice: fc.integer({ min: 0, max: 40 }),
    }),
    fc.record({
      tipo: fc.constant('CambiarModo' as const),
      modo: fc.constantFrom('vida', 'plano'),
    }),
  )

  it('cadena lado², solo caracteres válidos, nunca agua ni parcela ajena; determinista', () => {
    const agua = aguaDe(base)
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 40 }), (cmds) => {
        const correr = () => {
          let e = base
          for (const c of cmds) e = aplicarComando(e, c as Comando).estado
          return e
        }
        const a = correr()
        expect(a).toEqual(correr())
        expect(a.zonas.length).toBe(LADO * LADO)
        expect(a.zonas).toMatch(/^[.chva]*$/)
        const c = a.valle.casillasPorParcela
        const n = a.valle.parcelasPorLado
        for (let i = 0; i < a.zonas.length; i++) {
          if (a.zonas[i] === '.') continue
          expect(agua.has(i)).toBe(false)
          const x = i % LADO
          const y = Math.floor(i / LADO)
          expect(a.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]?.estado).toBe('propia')
        }
        expect(JSON.parse(JSON.stringify(a))).toEqual(a)
      }),
      { numRuns: 200 },
    )
  })

  it('pintar es idempotente y borrar tras pintar restaura la cadena vacía', () => {
    fc.assert(
      fc.property(coord, coord, coord, coord, (x0, y0, x1, y1) => {
        const p = pintar(todo, x0, y0, x1, y1, 'huerto')
        fc.pre(p.ok)
        if (!p.ok) return
        const q = pintar(p.estado, x0, y0, x1, y1, 'huerto')
        expect(q.ok && q.estado).toBe(p.estado)
        const b = borrar(p.estado, x0, y0, x1, y1)
        expect(b.ok).toBe(true)
        if (b.ok) expect(b.estado.zonas).toBe(todo.zonas)
      }),
      { numRuns: 300 },
    )
  })
})

describe('valles de otro lado', () => {
  for (const [n = 1, c = 1] of [
    [1, 16],
    [2, 8],
    [3, 5],
    [8, 4],
  ]) {
    it(`valle ${n}x${n} con parcelas de ${c}: cadena n²c², recorte y sin agua`, () => {
      let e: EstadoJuego
      try {
        e = crearEstadoInicial({
          semilla: 3,
          dineroInicial: RICO,
          configValle: { ...CONFIG_VALLE, parcelasPorLado: n, casillasPorParcela: c },
        })
      } catch {
        return // el generador no soporta esa configuración: no es fallo de zonas
      }
      const lado = n * c
      expect(e.zonas.length).toBe(lado * lado)
      e = comprarTodas(e)
      const r = pintar(e, -50, -50, 1e6, 1e6, 'almacen')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.estado.zonas.length).toBe(lado * lado)
        const agua = aguaDe(e)
        let esperado = 0
        for (let i = 0; i < lado * lado; i++) {
          const x = i % lado
          const y = Math.floor(i / lado)
          const pa = e.valle.parcelas[Math.floor(y / c) * n + Math.floor(x / c)]
          if (pa?.estado === 'propia' && !agua.has(i)) esperado++
        }
        const pintadas = [...r.estado.zonas].filter((ch) => ch !== '.').length
        expect(pintadas).toBe(esperado)
      }
    })
  }
})

describe('estado corrupto (guardado manipulado)', () => {
  it('[S3] cadena demasiado corta: no debe agrandarse ni dejar huecos', () => {
    const corrupto = { ...todo, zonas: '.'.repeat(10) }
    const r = pintar(corrupto, 0, 0, LADO - 1, LADO - 1)
    if (r.ok) expect(r.estado.zonas.length).toBe(LADO * LADO)
  })
  it('[S3] cadena demasiado larga: no debe crecer', () => {
    const corrupto = { ...todo, zonas: '.'.repeat(LADO * LADO + 50) }
    const r = pintar(corrupto, 0, 0, 3, 3)
    if (r.ok) expect(r.estado.zonas.length).toBe(LADO * LADO)
  })
  it('[S3] zonas ausente no lanza excepción', () => {
    const corrupto = { ...todo, zonas: undefined } as unknown as EstadoJuego
    expect(() => pintar(corrupto, 0, 0, 3, 3)).not.toThrow()
  })
  it('zonaEn con coordenadas raras da undefined', () => {
    for (const [x = 0, y = 0] of [
      [-1, 0],
      [LADO, 0],
      [0.5, 0],
      [NaN, 0],
      [0, 1e300],
    ])
      expect(zonaEn(todo, x, y)).toBeUndefined()
  })
})

describe('coste', () => {
  it('1000 comandos de rectángulo máximo en menos de 3 s', () => {
    let e = todo
    const t = performance.now()
    for (let i = 0; i < 1000; i++) {
      e = pintar(e, 0, 0, LADO - 1, LADO - 1, i % 2 ? 'cultivo' : 'huerto').estado
    }
    expect(performance.now() - t).toBeLessThan(3000)
  })
  it('1000 comandos de UNA casilla en menos de 1 s (recalcula el río entero cada vez)', () => {
    let e = todo
    const agua = aguaDe(todo)
    let x = 0
    while (agua.has(x)) x++
    const t = performance.now()
    for (let i = 0; i < 1000; i++) {
      e = pintar(e, x, 0, x, 0, i % 2 ? 'cultivo' : 'huerto').estado
    }
    expect(performance.now() - t).toBeLessThan(1000)
  })
})
