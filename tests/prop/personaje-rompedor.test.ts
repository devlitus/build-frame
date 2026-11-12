import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillaBloqueada,
  casillasRio,
  claveCasilla,
  CONFIG_PERSONAJE,
  CONFIG_VALLE,
  crearEstadoInicial,
  ladoValle,
  mapaTransitabilidad,
  type Comando,
  type ConfigValle,
  type EstadoJuego,
} from '../../src/core'

const M = CONFIG_PERSONAJE.tamanoCaja / 2
const ini = (semilla: number, configValle?: ConfigValle): EstadoJuego =>
  crearEstadoInicial({ semilla, dineroInicial: 0, ...(configValle ? { configValle } : {}) })

function cajaLibre(e: EstadoJuego): boolean {
  const mapa = mapaTransitabilidad(e)
  const { x, y } = e.personaje
  const esquinas = [
    [x - M, y - M],
    [x + M - 1e-9, y - M],
    [x - M, y + M - 1e-9],
    [x + M - 1e-9, y + M - 1e-9],
  ] as const
  return esquinas.every(([a, b]) => !casillaBloqueada(mapa, Math.floor(a), Math.floor(b)))
}

function mover(e: EstadoJuego, dx: number, dy: number, ms: number): EstadoJuego {
  return aplicarComando(e, { tipo: 'MoverPersonaje', dx, dy, ms }).estado
}

function agua(e: EstadoJuego): Set<number> {
  const lado = ladoValle(e.valle)
  return new Set(
    casillasRio(e.valle, e.cauce.ancho)
      .map((c) => claveCasilla(lado, c.x, c.y))
      .filter((k) => !e.cauce.vados.includes(k)),
  )
}

describe('rompedor M2-02: conectividad y vados', () => {
  it('todo el suelo libre es alcanzable en 400 semillas (los vados cruzan el cauce)', () => {
    const malas: number[] = []
    for (let i = 0; i < 400; i++) {
      const s = (i * 2654435761) >>> 0
      const e = ini(s)
      const mapa = mapaTransitabilidad(e)
      const lado = ladoValle(e.valle)
      const a = agua(e)
      const obs = new Set(e.obstaculos.map((o) => claveCasilla(lado, o.x, o.y)))
      let aisladas = 0
      for (let k = 0; k < lado * lado; k++) {
        if (!a.has(k) && !obs.has(k) && mapa.bloqueada[k] === 1) aisladas++
      }
      if (aisladas > 0) malas.push(s)
    }
    expect(malas).toEqual([])
  })

  const extremos: [string, Partial<ConfigValle>][] = [
    ['1x1 parcelas', { parcelasPorLado: 1 }],
    ['casillasPorParcela 1', { casillasPorParcela: 1 }],
    ['casillasPorParcela 2', { casillasPorParcela: 2 }],
    ['casillasPorParcela 3', { casillasPorParcela: 3 }],
    [
      'densidad maxima',
      {
        densidadDecoracion: {
          prado: { arbol: 1, roca: 0 },
          bosque: { arbol: 0.5, roca: 0.5 },
          rocoso: { arbol: 0, roca: 1 },
        },
      },
    ],
    ['vados enormes', { vados: { min: 64, max: 64, grosor: 64 } }],
    ['ancho 64', { anchoRio: 64 }],
    ['2x2 casillas 1', { parcelasPorLado: 2, casillasPorParcela: 1 }],
  ]
  for (const [nombre, cfg] of extremos) {
    it(`config extrema (${nombre}): serializable y aparicion en casilla libre`, () => {
      const configValle = { ...CONFIG_VALLE, ...cfg } as ConfigValle
      for (const s of [0, 1, 42, 2 ** 32 - 1, 123456789]) {
        const e = ini(s, configValle)
        expect(JSON.parse(JSON.stringify(e))).toEqual(e)
        const lado = ladoValle(e.valle)
        const cx = Math.floor(e.aparicion.x)
        const cy = Math.floor(e.aparicion.y)
        expect(cx).toBeGreaterThanOrEqual(0)
        expect(cy).toBeGreaterThanOrEqual(0)
        expect(cx).toBeLessThan(lado)
        expect(cy).toBeLessThan(lado)
        expect(mapaTransitabilidad(e).bloqueada[cy * lado + cx]).toBe(0)
        const f = mover(mover(e, 1, 1, 250), -1, 0, 250)
        expect(Number.isFinite(f.personaje.x)).toBe(true)
      }
    })
  }
})

describe('rompedor M2-02: colisiones', () => {
  it('nunca queda con la caja sobre casilla bloqueada ni fuera del valle', () => {
    const eje = fc.oneof(
      fc.constantFrom(-1, 0, 1, 1e-300, -1e-300, -0),
      fc.double({ min: -1, max: 1, noNaN: true }),
    )
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(
          fc.record({
            dx: eje,
            dy: eje,
            ms: fc.oneof(
              fc.integer({ min: 0, max: 20 }),
              fc.double({ min: 0, max: 5000, noNaN: true }),
            ),
          }),
          { maxLength: 150 },
        ),
        (s, cs) => {
          let e = ini(s)
          for (const c of cs) {
            e = mover(e, c.dx, c.dy, c.ms)
            if (!cajaLibre(e)) return false
          }
          return true
        },
      ),
      { numRuns: 60 },
    )
  })

  it('empuja contra cada borde del valle sin salir', () => {
    for (const s of [1, 2, 3]) {
      let e = ini(s)
      const lado = ladoValle(e.valle)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ] as const
      for (const [dx, dy] of dirs) {
        for (let i = 0; i < 400; i++) e = mover(e, dx, dy, 250)
        expect(e.personaje.x).toBeGreaterThanOrEqual(M)
        expect(e.personaje.y).toBeGreaterThanOrEqual(M)
        expect(e.personaje.x).toBeLessThanOrEqual(lado - M)
        expect(e.personaje.y).toBeLessThanOrEqual(lado - M)
        expect(cajaLibre(e)).toBe(true)
      }
    }
  })

  it('parametros invalidos se rechazan', () => {
    const e = ini(5)
    const malos: Comando[] = [
      { tipo: 'MoverPersonaje', dx: NaN, dy: 0, ms: 10 },
      { tipo: 'MoverPersonaje', dx: 0, dy: Infinity, ms: 10 },
      { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: -1 },
      { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: NaN },
      { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: Infinity },
      { tipo: 'MoverPersonaje', dx: 1.0000001, dy: 0, ms: 10 },
    ]
    for (const c of malos) expect(aplicarComando(e, c).ok).toBe(false)
  })

  it('la distancia de un comando no supera velocidad*ms (diagonal normalizada)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 600 }),
        (dx, dy, ms) => {
          const e = ini(9)
          const f = mover(e, dx, dy, ms)
          const d = Math.hypot(f.personaje.x - e.personaje.x, f.personaje.y - e.personaje.y)
          const tope = (CONFIG_PERSONAJE.velocidadCasillasPorSegundo * Math.min(ms, 250)) / 1000
          return d <= tope + 1e-9
        },
      ),
      { numRuns: 200 },
    )
  })

  it('no se atasca: de una casilla libre a su vecina libre (este y sur)', () => {
    const fallos: string[] = []
    for (const s of [3, 11, 99]) {
      const e = ini(s)
      const lado = ladoValle(e.valle)
      const mapa = mapaTransitabilidad(e)
      const en = (x: number, y: number): EstadoJuego => ({
        ...e,
        personaje: { x: x + 0.5, y: y + 0.5, orientacion: 'sur' },
      })
      for (let y = 0; y < lado - 1; y++)
        for (let x = 0; x < lado - 1; x++) {
          if (mapa.bloqueada[y * lado + x]) continue
          if (!mapa.bloqueada[y * lado + x + 1]) {
            let t = en(x, y)
            for (let i = 0; i < 3; i++) t = mover(t, 1, 0, 250)
            if (t.personaje.x < x + 1.5 - 1e-6) fallos.push(`s${s} (${x},${y}) este`)
          }
          if (!mapa.bloqueada[(y + 1) * lado + x]) {
            let t = en(x, y)
            for (let i = 0; i < 3; i++) t = mover(t, 0, 1, 250)
            if (t.personaje.y < y + 1.5 - 1e-6) fallos.push(`s${s} (${x},${y}) sur`)
          }
        }
    }
    expect(fallos.slice(0, 10)).toEqual([])
  })

  it('1000 comandos de 0.001 ms equivalen a uno de 1 ms', () => {
    const e = ini(21)
    let a = e
    for (let i = 0; i < 1000; i++) a = mover(a, 1, 0, 0.001)
    const b = mover(e, 1, 0, 1)
    expect(Math.abs(a.personaje.x - b.personaje.x)).toBeLessThan(1e-6)
    expect(cajaLibre(a)).toBe(true)
  })

  it('no se pisa el agua fuera de vado (paseo aleatorio)', () => {
    for (const s of [4, 8, 15, 16, 23, 42]) {
      let e = ini(s)
      const lado = ladoValle(e.valle)
      const a = agua(e)
      const dirs =
        fc.sample(
          fc.array(fc.tuple(fc.constantFrom(-1, 0, 1), fc.constantFrom(-1, 0, 1)), {
            minLength: 300,
            maxLength: 300,
          }),
          1,
        )[0] ?? []
      for (const [dx, dy] of dirs) {
        e = mover(e, dx, dy, 250)
        const { x, y } = e.personaje
        expect(a.has(claveCasilla(lado, Math.floor(x - M), Math.floor(y - M)))).toBe(false)
        expect(a.has(claveCasilla(lado, Math.floor(x + M - 1e-9), Math.floor(y + M - 1e-9)))).toBe(
          false,
        )
      }
    }
  })
})

describe('rompedor M2-02: cache y estado', () => {
  it('estado reconstruido via JSON da el mismo mapa y movimiento', () => {
    const e = ini(77)
    const m1 = mapaTransitabilidad(e)
    const clon = JSON.parse(JSON.stringify(e)) as EstadoJuego
    const m2 = mapaTransitabilidad(clon)
    expect(Array.from(m2.bloqueada)).toEqual(Array.from(m1.bloqueada))
    expect(mover(clon, 1, 1, 250).personaje).toEqual(mover(e, 1, 1, 250).personaje)
  })

  it('cache ignora la aparicion: mismo cauce/obstaculos con otra aparicion debe dar otro mapa', () => {
    const e = ini(77)
    const a = mapaTransitabilidad(e)
    // Aparicion en una casilla de agua/aislada distinta: la accesibilidad cambia.
    const lado = ladoValle(e.valle)
    const aisla = Array.from(a.bloqueada).findIndex((b, k) => b === 1 && !agua(e).has(k))
    if (aisla < 0) return
    const x = aisla % lado
    const otro = { ...e, aparicion: { x: x + 0.5, y: Math.floor(aisla / lado) + 0.5 } }
    expect(mapaTransitabilidad(otro)).not.toBe(a)
  })

  it('el desmayo devuelve a la aparicion', () => {
    let e = ini(3)
    e = mover(e, 1, 1, 250)
    const r = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 5000 })
    expect(r.ok && r.estado.personaje.x).toBe(e.aparicion.x)
    expect(JSON.parse(JSON.stringify(r.estado))).toEqual(r.estado)
  })

  it('10000 comandos aleatorios: determinista, sin NaN, caja libre', () => {
    const correr = (): EstadoJuego => {
      let e = ini(2024)
      let r = 12345
      const rnd = (): number => {
        r = (Math.imul(r, 1664525) + 1013904223) >>> 0
        return r / 2 ** 32
      }
      for (let i = 0; i < 10000; i++) {
        const q = rnd()
        const c: Comando =
          q < 0.85
            ? { tipo: 'MoverPersonaje', dx: rnd() * 2 - 1, dy: rnd() * 2 - 1, ms: rnd() * 400 }
            : q < 0.97
              ? { tipo: 'AvanzarTiempo', minutos: Math.floor(rnd() * 600) }
              : rnd() < 0.5
                ? { tipo: 'Pausar' }
                : { tipo: 'Reanudar' }
        e = aplicarComando(e, c).estado
        if (!cajaLibre(e)) throw new Error(`caja ocupada en ${i}`)
      }
      return e
    }
    const a = correr()
    expect(correr()).toEqual(a)
    expect(Number.isFinite(a.personaje.x + a.personaje.y)).toBe(true)
  })
})

describe('rompedor M2-02: rendimiento', () => {
  it('MoverPersonaje < 0.5 ms por llamada y mapa en frio < 50 ms', () => {
    const e = ini(1)
    const t0 = performance.now()
    mapaTransitabilidad(e)
    const frio = performance.now() - t0
    let t = e
    const t1 = performance.now()
    for (let i = 0; i < 5000; i++) t = mover(t, i % 2 ? 1 : -1, 0.5, 250)
    const por = (performance.now() - t1) / 5000
    console.log(`mapa en frio ${frio.toFixed(2)} ms; mover ${por.toFixed(4)} ms/llamada`)
    expect(frio).toBeLessThan(50)
    expect(por).toBeLessThan(0.5)
  })
})
