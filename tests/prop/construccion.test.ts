import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aplicarComando,
  casillasRio,
  CONFIG_EDIFICIOS,
  CONFIG_PERSONAJE,
  crearEstadoInicial,
  ladoValle,
  zonaEn,
  type Comando,
  type EstadoJuego,
  type TipoEdificio,
} from '../../src/core'
import { validarDatos } from '../../vite.config'

const SEMILLAS = [3, 7, 42]
const TIPOS = ['casa', 'caja-envio', 'cobertizo'] as const

/** Estado con las parcelas propias de una fila central, zonas vivienda/almacén pintadas y Modo Plano. */
function preparar(semilla: number): EstadoJuego {
  const e0 = crearEstadoInicial({ semilla, dineroInicial: 20_000 })
  const N = e0.valle.parcelasPorLado
  let e = e0
  const paso = (c: Comando) => {
    const r = aplicarComando(e, c)
    if (r.ok) e = r.estado
  }
  for (let i = 0; i < N * N; i++) {
    if (e.valle.parcelas.filter((p) => p.estado === 'propia').length >= 3) break
    if (!e.valle.rio.includes(i)) paso({ tipo: 'ComprarParcela', indice: i })
  }
  const LADO = ladoValle(e.valle)
  // Mitades alternas de vivienda y almacén por columnas de 8 casillas.
  for (let x = 0; x < LADO; x += 8) {
    paso({
      tipo: 'PintarZona',
      x0: x,
      y0: 0,
      x1: x + 7,
      y1: LADO - 1,
      zona: (x / 8) % 2 === 0 ? 'vivienda' : 'almacen',
    })
  }
  paso({ tipo: 'CambiarModo', modo: 'plano' })
  return e
}
const iniciales = SEMILLAS.map(preparar)
function inicial(i: number): EstadoJuego {
  const e = iniciales[i]
  if (!e) throw new Error('semilla inexistente')
  return e
}

/** Casillas de parcelas propias de las tres semillas: sesgan las construcciones hacia donde pueden valer. */
const propias = iniciales.flatMap((e) => {
  const c = e.valle.casillasPorParcela
  const N = e.valle.parcelasPorLado
  return e.valle.parcelas.flatMap((p, i) =>
    p.estado === 'propia' ? [{ x: (i % N) * c, y: Math.floor(i / N) * c }] : [],
  )
})
const comando = (lado: number): fc.Arbitrary<Comando> =>
  fc.oneof(
    {
      weight: 8,
      arbitrary: fc.record({
        tipo: fc.constant('Construir' as const),
        tipoEdificio: fc.constantFrom(...TIPOS),
        x: fc.oneof(
          fc.integer({ min: -2, max: lado + 1 }),
          fc.tuple(fc.constantFrom(...propias), fc.nat(15)).map(([p, d]) => p.x + d),
        ),
        y: fc.oneof(
          fc.integer({ min: -2, max: lado + 1 }),
          fc.tuple(fc.constantFrom(...propias), fc.nat(15)).map(([p, d]) => p.y + d),
        ),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        tipo: fc.constant('PintarZona' as const),
        x0: fc.integer({ min: 0, max: lado - 1 }),
        y0: fc.integer({ min: 0, max: lado - 1 }),
        x1: fc.integer({ min: 0, max: lado - 1 }),
        y1: fc.integer({ min: 0, max: lado - 1 }),
        zona: fc.constantFrom('cultivo' as const, 'vivienda' as const, 'almacen' as const),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        tipo: fc.constant('BorrarZona' as const),
        x0: fc.integer({ min: 0, max: lado - 1 }),
        y0: fc.integer({ min: 0, max: lado - 1 }),
        x1: fc.integer({ min: 0, max: lado - 1 }),
        y1: fc.integer({ min: 0, max: lado - 1 }),
      }),
    },
    {
      weight: 2,
      arbitrary: fc.record({
        tipo: fc.constant('CambiarModo' as const),
        modo: fc.constantFrom('vida' as const, 'plano' as const),
      }),
    },
    {
      weight: 3,
      arbitrary: fc.record({
        tipo: fc.constant('MoverPersonaje' as const),
        dx: fc.constantFrom(-1, 0, 1),
        dy: fc.constantFrom(-1, 0, 1),
        ms: fc.integer({ min: 0, max: 250 }),
      }),
    },
  )

const huella = (e: EstadoJuego['edificios'][number]) => {
  const d = CONFIG_EDIFICIOS.edificios[e.tipo]
  return { x0: e.x, y0: e.y, x1: e.x + d.ancho - 1, y1: e.y + d.alto - 1 }
}

function comprobarInvariantes(e: EstadoJuego, e0: EstadoJuego): void {
  const lado = ladoValle(e.valle)
  const c = e.valle.casillasPorParcela
  const agua = new Set(casillasRio(e.valle, e.cauce.ancho).map((k) => k.y * lado + k.x))
  const obst = new Set(e.obstaculos.map((o) => o.y * lado + o.x))
  const ocupadas = new Set<number>()
  let dinero = 0
  let madera = 0
  let piedra = 0
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  const ax = Math.floor(e.aparicion.x)
  const ay = Math.floor(e.aparicion.y)
  for (const b of e.edificios) {
    const d = CONFIG_EDIFICIOS.edificios[b.tipo]
    const h = huella(b)
    dinero += d.coste.dinero
    madera += d.coste.madera
    piedra += d.coste.piedra
    for (let y = h.y0; y <= h.y1; y++)
      for (let x = h.x0; x <= h.x1; x++) {
        expect(x >= 0 && y >= 0 && x < lado && y < lado).toBe(true)
        const k = y * lado + x
        expect(ocupadas.has(k)).toBe(false) // nunca dos edificios en la misma casilla
        ocupadas.add(k)
        expect(agua.has(k)).toBe(false)
        expect(obst.has(k)).toBe(false)
        const p = e.valle.parcelas[Math.floor(y / c) * e.valle.parcelasPorLado + Math.floor(x / c)]
        expect(p?.estado).toBe('propia')
        expect(d.zonas).toContain(zonaEn(e, x, y))
        expect(x === ax && y === ay).toBe(false)
      }
    // El personaje nunca queda dentro de un edificio (su caja no solapa la huella).
    const solapa =
      Math.floor(e.personaje.x - m) <= h.x1 &&
      Math.ceil(e.personaje.x + m) - 1 >= h.x0 &&
      Math.floor(e.personaje.y - m) <= h.y1 &&
      Math.ceil(e.personaje.y + m) - 1 >= h.y0
    expect(solapa).toBe(false)
  }
  expect(e.edificios.filter((b) => b.tipo === 'casa').length).toBeLessThanOrEqual(1)
  expect(new Set(e.edificios.map((b) => b.id)).size).toBe(e.edificios.length)
  expect(e.siguienteIdEdificio).toBe(e.edificios.length + 1)
  // Economía: enteros >= 0 y gasto = suma de costes de lo construido.
  for (const n of [e.dinero, e.materiales.madera, e.materiales.piedra]) {
    expect(Number.isSafeInteger(n)).toBe(true)
    expect(n).toBeGreaterThanOrEqual(0)
  }
  expect(e0.materiales.madera - e.materiales.madera).toBe(madera)
  expect(e0.materiales.piedra - e.materiales.piedra).toBe(piedra)
  expect(e0.dinero - e.dinero).toBe(dinero)
}

describe('propiedades de construcción', () => {
  it('invariantes tras secuencias aleatorias de comandos', () => {
    const lado = ladoValle(inicial(0).valle)
    let construidos = 0
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SEMILLAS.length - 1 }),
        fc.array(comando(lado), { minLength: 1, maxLength: 60 }),
        (i, comandos) => {
          const e0 = inicial(i)
          let e = e0
          const antesDe = (est: EstadoJuego) => JSON.stringify(est)
          for (const c of comandos) {
            const previo = antesDe(e)
            const r = aplicarComando(e, c)
            // Inmutabilidad y rechazo = mismo objeto.
            expect(antesDe(e)).toBe(previo)
            if (!r.ok) expect(r.estado).toBe(e)
            if (c.tipo === 'Construir' && r.ok) {
              construidos++
              expect(e.modo).toBe('plano')
              expect(r.estado.edificios.length).toBe(e.edificios.length + 1)
            }
            e = r.estado
            // Economía acumulada contra el estado inicial; las zonas no tocan edificios.
            comprobarInvariantes(e, e0)
          }
          // JSON ida y vuelta.
          expect(JSON.parse(JSON.stringify(e))).toEqual(e)
        },
      ),
      { numRuns: 150 },
    )
    // El generador no es vacuo: se llegan a construir edificios.
    expect(construidos).toBeGreaterThan(20)
  })

  it('determinismo: misma secuencia, mismo estado', () => {
    const lado = ladoValle(inicial(0).valle)
    fc.assert(
      fc.property(fc.array(comando(lado), { maxLength: 40 }), (comandos) => {
        const correr = () => comandos.reduce((e, c) => aplicarComando(e, c).estado, inicial(2))
        expect(correr()).toEqual(correr())
      }),
      { numRuns: 60 },
    )
  })

  it('pintar y borrar zonas nunca cambia casillas bajo un edificio', () => {
    const lado = ladoValle(inicial(0).valle)
    fc.assert(
      fc.property(fc.array(comando(lado), { maxLength: 50 }), (comandos) => {
        let e = inicial(0)
        for (const c of comandos) {
          const r = aplicarComando(e, c)
          if (c.tipo === 'PintarZona' || c.tipo === 'BorrarZona') {
            for (const b of e.edificios) {
              const h = huella(b)
              for (let y = h.y0; y <= h.y1; y++)
                for (let x = h.x0; x <= h.x1; x++) {
                  expect(zonaEn(r.estado, x, y)).toBe(zonaEn(e, x, y))
                }
            }
          }
          e = r.estado
        }
      }),
      { numRuns: 60 },
    )
  })

  it('los edificios construidos siempre aparecen en el mapa como bloqueados', async () => {
    const { mapaTransitabilidad, casillaBloqueada } = await import('../../src/core')
    const lado = ladoValle(inicial(0).valle)
    fc.assert(
      fc.property(fc.array(comando(lado), { maxLength: 40 }), (comandos) => {
        const e = comandos.reduce((s, c) => aplicarComando(s, c).estado, inicial(1))
        const mapa = mapaTransitabilidad(e)
        for (const b of e.edificios) {
          const h = huella(b)
          for (let y = h.y0; y <= h.y1; y++)
            for (let x = h.x0; x <= h.x1; x++) expect(casillaBloqueada(mapa, x, y)).toBe(true)
        }
      }),
      { numRuns: 60 },
    )
  })

  it('se construye algo en la mayoría de semillas (los generadores no son vacuos)', () => {
    const tipos: TipoEdificio[] = ['caja-envio', 'cobertizo', 'casa']
    let construidos = 0
    for (const e0 of iniciales) {
      for (const t of tipos) {
        for (let y = 0; y < 96 && construidos < 99; y += 2)
          for (let x = 0; x < 96; x += 2) {
            if (aplicarComando(e0, { tipo: 'Construir', tipoEdificio: t, x, y }).ok) {
              construidos++
              y = 96
              break
            }
          }
      }
    }
    expect(construidos).toBeGreaterThanOrEqual(3)
  })
})

describe('plugin de build: validación de data/edificios.json', () => {
  const correr = (ruta: string) => {
    const plugin = validarDatos(undefined, undefined, ruta)
    const buildStart = plugin.buildStart as (this: { error: (m: string) => never }) => void
    buildStart.call({
      error: (m: string) => {
        throw new Error(m)
      },
    })
  }
  const conArchivo = (contenido: string, fn: (ruta: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'edificios-'))
    const ruta = join(dir, 'edificios.json')
    writeFileSync(ruta, contenido)
    try {
      fn(ruta)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  it('acepta los datos reales y rechaza datos mal formados', () => {
    expect(() => correr(join(import.meta.dirname, '../../data/edificios.json'))).not.toThrow()
    const malo = structuredClone(CONFIG_EDIFICIOS) as unknown as {
      edificios: { casa: Record<string, unknown> }
    }
    malo.edificios.casa.dias = 0
    expect(() => conArchivo(JSON.stringify(malo), correr)).toThrow(/edificios\.json inválido/)
    expect(() => conArchivo('{ roto', correr)).toThrow()
  })
})
