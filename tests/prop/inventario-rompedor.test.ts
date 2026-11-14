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
  aguaDe,
  CARACTER_ARADA,
  CARACTER_REGADA,
  diasHastaMadurar,
  esCaracterArada,
  casillaConEdificio,
  CONFIG_CULTIVOS,
  CONFIG_INVENTARIO,
  CONFIG_RECURSOS,
  crearEstadoInicial,
  CULTIVOS,
  cultivoDeEstacion,
  cultivoDeSemilla,
  defObjeto,
  HERRAMIENTAS,
  inventarioValido,
  ENERGIA_MAXIMA,
  ladoValle,
  OBJETOS,
  puedePlantarPlanton,
  siguienteAleatorio,
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
  const motivo = motivoEfecto(e, nx, ny)
  if (motivo) return motivo
  if (e.energia < costeEnergia(e.herramienta)) return 'sin-energia'
  return undefined
}

/** Oráculo de las reglas de M5-03 (azada y semillas) sobre una casilla ya validada. */
function motivoEfecto(e: EstadoJuego, x: number, y: number): string | undefined {
  const c = e.valle.casillasPorParcela
  const i = y * LADO + x
  const propia = e.valle.parcelas[Math.floor(y / c) * e.valle.parcelasPorLado + Math.floor(x / c)]
  const agua = aguaDe(e.valle, e.cauce.ancho, LADO).has(i)
  const obstaculo = e.obstaculos.some((o) => o.x === x && o.y === y)
  const edificio = casillaConEdificio(e, x, y)
  const zona = e.zonas[i]
  const planta = e.plantas.find((pl) => pl[0] === i)
  if (e.herramienta === 'azada') {
    // Una marchita se limpia sin más comprobaciones (M5-04).
    if (planta?.[5] === 1) return undefined
    if (propia?.estado !== 'propia') return 'no-propia'
    if (agua) return 'agua'
    if (obstaculo) return 'obstaculo'
    if (edificio) return 'ocupada'
    if (zona !== 'c' && zona !== 'h') return 'zona'
    if (esCaracterArada(e.tierra[i])) return 'ya-arada'
  } else if (e.herramienta === 'regadera') {
    // M5-04: orden no-arada, ya-regada, planta-marchita, planta-madura.
    if (!esCaracterArada(e.tierra[i])) return 'no-arada'
    if (e.tierra[i] === CARACTER_REGADA) return 'ya-regada'
    if (planta?.[5] === 1) return 'planta-marchita'
    if (planta && planta[2] >= diasHastaMadurar(CONFIG_CULTIVOS.cultivos[CULTIVOS[planta[1]]!]))
      return 'planta-madura'
  } else if (e.herramienta === 'semillas') {
    const cultivo = cultivoDeSemilla(e.semillaElegida)
    if (!cultivo) return 'semilla-invalida'
    if (!esCaracterArada(e.tierra[i])) return 'no-arada'
    if (e.plantas.some((pl) => pl[0] === i) || edificio || obstaculo || agua) return 'ocupada'
    const letra: Record<string, string> = { cultivo: 'c', huerto: 'h' }
    if (!CONFIG_CULTIVOS.cultivos[cultivo].zonas.some((z) => letra[z] === zona)) return 'zona'
    if (!cultivoDeEstacion(cultivo, e)) return 'fuera-de-estacion'
  } else if (e.herramienta === 'hacha' || e.herramienta === 'pico') {
    // M5-06: golpear algo ajeno se rechaza; el golpe al aire (o a lo que no es su objetivo) se acepta.
    const o = e.obstaculos.find((b) => b.x === x && b.y === y)
    const objetivo = e.herramienta === 'hacha' ? o?.tipo !== 'roca' : o?.tipo === 'roca'
    if (o && objetivo && propia?.estado !== 'propia') return 'no-propia'
  }
  return undefined
}

/** Cómo se deja la casilla de destino antes de usar la herramienta (para cubrir todos los motivos). */
interface Preparacion {
  propia: boolean
  zona: string
  arada: boolean
  /** Carácter de tierra arada (M5-04): seca `a`, regada `A` o `1`..`9` días secos. */
  car: string
  planta: boolean
  /** Estado de la planta que se deja (M5-04). */
  estadoPlanta: 'viva' | 'marchita' | 'madura'
  obstaculo: boolean
  /** Tipo del obstáculo que se deja (M5-06) y golpes que ya lleva. */
  tipoObs: 'arbol' | 'roca' | 'planton'
  golpes: number
  /** Deja un plantón en el inventario (para que la mano lo plante). */
  planton: boolean
  dia: number
  energia: number
  /** Deja la semilla elegida en el inventario y el día en su estación (si se puede). */
  facilita: boolean
}
const preparacion: fc.Arbitrary<Preparacion> = fc.record({
  propia: fc.oneof({ weight: 2, arbitrary: fc.constant(true) }, fc.boolean()),
  zona: fc.constantFrom('c', 'c', 'h', 'h', 'v', 'a', '.'),
  arada: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, fc.boolean()),
  car: fc.constantFrom('a', 'a', 'A', 'A', '1', '2', '5', '9'),
  planta: fc.oneof({ weight: 4, arbitrary: fc.constant(false) }, fc.boolean()),
  estadoPlanta: fc.constantFrom('viva', 'viva', 'marchita', 'madura') as fc.Arbitrary<
    'viva' | 'marchita' | 'madura'
  >,
  obstaculo: fc.oneof({ weight: 2, arbitrary: fc.constant(false) }, fc.boolean()),
  tipoObs: fc.constantFrom('arbol', 'roca', 'planton') as fc.Arbitrary<
    'arbol' | 'roca' | 'planton'
  >,
  golpes: fc.constantFrom(0, 0, 1, 2, 4),
  planton: fc.boolean(),
  facilita: fc.boolean(),
  dia: fc.integer({ min: 1, max: 120 }),
  energia: fc.oneof(
    { weight: 4, arbitrary: fc.constant(ENERGIA_MAXIMA) },
    { weight: 2, arbitrary: fc.integer({ min: 0, max: 3 }) },
    fc.integer({ min: 0, max: ENERGIA_MAXIMA }),
  ),
})
const NO_PROPIA = base.valle.parcelas.find((q) => q.estado !== 'propia')!.estado

/** Deja la casilla (x, y) como pide la preparación (si no es del valle, solo día y energía). */
function preparar(e: EstadoJuego, x: unknown, y: unknown, q0: Preparacion): EstadoJuego {
  // «facilita» con la azada: casilla propia, de cultivo, libre y sin arar, con energía de sobra.
  const q: Preparacion =
    q0.facilita && e.herramienta === 'azada'
      ? {
          ...q0,
          propia: true,
          zona: 'c',
          arada: false,
          planta: false,
          obstaculo: false,
          energia: ENERGIA_MAXIMA,
        }
      : q0.facilita && e.herramienta === 'regadera'
        ? {
            ...q0,
            arada: true,
            energia: ENERGIA_MAXIMA,
          }
        : q0.facilita && (e.herramienta === 'hacha' || e.herramienta === 'pico')
          ? {
              ...q0,
              propia: true,
              obstaculo: true,
              planta: false,
              tipoObs:
                e.herramienta === 'pico' ? 'roca' : q0.tipoObs === 'roca' ? 'arbol' : q0.tipoObs,
              energia: ENERGIA_MAXIMA,
            }
          : q0
  const fuera =
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    (x as number) < 0 ||
    (y as number) < 0 ||
    (x as number) >= LADO ||
    (y as number) >= LADO
  let dia: EstadoJuego = {
    ...e,
    dia: q.dia,
    energia: q.energia,
    inventario:
      q.planton && e.herramienta === 'mano'
        ? (anadirObjeto(e.inventario, 'planton', 1, 1000) ?? e.inventario)
        : e.inventario,
  }
  const cultivo = cultivoDeSemilla(e.semillaElegida)
  if (q.facilita && cultivo) {
    const hay = cantidadDe(e.inventario, e.semillaElegida!) >= 1
    const dias = Array.from({ length: 120 }, (_, k) => k + 1)
    const d = dias.find((k) => cultivoDeEstacion(cultivo, { dia: k }))
    dia = {
      ...dia,
      dia: d ?? q.dia,
      inventario: hay
        ? dia.inventario
        : (anadirObjeto(dia.inventario, e.semillaElegida!, 1, 1000) ?? dia.inventario),
    }
  }
  if (fuera) return dia
  const cx = x as number
  const cy = y as number
  const i = cy * LADO + cx
  const c = e.valle.casillasPorParcela
  const ip = Math.floor(cy / c) * e.valle.parcelasPorLado + Math.floor(cx / c)
  const reemplaza = (t: string, car: string) => t.slice(0, i) + car + t.slice(i + 1)
  const arada = q.arada || q.planta
  return {
    ...dia,
    valle: {
      ...e.valle,
      parcelas: e.valle.parcelas.map((pa, k) =>
        k === ip ? { ...pa, estado: q.propia ? ('propia' as const) : NO_PROPIA } : pa,
      ),
    },
    zonas: reemplaza(e.zonas, q.zona),
    tierra: reemplaza(e.tierra, arada ? q.car : '.'),
    plantas: q.planta
      ? [
          [
            i,
            CULTIVOS.indexOf('patata'),
            q.estadoPlanta === 'madura' ? diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata) : 0,
            0,
            0,
            q.estadoPlanta === 'marchita' ? 1 : 0,
          ],
        ]
      : [],
    obstaculos: [
      ...e.obstaculos.filter((o) => o.x !== cx || o.y !== cy),
      ...(q.obstaculo
        ? [
            {
              tipo: q.tipoObs,
              x: cx,
              y: cy,
              variante: 0,
              ...(q.golpes > 0 ? { golpes: q.golpes } : {}),
              ...(q.tipoObs === 'planton' ? { diaPlantado: 1 } : {}),
            },
          ]
        : []),
    ],
  }
}

const estado: fc.Arbitrary<EstadoJuego> = fc
  .record({
    modo: fc.oneof(
      { weight: 5, arbitrary: fc.constant('vida' as const) },
      fc.constant('plano' as const),
    ),
    pausado: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, fc.boolean()),
    px: fc.oneof(
      fc.double({ min: 0.3, max: LADO - 0.3, noNaN: true }),
      fc.constantFrom(0.3, LADO - 0.3, 0.5, LADO - 0.5),
    ),
    py: fc.oneof(
      fc.double({ min: 0.3, max: LADO - 0.3, noNaN: true }),
      fc.constantFrom(0.3, LADO - 0.3, 0.5, LADO - 0.5),
    ),
    herramienta: fc.oneof(
      fc.constant('semillas' as const),
      fc.constant('azada' as const),
      fc.constantFrom(...HERRAMIENTAS),
    ),
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
        estado.chain((e0) =>
          fc.tuple(fc.constant(e0), coord(e0.personaje.x), coord(e0.personaje.y), preparacion),
        ),
        ([e0, x, y, q]) => {
          const e = preparar(e0, x, y, q)
          const copia = JSON.stringify(e)
          const r1 = aplicarComando(e, { tipo: 'UsarHerramienta', x: x as number, y: y as number })
          const r2 = aplicarComando(e, { tipo: 'UsarHerramienta', x: x as number, y: y as number })
          expect(r1).toEqual(r2)
          const esp = esperado(e, x, y)
          const clave = esp ?? `ok:${e.herramienta}`
          vistos.set(clave, (vistos.get(clave) ?? 0) + 1)
          if (esp === undefined) {
            expect(r1.ok, JSON.stringify(r1.ok ? null : r1.error)).toBe(true)
            if (r1.ok) {
              // Un uso aceptado gasta energía (nunca baja de 0) y solo cambia lo que su efecto dice.
              const i = (y as number) * LADO + (x as number)
              let previsto: EstadoJuego = e
              const eventosPropios: unknown[] = []
              const poner = (car: string) => e.tierra.slice(0, i) + car + e.tierra.slice(i + 1)
              const marchita = e.plantas.some((pl) => pl[0] === i && pl[5] === 1)
              if (e.herramienta === 'azada' && marchita) {
                previsto = {
                  ...e,
                  tierra: poner(CARACTER_ARADA),
                  plantas: e.plantas.filter((pl) => pl[0] !== i),
                }
                eventosPropios.push({
                  tipo: 'marchita-limpiada',
                  x: (x as number) + 0,
                  y: (y as number) + 0,
                })
                vistos.set('marchita-limpiada', (vistos.get('marchita-limpiada') ?? 0) + 1)
              } else if (e.herramienta === 'azada') {
                previsto = { ...e, tierra: poner(CARACTER_ARADA) }
                eventosPropios.push({
                  tipo: 'tierra-arada',
                  x: (x as number) + 0,
                  y: (y as number) + 0,
                })
              } else if (e.herramienta === 'regadera') {
                previsto = { ...e, tierra: poner(CARACTER_REGADA) }
                eventosPropios.push({
                  tipo: 'tierra-regada',
                  x: (x as number) + 0,
                  y: (y as number) + 0,
                })
              } else if (e.herramienta === 'semillas') {
                const cultivo = cultivoDeSemilla(e.semillaElegida)!
                previsto = {
                  ...e,
                  // Sembrar deja la tierra seca (`a`) salvo que estuviera regada (`A`).
                  tierra: poner(e.tierra[i] === CARACTER_REGADA ? CARACTER_REGADA : CARACTER_ARADA),
                  inventario: quitarObjeto(e.inventario, e.semillaElegida!, 1)!,
                  plantas: [...e.plantas, [i, CULTIVOS.indexOf(cultivo), 0, 0, 0, 0] as const].sort(
                    (a, b) => a[0] - b[0],
                  ),
                }
                eventosPropios.push({
                  tipo: 'planta-sembrada',
                  x: (x as number) + 0,
                  y: (y as number) + 0,
                  cultivo,
                })
              }
              if (e.herramienta === 'hacha' || e.herramienta === 'pico') {
                const o = e.obstaculos.find((b) => b.x === x && b.y === y)
                const objetivo = e.herramienta === 'hacha' ? o?.tipo !== 'roca' : o?.tipo === 'roca'
                if (o && objetivo) {
                  const terreno =
                    e.valle.parcelas[
                      Math.floor((y as number) / e.valle.casillasPorParcela) *
                        e.valle.parcelasPorLado +
                        Math.floor((x as number) / e.valle.casillasPorParcela)
                    ]!.terreno
                  const necesarios =
                    o.tipo === 'arbol'
                      ? CONFIG_RECURSOS.arbol.golpes[terreno]
                      : o.tipo === 'roca'
                        ? CONFIG_RECURSOS.roca.golpes[terreno]
                        : 1
                  const dados = (o.golpes ?? 0) + 1
                  if (dados < necesarios) {
                    previsto = {
                      ...e,
                      obstaculos: e.obstaculos.map((b) => (b === o ? { ...o, golpes: dados } : b)),
                    }
                    eventosPropios.push({
                      tipo: 'obstaculo-golpeado',
                      obstaculo: o.tipo,
                      x: (x as number) + 0,
                      y: (y as number) + 0,
                      restantes: necesarios - dados,
                    })
                    vistos.set('golpe', (vistos.get('golpe') ?? 0) + 1)
                  } else {
                    const madera = o.tipo === 'arbol' ? CONFIG_RECURSOS.arbol.madera[terreno] : 0
                    const piedra = o.tipo === 'roca' ? CONFIG_RECURSOS.roca.piedra[terreno] : 0
                    let inv = e.inventario
                    let rng = e.rng
                    let plantones = 0
                    let perdido = false
                    if (o.tipo === 'arbol') {
                      const sorteo = siguienteAleatorio(rng)
                      rng = sorteo.estadoRng
                      if (sorteo.valor < CONFIG_RECURSOS.arbol.probabilidadPlanton) {
                        const nuevo = anadirObjeto(
                          inv,
                          'planton',
                          CONFIG_RECURSOS.arbol.plantones,
                          capacidadInventario(e.edificios),
                        )
                        if (nuevo) {
                          inv = nuevo
                          plantones = CONFIG_RECURSOS.arbol.plantones
                        } else perdido = true
                      }
                    }
                    previsto = {
                      ...e,
                      rng,
                      inventario: inv,
                      obstaculos: e.obstaculos.filter((b) => b !== o),
                      materiales: {
                        madera: e.materiales.madera + madera,
                        piedra: e.materiales.piedra + piedra,
                      },
                    }
                    eventosPropios.push({
                      tipo: 'obstaculo-quitado',
                      obstaculo: o.tipo,
                      x: (x as number) + 0,
                      y: (y as number) + 0,
                      madera,
                      piedra,
                      plantones,
                    })
                    if (perdido) {
                      eventosPropios.push({
                        tipo: 'planton-perdido',
                        x: (x as number) + 0,
                        y: (y as number) + 0,
                      })
                      vistos.set('perdido', (vistos.get('perdido') ?? 0) + 1)
                    }
                    vistos.set('quitado-' + o.tipo, (vistos.get('quitado-' + o.tipo) ?? 0) + 1)
                  }
                }
              } else if (
                e.herramienta === 'mano' &&
                cantidadDe(e.inventario, 'planton') >= 1 &&
                puedePlantarPlanton(e, x as number, y as number)
              ) {
                // M5-06: la mano planta el plantón (el estado gana un obstáculo y pierde uno del inventario).
                const nuevo = r1.estado.obstaculos[r1.estado.obstaculos.length - 1]!
                expect(nuevo).toMatchObject({
                  tipo: 'planton',
                  x,
                  y,
                  diaPlantado: e.dia,
                })
                previsto = {
                  ...e,
                  inventario: quitarObjeto(e.inventario, 'planton', 1)!,
                  obstaculos: [...e.obstaculos, nuevo],
                }
                eventosPropios.push({
                  tipo: 'planton-plantado',
                  x: (x as number) + 0,
                  y: (y as number) + 0,
                })
                vistos.set('plantado', (vistos.get('plantado') ?? 0) + 1)
              }
              expect({ ...r1.estado, energia: e.energia }).toEqual(previsto)
              expect(r1.estado.energia).toBe(e.energia - costeEnergia(e.herramienta))
              expect(r1.estado.energia).toBeGreaterThanOrEqual(0)
              expect(r1.eventos.slice(1)).toEqual(eventosPropios)
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
      { numRuns: 8000 },
    )
    // Que la muestra cubra de verdad cada veredicto (no solo rechazos).
    for (const v of [
      'ok:azada',
      'ok:semillas',
      'ok:regadera',
      'ok:mano',
      'parametro-invalido',
      'solo-en-vida',
      'en-pausa',
      'fuera-del-valle',
      'fuera-de-alcance',
      'sin-semilla-elegida',
      'sin-semillas',
    ])
      expect(vistos.get(v) ?? 0, v).toBeGreaterThan(5)
    // Los motivos de M5-03 son más raros (hay que acertar varias condiciones a la vez): al menos 1.
    for (const v of [
      'no-propia',
      'zona',
      'ocupada',
      'ya-arada',
      'obstaculo',
      'no-arada',
      'ya-regada',
      'planta-marchita',
      'planta-madura',
      'marchita-limpiada',
      'fuera-de-estacion',
      'sin-energia',
      'golpe',
      'quitado-arbol',
      'quitado-roca',
      'quitado-planton',
      'plantado',
    ])
      expect(vistos.get(v) ?? 0, v).toBeGreaterThan(0)
  })

  // Regresión del bug S3 hallado por el Rompedor: los eventos y el obstáculo nuevo de M5-06
  // conservaban -0; `usarHerramienta` ahora normaliza las coordenadas antes de aplicar el efecto.
  it('-0 en eventos de M5-06: las coordenadas se normalizan como en la azada', () => {
    const e0 = crearEstadoInicial({ semilla: 11 })
    const lado = ladoValle(e0.valle)
    const casilla = 1 // casilla (1, 0): propia, con el personaje en (0.5, 0.5)
    const propia = {
      ...e0,
      valle: {
        ...e0.valle,
        parcelas: e0.valle.parcelas.map((p, k) =>
          k === 0 ? { ...p, estado: 'propia' as const } : p,
        ),
      },
      personaje: { x: 1.5, y: 1.5, orientacion: 'sur' as const },
      energia: ENERGIA_MAXIMA,
    }
    expect(lado).toBeGreaterThan(casilla)
    const golpeado = aplicarComando(
      {
        ...propia,
        herramienta: 'hacha' as Herramienta,
        obstaculos: [{ tipo: 'arbol' as const, x: 0, y: 0, variante: 0 }],
      },
      { tipo: 'UsarHerramienta', x: -0, y: -0 },
    )
    expect(golpeado.ok).toBe(true)
    if (!golpeado.ok) return
    for (const ev of golpeado.eventos) {
      if ('x' in ev) expect(Object.is(ev.x, -0), ev.tipo).toBe(false)
      if ('y' in ev) expect(Object.is(ev.y, -0), ev.tipo).toBe(false)
    }
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
