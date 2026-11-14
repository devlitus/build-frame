/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-01 Inventario y herramienta activa (núcleo). Ver docs/informes/M5-01-rompedor.md.
 * - Oráculo independiente de `UsarHerramienta` sobre estados aleatorios (modo, pausa, posición,
 *   herramienta, semilla elegida, inventario) y coordenadas raras (-0, decimales, NaN, ±∞, enormes,
 *   cadenas): mismo veredicto, rechazo con el mismo objeto de estado y determinismo.
 * - Secuencias de obras y cobertizos (construir, terminar, demoler, cancelar) mezcladas con añadir y
 *   quitar objetos: nada se pierde al bajar la capacidad, nada nuevo entra por encima de ella.
 * - Pilas en el límite y cantidades inválidas en `anadirObjeto` / `quitarObjeto`.
 * - `semillaElegida` que apunta a una semilla agotada.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  anadirObjeto,
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  CONFIG_INVENTARIO,
  crearEstadoInicial,
  defObjeto,
  HERRAMIENTAS,
  inventarioValido,
  ladoValle,
  OBJETOS,
  quitarObjeto,
  type Edificio,
  type EstadoJuego,
  type Herramienta,
  type Inventario,
  type ObjetoId,
} from '../../src/core'
import { costeEnergia } from '../../src/core/energia'

const base = crearEstadoInicial({ semilla: 11 })
const LADO = ladoValle(base.valle)
const SEMILLAS = OBJETOS.filter((o) => defObjeto(o)?.categoria === 'semilla')
const objeto = fc.constantFrom(...OBJETOS)

/** Inventario válido aleatorio, construido con la propia `anadirObjeto` sin límite práctico. */
const inventario: fc.Arbitrary<Inventario> = fc
  .array(fc.tuple(objeto, fc.integer({ min: 1, max: 250 })), { maxLength: 8 })
  .map((ops) => {
    let inv: Inventario = []
    for (const [o, n] of ops) inv = anadirObjeto(inv, o, n, 1000) ?? inv
    return inv
  })

const totales = (inv: Inventario) => OBJETOS.map((o) => cantidadDe(inv, o))

/** Oráculo escrito aparte (sin mirar la implementación): veredicto esperado de UsarHerramienta. */
function esperado(e: EstadoJuego, x: unknown, y: unknown): string | undefined {
  const entero = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n)
  if (!entero(x) || !entero(y)) return 'parametro-invalido'
  const nx = x as number
  const ny = y as number
  if (e.modo !== 'vida') return 'solo-en-vida'
  if (e.pausado) return 'en-pausa'
  if (nx < 0 || ny < 0 || nx >= LADO || ny >= LADO) return 'fuera-del-valle'
  const px = Math.floor(e.personaje.x)
  const py = Math.floor(e.personaje.y)
  if (Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) return 'fuera-de-alcance'
  if (e.herramienta === 'semillas') {
    if (e.semillaElegida === null) return 'sin-semilla-elegida'
    if (cantidadDe(e.inventario, e.semillaElegida) < 1) return 'sin-semillas'
  }
  return undefined
}

const estado: fc.Arbitrary<EstadoJuego> = fc
  .record({
    modo: fc.constantFrom('vida' as const, 'plano' as const),
    pausado: fc.boolean(),
    px: fc.oneof(
      fc.double({ min: 0.3, max: LADO - 0.3, noNaN: true }),
      fc.constantFrom(0.3, LADO - 0.3, 0.5, LADO - 0.5),
    ),
    py: fc.oneof(
      fc.double({ min: 0.3, max: LADO - 0.3, noNaN: true }),
      fc.constantFrom(0.3, LADO - 0.3, 0.5, LADO - 0.5),
    ),
    herramienta: fc.oneof(fc.constant('semillas' as const), fc.constantFrom(...HERRAMIENTAS)),
    semilla: fc.option(fc.constantFrom(...SEMILLAS), { nil: null }),
    inventario,
  })
  .map((r) => ({
    ...base,
    modo: r.modo,
    pausado: r.pausado,
    personaje: { x: r.px, y: r.py, orientacion: 'sur' as const },
    herramienta: r.herramienta as Herramienta,
    semillaElegida: r.semilla as ObjetoId | null,
    inventario: r.inventario,
  }))

/** Coordenada: casi siempre cerca del personaje (desplazamiento), a veces rara. */
const coord = (centro: number) =>
  fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: -2, max: 2 }).map((d) => Math.floor(centro) + d) },
    {
      weight: 1,
      arbitrary: fc.constantFrom<unknown>(
        -0,
        0.5,
        1.0000001,
        NaN,
        Infinity,
        -Infinity,
        2 ** 53,
        -1,
        LADO,
        '3',
        null,
        undefined,
        {},
        [],
      ),
    },
    { weight: 1, arbitrary: fc.double().map((d) => d as unknown) },
  )

describe('M5-01 · rompedor del núcleo', () => {
  it('UsarHerramienta coincide con el oráculo, no toca el estado y es determinista', () => {
    const vistos = new Map<string, number>()
    fc.assert(
      fc.property(
        estado.chain((e) => fc.tuple(fc.constant(e), coord(e.personaje.x), coord(e.personaje.y))),
        ([e, x, y]) => {
          const copia = JSON.stringify(e)
          const r1 = aplicarComando(e, { tipo: 'UsarHerramienta', x: x as number, y: y as number })
          const r2 = aplicarComando(e, { tipo: 'UsarHerramienta', x: x as number, y: y as number })
          expect(r1).toEqual(r2)
          const esp = esperado(e, x, y)
          vistos.set(esp ?? 'ok', (vistos.get(esp ?? 'ok') ?? 0) + 1)
          if (esp === undefined) {
            expect(r1.ok, JSON.stringify(r1.ok ? null : r1.error)).toBe(true)
            if (r1.ok) {
              // Orquestador (M5-02): un uso aceptado gasta energía; el resto del estado no cambia.
              expect({ ...r1.estado, energia: e.energia }).toEqual(e)
              expect(r1.estado.energia).toBe(e.energia - costeEnergia(e.herramienta))
              expect(r1.eventos[0]).toEqual({
                tipo: 'herramienta-usada',
                herramienta: e.herramienta,
                x: (x as number) + 0,
                y: (y as number) + 0,
              })
              expect(Object.is(r1.eventos[0] && 'x' in r1.eventos[0] && r1.eventos[0].x, -0)).toBe(
                false,
              )
            }
          } else {
            expect(r1.ok).toBe(false)
            if (!r1.ok) expect(r1.error).toBe(esp)
            expect(r1.estado).toBe(e)
          }
          expect(JSON.stringify(e)).toBe(copia)
        },
      ),
      { numRuns: 3000 },
    )
    // Que la muestra cubra de verdad cada veredicto (no solo rechazos).
    for (const v of [
      'ok',
      'parametro-invalido',
      'solo-en-vida',
      'en-pausa',
      'fuera-del-valle',
      'fuera-de-alcance',
      'sin-semilla-elegida',
      'sin-semillas',
    ])
      expect(vistos.get(v) ?? 0, v).toBeGreaterThan(5)
  })

  it('ElegirHerramienta y ElegirSemilla: rechazo = mismo objeto; éxito solo cambia su campo', () => {
    const raro = fc.constantFrom<unknown>(
      '',
      'AZADA',
      ' azada',
      '__proto__',
      'constructor',
      'toString',
      'madera',
      'piedra',
      'patata',
      'planton',
      'semilla-',
      0,
      1,
      NaN,
      null,
      undefined,
      {},
      ['azada'],
    )
    fc.assert(
      fc.property(
        estado,
        fc.oneof(fc.constantFrom<unknown>(...HERRAMIENTAS), raro),
        fc.oneof(fc.constantFrom<unknown>(...OBJETOS), raro),
        (e, h, o) => {
          const rh = aplicarComando(e, { tipo: 'ElegirHerramienta', herramienta: h as Herramienta })
          if (HERRAMIENTAS.includes(h as Herramienta)) {
            expect(rh.ok).toBe(true)
            expect({ ...rh.estado, herramienta: e.herramienta }).toEqual(e)
            expect(rh.estado.herramienta).toBe(h)
          } else {
            expect(rh.ok).toBe(false)
            expect(rh.estado).toBe(e)
          }
          const rs = aplicarComando(e, { tipo: 'ElegirSemilla', objeto: o as ObjetoId })
          const valida =
            o === null ||
            (SEMILLAS.includes(o as ObjetoId) && cantidadDe(e.inventario, o as ObjetoId) > 0)
          expect(rs.ok, `${String(o)} → ${rs.ok ? 'ok' : rs.error}`).toBe(valida)
          if (rs.ok) {
            expect({ ...rs.estado, semillaElegida: e.semillaElegida }).toEqual(e)
            expect(rs.estado.semillaElegida).toBe(o)
            // Elegir una semilla no cambia la herramienta.
            expect(rs.estado.herramienta).toBe(e.herramienta)
          } else expect(rs.estado).toBe(e)
        },
      ),
      { numRuns: 1500 },
    )
  })

  it('una semilla elegida que se agota: «sin-semillas» y se puede soltar; no se puede volver a elegir', () => {
    for (const s of SEMILLAS) {
      const sinElla = base.inventario.filter((r) => r.objeto !== s)
      const e: EstadoJuego = {
        ...base,
        modo: 'vida',
        pausado: false,
        herramienta: 'semillas',
        semillaElegida: s,
        inventario: sinElla,
      }
      const px = Math.floor(e.personaje.x)
      const py = Math.floor(e.personaje.y)
      const u = aplicarComando(e, { tipo: 'UsarHerramienta', x: px, y: py })
      expect(u.ok ? 'ok' : u.error).toBe('sin-semillas')
      // Con otra herramienta, la semilla agotada no estorba.
      const conMano = aplicarComando(
        { ...e, herramienta: 'mano' },
        {
          tipo: 'UsarHerramienta',
          x: px,
          y: py,
        },
      )
      expect(conMano.ok).toBe(true)
      const re = aplicarComando(e, { tipo: 'ElegirSemilla', objeto: s })
      expect(re.ok ? 'ok' : re.error).toBe('sin-semillas')
      const suelta = aplicarComando(e, { tipo: 'ElegirSemilla', objeto: null })
      expect(suelta.ok).toBe(true)
      expect(suelta.estado.semillaElegida).toBeNull()
    }
  })

  it('pilas en el límite y cantidades inválidas', () => {
    const o: ObjetoId = 'semilla-rabano'
    const max = defObjeto(o)!.pilaMaxima
    expect(anadirObjeto([{ objeto: o, cantidad: max - 1 }], o, 2, 12)).toEqual([
      { objeto: o, cantidad: max },
      { objeto: o, cantidad: 1 },
    ])
    expect(anadirObjeto([{ objeto: o, cantidad: max }], o, 1, 12)).toEqual([
      { objeto: o, cantidad: max },
      { objeto: o, cantidad: 1 },
    ])
    expect(anadirObjeto([], o, max, 1)).toEqual([{ objeto: o, cantidad: max }])
    expect(anadirObjeto([], o, max + 1, 1)).toBeUndefined()
    // Justo en su capacidad: rellena la incompleta, pero no abre ranura nueva.
    const lleno: Inventario = [
      ...Array.from({ length: 11 }, () => ({ objeto: 'patata' as ObjetoId, cantidad: max })),
      { objeto: o, cantidad: max - 1 },
    ]
    expect(anadirObjeto(lleno, o, 1, 12)?.at(-1)).toEqual({ objeto: o, cantidad: max })
    expect(anadirObjeto(lleno, o, 2, 12)).toBeUndefined()
    expect(anadirObjeto(lleno, 'fresa', 1, 12)).toBeUndefined()
    for (const n of [0, -1, -0, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 53, '3', null]) {
      expect(anadirObjeto([], o, n as number, 12), String(n)).toBeUndefined()
      expect(quitarObjeto([{ objeto: o, cantidad: 5 }], o, n as number), String(n)).toBeUndefined()
    }
    for (const x of ['madera', 'piedra', '__proto__', 'toString', '', 'semilla-maiz']) {
      expect(anadirObjeto([], x as ObjetoId, 1, 12), x).toBeUndefined()
      expect(quitarObjeto([], x as ObjetoId, 1), x).toBeUndefined()
    }
    // Capacidad rara.
    for (const c of [NaN, 1.5, -1, Infinity]) expect(anadirObjeto([], o, 1, c)).toBeUndefined()
    // Quitar exactamente todo deja el inventario vacío; uno más, nada.
    expect(
      quitarObjeto(
        [
          { objeto: o, cantidad: max },
          { objeto: o, cantidad: 3 },
        ],
        o,
        max + 3,
      ),
    ).toEqual([])
    expect(quitarObjeto([{ objeto: o, cantidad: 3 }], o, 4)).toBeUndefined()
  })

  type Paso =
    | { k: 'construir' }
    | { k: 'terminar'; i: number }
    | { k: 'demoler'; i: number }
    | { k: 'cancelar'; i: number }
    | { k: 'anadir'; o: ObjetoId; n: number }
    | { k: 'quitar'; o: ObjetoId; n: number }
  const paso: fc.Arbitrary<Paso> = fc.oneof(
    fc.constant({ k: 'construir' as const }),
    fc.record({ k: fc.constant('terminar' as const), i: fc.nat(20) }),
    fc.record({ k: fc.constant('demoler' as const), i: fc.nat(20) }),
    fc.record({ k: fc.constant('cancelar' as const), i: fc.nat(20) }),
    {
      arbitrary: fc.record({
        k: fc.constant('anadir' as const),
        o: objeto,
        n: fc.integer({ min: 1, max: 600 }),
      }),
      weight: 4,
    },
    {
      arbitrary: fc.record({
        k: fc.constant('quitar' as const),
        o: objeto,
        n: fc.integer({ min: 1, max: 600 }),
      }),
      weight: 3,
    },
  )

  it('cobertizos que se construyen, terminan, demuelen o cancelan, con objetos entrando y saliendo', () => {
    fc.assert(
      fc.property(fc.array(paso, { maxLength: 80 }), (pasos) => {
        let edificios: Edificio[] = []
        let id = 1
        let inv: Inventario = []
        for (const p of pasos) {
          const capAntes = capacidadInventario(edificios)
          const totAntes = totales(inv)
          if (p.k === 'construir') {
            edificios = [
              ...edificios,
              {
                id: id++,
                tipo: 'cobertizo',
                x: 0,
                y: 0,
                obra: { diaInicio: 1, diaFin: 3 },
              } as Edificio,
            ]
            // Una obra no suma.
            expect(capacidadInventario(edificios)).toBe(capAntes)
          } else if (p.k === 'terminar' && edificios.length) {
            const i = p.i % edificios.length
            const eraObra = edificios[i]!.obra !== null
            edificios = edificios.map((e, j) => (j === i ? { ...e, obra: null } : e))
            expect(capacidadInventario(edificios)).toBe(
              capAntes + (eraObra ? CONFIG_INVENTARIO.ranurasPorEdificio.cobertizo : 0),
            )
          } else if ((p.k === 'demoler' || p.k === 'cancelar') && edificios.length) {
            const i = p.i % edificios.length
            const quitado = edificios[i]!
            edificios = edificios.filter((_, j) => j !== i)
            expect(capacidadInventario(edificios)).toBe(
              capAntes -
                (quitado.obra === null ? CONFIG_INVENTARIO.ranurasPorEdificio.cobertizo : 0),
            )
          } else if (p.k === 'anadir') {
            const r = anadirObjeto(inv, p.o, p.n, capAntes)
            if (inv.length > capAntes) expect(r).toBeUndefined()
            if (r) {
              expect(r.length).toBeLessThanOrEqual(capAntes)
              inv = r
            }
          } else if (p.k === 'quitar') {
            const r = quitarObjeto(inv, p.o, p.n)
            // Quitar no depende de la capacidad: siempre se puede si hay bastantes.
            expect(r !== undefined).toBe(cantidadDe(inv, p.o) >= p.n)
            if (r) inv = r
          }
          // Cambiar la capacidad nunca toca el inventario (no se pierde nada).
          if (p.k !== 'anadir' && p.k !== 'quitar') expect(totales(inv)).toEqual(totAntes)
          expect(inventarioValido(inv)).toBe(true)
          expect(capacidadInventario(edificios)).toBeGreaterThanOrEqual(
            CONFIG_INVENTARIO.capacidadBase,
          )
        }
      }),
      { numRuns: 500 },
    )
  })

  it('el estado inicial es determinista, trae el lote de regalo y sobrevive a JSON', () => {
    const a = crearEstadoInicial({ semilla: 99 })
    const b = crearEstadoInicial({ semilla: 99 })
    expect(a).toEqual(b)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
    expect(a.inventario).toEqual(CONFIG_INVENTARIO.loteInicial.map((l) => ({ ...l })))
    expect(a.herramienta).toBe(CONFIG_INVENTARIO.herramientaInicial)
    expect(a.semillaElegida).toBeNull()
    // Lo que entra por opciones no queda compartido con el estado.
    const mio = [{ objeto: 'patata' as ObjetoId, cantidad: 3 }]
    const c = crearEstadoInicial({ semilla: 1, inventarioInicial: mio })
    ;(mio[0] as { cantidad: number }).cantidad = 50
    expect(c.inventario[0]!.cantidad).toBe(3)
    expect(() =>
      crearEstadoInicial({ semilla: 1, inventarioInicial: [{ objeto: 'patata', cantidad: 0 }] }),
    ).toThrow()
  })
})
