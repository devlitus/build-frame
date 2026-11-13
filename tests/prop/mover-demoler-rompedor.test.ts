/* eslint-disable @typescript-eslint/no-non-null-assertion -- catálogo e ids conocidos en tests */
/**
 * Rompedor · M4-06 Mover y demoler (sistema crítico: economía y construcción).
 * Ataques sobre el núcleo:
 * - economía: patrimonio (dinero + materiales + lo pagado por lo que sigue en pie) que nunca crece,
 *   reembolso previsto = aplicado = evento, redondeo con costes impares, quitar dos veces,
 *   `limite-de-recursos` exactamente cuando una suma deja de ser un entero seguro;
 * - mover: `comprobarMover` frente a un oráculo (construir en el estado sin ese edificio), bordes del
 *   valle, huellas grandes desplazadas una casilla, aparición y personaje, alcance tras mover;
 * - D9: la casa movida despierta al personaje en su puerta o, si no se puede, en el respaldo;
 * - el refactor `estadoDeEdificiosValido` no cambia `comprobarConstruir` (oráculo copiado de antes).
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillaBloqueada,
  casillasOcupadas,
  CONFIG_EDIFICIOS,
  CONFIG_PERSONAJE,
  colocacionValida,
  comprobarConstruir,
  comprobarMover,
  crearEstadoInicial,
  defEdificio,
  edificiosValidos,
  huellaDe,
  ladoValle,
  mapaTransitabilidad,
  puertaDe,
  reembolso,
  type Comando,
  type Coste,
  type EstadoJuego,
  type TipoEdificio,
} from '../../src/core'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const RECURSOS = ['dinero', 'madera', 'piedra'] as const

/** Plano con todas las parcelas propias, vivienda a la izquierda y almacén a la derecha. */
function preparar(semilla: number): EstadoJuego {
  let e = crearEstadoInicial({ semilla, dineroInicial: 100_000 })
  e = {
    ...e,
    valle: { ...e.valle, parcelas: e.valle.parcelas.map((p) => ({ ...p, estado: 'propia' })) },
  }
  const lado = ladoValle(e.valle)
  const mitad = Math.floor(lado / 2)
  for (const c of [
    { tipo: 'PintarZona', x0: 0, y0: 0, x1: mitad - 1, y1: lado - 1, zona: 'vivienda' },
    { tipo: 'PintarZona', x0: mitad, y0: 0, x1: lado - 1, y1: lado - 1, zona: 'almacen' },
    { tipo: 'CambiarModo', modo: 'plano' },
  ] as Comando[]) {
    const r = aplicarComando(e, c)
    if (r.ok) e = r.estado
  }
  return { ...e, dinero: 5_000, materiales: { madera: 600, piedra: 150 } }
}

const VACIAS = [3, 42, 7].map(preparar)
const LADO = ladoValle(VACIAS[0]!.valle)

/** Sitios válidos (sin costes) por tipo, cada 2 casillas, en el valle vacío. */
const SITIOS = VACIAS.map(
  (e) =>
    Object.fromEntries(
      TIPOS.map((t) => {
        const l: { x: number; y: number }[] = []
        for (let y = 0; y < LADO; y += 2) {
          for (let x = 0; x < LADO; x += 2) {
            if (colocacionValida(e, t, x, y, { ignorarCostes: true }).valida) l.push({ x, y })
          }
        }
        return [t, l]
      }),
    ) as Record<TipoEdificio, { x: number; y: number }[]>,
)

/** Valle con edificios ya hechos: casa, 3 cajas y 2 cobertizos terminados, y 2 obras. */
const BASES = VACIAS.map((vacia, b) => {
  let e: EstadoJuego = { ...vacia, dinero: 100_000, materiales: { madera: 5_000, piedra: 1_000 } }
  const levantar = (tipo: TipoEdificio, salto: number) => {
    const l = SITIOS[b]![tipo]
    for (let k = 0; k < l.length; k++) {
      const s = l[(k * 7 + salto * 13) % l.length]!
      const r = aplicarComando(e, { tipo: 'Construir', tipoEdificio: tipo, ...s })
      if (r.ok) {
        e = r.estado
        return
      }
    }
  }
  levantar('casa', 0)
  for (let i = 1; i <= 3; i++) levantar('caja-envio', i)
  for (let i = 4; i <= 5; i++) levantar('cobertizo', i)
  e = { ...e, edificios: e.edificios.map((o) => ({ ...o, obra: null })) }
  levantar('caja-envio', 6)
  levantar('cobertizo', 7)
  return { ...e, dinero: 5_000, materiales: { madera: 600, piedra: 150 } }
})

type Paso =
  | { k: 'construir'; tipo: TipoEdificio; i: number }
  /** Mover un edificio existente (índice en la lista) a un sitio del catálogo de sitios. */
  | { k: 'moverSitio'; n: number; i: number }
  /** Mover un edificio existente a su posición + (dx, dy): solapes con su propia huella y bordes. */
  | { k: 'moverCerca'; n: number; dx: number; dy: number }
  /** Mover a una casilla cualquiera, también fuera del valle. */
  | { k: 'moverLibre'; n: number; x: number; y: number }
  | { k: 'demoler'; n: number }
  | { k: 'cancelar'; n: number }
  | { k: 'dia' }

const arbPaso: fc.Arbitrary<Paso> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      k: fc.constant('construir' as const),
      tipo: fc.constantFrom(...TIPOS),
      i: fc.nat(10_000),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('moverSitio' as const),
      n: fc.nat(9),
      i: fc.nat(10_000),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('moverCerca' as const),
      n: fc.nat(9),
      dx: fc.integer({ min: -4, max: 4 }),
      dy: fc.integer({ min: -4, max: 4 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant('moverLibre' as const),
      n: fc.nat(9),
      x: fc.integer({ min: -4, max: LADO + 4 }),
      y: fc.integer({ min: -4, max: LADO + 4 }),
    }),
  },
  { weight: 4, arbitrary: fc.record({ k: fc.constant('demoler' as const), n: fc.nat(9) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('cancelar' as const), n: fc.nat(9) }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('dia' as const) }) },
)

function comandos(
  e: EstadoJuego,
  p: Paso,
  sitios: Record<TipoEdificio, { x: number; y: number }[]>,
): Comando[] {
  const ed = 'n' in p ? e.edificios[p.n % Math.max(1, e.edificios.length)] : undefined
  // Un id inexistente también vale: comprueba el error.
  const id = ed?.id ?? 999
  switch (p.k) {
    case 'construir': {
      const l = sitios[p.tipo]
      const s = l[p.i % Math.max(1, l.length)] ?? { x: 0, y: 0 }
      return [{ tipo: 'Construir', tipoEdificio: p.tipo, ...s }]
    }
    case 'moverSitio': {
      const l = sitios[ed?.tipo ?? 'caja-envio']
      const s = l[p.i % Math.max(1, l.length)] ?? { x: 0, y: 0 }
      return [{ tipo: 'MoverEdificio', id, ...s }]
    }
    case 'moverCerca':
      return [{ tipo: 'MoverEdificio', id, x: (ed?.x ?? 0) + p.dx, y: (ed?.y ?? 0) + p.dy }]
    case 'moverLibre':
      return [{ tipo: 'MoverEdificio', id, x: p.x, y: p.y }]
    case 'demoler':
      return [{ tipo: 'DemolerEdificio', id }]
    case 'cancelar':
      return [{ tipo: 'CancelarObra', id }]
    case 'dia':
      return [
        { tipo: 'CambiarModo', modo: 'vida' },
        { tipo: 'AvanzarTiempo', minutos: 100_000 },
        { tipo: 'CambiarModo', modo: 'plano' },
      ]
  }
}

/** Lo pagado de un edificio (como lo lee `reembolso`). */
const pagado = (e: EstadoJuego['edificios'][number]): Coste =>
  e.pagado ?? defEdificio(e.tipo)!.coste

/** Dinero/materiales más lo pagado por lo que sigue en pie: construir, mover y cancelar lo conservan. */
function patrimonio(e: EstadoJuego): Coste {
  const t = { dinero: e.dinero, madera: e.materiales.madera, piedra: e.materiales.piedra }
  for (const b of e.edificios) {
    const p = pagado(b)
    t.dinero += p.dinero
    t.madera += p.madera
    t.piedra += p.piedra
  }
  return t
}
const recurso = (e: EstadoJuego, r: (typeof RECURSOS)[number]) =>
  r === 'dinero' ? e.dinero : e.materiales[r]

/** Celdas alcanzables (no bloqueadas en el mapa de transitabilidad). */
function alcanzables(e: EstadoJuego): Set<number> {
  const m = mapaTransitabilidad(e)
  const s = new Set<number>()
  for (let i = 0; i < m.bloqueada.length; i++) if (m.bloqueada[i] === 0) s.add(i)
  return s
}

const partidas = fc.tuple(
  fc.nat(BASES.length - 1),
  fc.array(arbPaso, { minLength: 1, maxLength: 30 }),
)

describe('M4-06 rompedor · economía', () => {
  it('el patrimonio nunca crece, nada es negativo y solo demoler lo reduce (exactamente lo que no devuelve)', () => {
    fc.assert(
      fc.property(partidas, ([b, pasos]) => {
        let e = BASES[b]!
        const p0 = patrimonio(e)
        for (const p of pasos) {
          for (const c of comandos(e, p, SITIOS[b]!)) {
            const antes = patrimonio(e)
            const r = aplicarComando(e, c)
            if (!r.ok) {
              expect(r.estado).toBe(e)
              continue
            }
            const despues = patrimonio(r.estado)
            for (const k of RECURSOS) {
              expect(recurso(r.estado, k)).toBeGreaterThanOrEqual(0)
              expect(Number.isSafeInteger(recurso(r.estado, k))).toBe(true)
              if (c.tipo === 'DemolerEdificio') {
                const ed = e.edificios.find((x) => x.id === c.id)!
                // Lo perdido es lo que no se devuelve: pagado - floor(pagado / 2).
                expect(antes[k] - despues[k]).toBe(pagado(ed)[k] - Math.floor(pagado(ed)[k] / 2))
              } else expect(despues[k]).toBe(antes[k])
            }
            e = r.estado
          }
        }
        // Al quitar todo lo que se pueda (cancelar obras, demoler lo demolible) nunca hay más que al inicio.
        for (const ed of e.edificios) {
          const r = aplicarComando(e, {
            tipo: ed.obra ? 'CancelarObra' : 'DemolerEdificio',
            id: ed.id,
          })
          if (r.ok) e = r.estado
        }
        for (const k of RECURSOS) expect(recurso(e, k)).toBeLessThanOrEqual(p0[k])
      }),
      { numRuns: 150 },
    )
  })

  it('el reembolso previsto (confirmación) es el del evento y el aplicado; quitar dos veces falla', () => {
    fc.assert(
      fc.property(partidas, ([b, pasos]) => {
        let e = BASES[b]!
        for (const p of pasos) {
          for (const c of comandos(e, p, SITIOS[b]!)) {
            if (c.tipo === 'DemolerEdificio' || c.tipo === 'CancelarObra') {
              const previsto = reembolso(e, c.id)
              const r = aplicarComando(e, c)
              if (r.ok) {
                expect(previsto).toBeDefined()
                expect(previsto!.accion).toBe(c.tipo === 'DemolerEdificio' ? 'demoler' : 'cancelar')
                expect(r.eventos).toHaveLength(1)
                expect((r.eventos[0] as { reembolso: Coste }).reembolso).toEqual(previsto!.coste)
                expect(r.estado.dinero - e.dinero).toBe(previsto!.coste.dinero)
                expect(r.estado.materiales.madera - e.materiales.madera).toBe(
                  previsto!.coste.madera,
                )
                expect(r.estado.materiales.piedra - e.materiales.piedra).toBe(
                  previsto!.coste.piedra,
                )
                // Segunda vez, con cualquiera de los dos comandos: inexistente y sin cambios.
                for (const tipo of ['DemolerEdificio', 'CancelarObra'] as const) {
                  const otra = aplicarComando(r.estado, { tipo, id: c.id })
                  expect(otra).toMatchObject({ ok: false, error: 'edificio-inexistente' })
                  expect(otra.estado).toBe(r.estado)
                }
                e = r.estado
              } else {
                expect(r.estado).toBe(e)
              }
              continue
            }
            e = aplicarComando(e, c).estado
          }
        }
      }),
      { numRuns: 150 },
    )
  })

  it('redondeo: con lo pagado arbitrario (impares incluidos) demoler devuelve floor(p/2) y cancelar p', () => {
    const base = BASES[1]!
    const s = SITIOS[1]!['cobertizo'][0]!
    const obra = aplicarComando(base, { tipo: 'Construir', tipoEdificio: 'cobertizo', ...s })
    if (!obra.ok) throw new Error('no se pudo construir')
    const id = obra.estado.siguienteIdEdificio - 1
    fc.assert(
      fc.property(
        fc.record({
          dinero: fc.nat({ max: 2 ** 40 }),
          madera: fc.nat({ max: 2 ** 40 }),
          piedra: fc.nat({ max: 2 ** 40 }),
        }),
        fc.boolean(),
        (p, terminada) => {
          const e: EstadoJuego = {
            ...obra.estado,
            edificios: obra.estado.edificios.map((b) =>
              b.id === id ? { ...b, pagado: p, obra: terminada ? null : b.obra } : b,
            ),
          }
          const r = aplicarComando(e, { tipo: terminada ? 'DemolerEdificio' : 'CancelarObra', id })
          expect(r.ok).toBe(true)
          for (const k of RECURSOS) {
            const esperado = terminada ? Math.floor(p[k] / 2) : p[k]
            expect(recurso(r.estado, k) - recurso(e, k)).toBe(esperado)
          }
        },
      ),
      { numRuns: 400 },
    )
  })

  it('`limite-de-recursos` aparece si y solo si alguna suma del reembolso deja de ser un entero seguro', () => {
    const base = BASES[1]!
    const s = SITIOS[1]!['cobertizo'][0]!
    const obra = aplicarComando(base, { tipo: 'Construir', tipoEdificio: 'cobertizo', ...s })
    if (!obra.ok) throw new Error('no se pudo construir')
    const id = obra.estado.siguienteIdEdificio - 1
    const M = Number.MAX_SAFE_INTEGER
    const cerca = fc.oneof(fc.nat(1000), fc.integer({ min: M - 400, max: M }))
    fc.assert(
      fc.property(cerca, cerca, cerca, fc.boolean(), (dinero, madera, piedra, terminada) => {
        const e: EstadoJuego = {
          ...obra.estado,
          dinero,
          materiales: { madera, piedra },
          edificios: obra.estado.edificios.map((b) =>
            b.id === id ? { ...b, obra: terminada ? null : b.obra } : b,
          ),
        }
        const prev = reembolso(e, id)!
        const desborda = RECURSOS.some((k) => !Number.isSafeInteger(recurso(e, k) + prev.coste[k]))
        const r = aplicarComando(e, { tipo: terminada ? 'DemolerEdificio' : 'CancelarObra', id })
        if (desborda) {
          expect(r).toMatchObject({ ok: false, error: 'limite-de-recursos' })
          expect(r.estado).toBe(e)
        } else expect(r.ok).toBe(true)
      }),
      { numRuns: 600 },
    )
  })
})

describe('M4-06 rompedor · cobertura de los generadores', () => {
  it('con una semilla fija las partidas mueven, demuelen, cancelan y rechazan de verdad', () => {
    const vistos = new Map<string, number>()
    const contar = (k: string) => vistos.set(k, (vistos.get(k) ?? 0) + 1)
    fc.assert(
      fc.property(partidas, ([b, pasos]) => {
        let e = BASES[b]!
        for (const p of pasos) {
          for (const c of comandos(e, p, SITIOS[b]!)) {
            const r = aplicarComando(e, c)
            if (r.ok) for (const ev of r.eventos) contar(ev.tipo)
            else contar(`${c.tipo}:${r.error}`)
            e = r.estado
          }
        }
      }),
      { numRuns: 150, seed: 20261113 },
    )
    for (const k of ['edificio-movido', 'edificio-demolido', 'obra-cancelada', 'obra-terminada']) {
      expect(vistos.get(k) ?? 0, k).toBeGreaterThan(15)
    }
    for (const k of [
      'MoverEdificio:ocupada',
      'MoverEdificio:fuera-del-valle',
      'MoverEdificio:en-obra',
    ]) {
      expect(vistos.get(k) ?? 0, k).toBeGreaterThan(0)
    }
  })
})

describe('M4-06 rompedor · mover', () => {
  it('comprobarMover = construir (sin costes) en el estado sin ese edificio, en cualquier casilla; obras: en-obra', () => {
    fc.assert(
      fc.property(
        partidas,
        fc.nat(9),
        fc.integer({ min: -5, max: LADO + 5 }),
        fc.integer({ min: -5, max: LADO + 5 }),
        fc.boolean(),
        fc.integer({ min: -3, max: 3 }),
        fc.integer({ min: -3, max: 3 }),
        ([b, pasos], n, x, y, cerca, dx, dy) => {
          let e = BASES[b]!
          for (const p of pasos)
            for (const c of comandos(e, p, SITIOS[b]!)) e = aplicarComando(e, c).estado
          const ed = e.edificios[n % Math.max(1, e.edificios.length)]
          if (!ed) return
          const tx = cerca ? ed.x + dx : x
          const ty = cerca ? ed.y + dy : y
          const v = comprobarMover(e, ed.id, tx, ty)
          if (ed.obra) {
            expect(v).toBe('en-obra')
            return
          }
          const sinEl = { ...e, edificios: e.edificios.filter((o) => o.id !== ed.id) }
          const oraculo = colocacionValida(sinEl, ed.tipo, tx, ty, { ignorarCostes: true })
          expect(v).toBe(oraculo.valida ? undefined : oraculo.motivo)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('tras cada movimiento aceptado: dentro del valle, sin solapes, sin tapar aparición ni personaje, y nada alcanzable se pierde', () => {
    const m = CONFIG_PERSONAJE.tamanoCaja / 2
    fc.assert(
      fc.property(partidas, ([b, pasos]) => {
        let e = BASES[b]!
        for (const p of pasos) {
          for (const c of comandos(e, p, SITIOS[b]!)) {
            const r = aplicarComando(e, c)
            if (c.tipo === 'MoverEdificio' && r.ok && r.estado !== e) {
              const ed = r.estado.edificios.find((o) => o.id === c.id)!
              const h = huellaDe(defEdificio(ed.tipo)!, ed.x, ed.y)
              expect(h.x0 >= 0 && h.y0 >= 0 && h.x1 < LADO && h.y1 < LADO).toBe(true)
              let celdas = 0
              for (const o of r.estado.edificios) {
                const d = defEdificio(o.tipo)!
                celdas += d.ancho * d.alto
              }
              expect(casillasOcupadas(r.estado.edificios, LADO).size).toBe(celdas)
              const ax = Math.floor(r.estado.aparicion.x)
              const ay = Math.floor(r.estado.aparicion.y)
              expect(ax >= h.x0 && ax <= h.x1 && ay >= h.y0 && ay <= h.y1).toBe(false)
              const { x: px, y: py } = r.estado.personaje
              const toca =
                Math.floor(px - m) <= h.x1 &&
                Math.ceil(px + m) - 1 >= h.x0 &&
                Math.floor(py - m) <= h.y1 &&
                Math.ceil(py + m) - 1 >= h.y0
              expect(toca).toBe(false)
              // Lo que era alcanzable antes sigue siéndolo, salvo la nueva huella.
              const antes = alcanzables(e)
              const despues = alcanzables(r.estado)
              for (const k of antes) {
                const cx = k % LADO
                const cy = Math.floor(k / LADO)
                const enHuella = cx >= h.x0 && cx <= h.x1 && cy >= h.y0 && cy <= h.y1
                if (!enHuella) expect(despues.has(k)).toBe(true)
              }
            }
            e = r.estado
          }
        }
      }),
      { numRuns: 120 },
    )
  })

  it('casa: no se puede mover sobre la aparición ni sobre el personaje', () => {
    const e0 = BASES[1]!
    const s = SITIOS[1]!['casa'][0]!
    let e = aplicarComando(e0, { tipo: 'Construir', tipoEdificio: 'casa', ...s }).estado
    const id = e.siguienteIdEdificio - 1
    e = { ...e, edificios: e.edificios.map((b) => ({ ...b, obra: null })) }
    const ax = Math.floor(e.aparicion.x)
    const ay = Math.floor(e.aparicion.y)
    // Cualquier esquina que cubra la aparición.
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const v = comprobarMover(e, id, ax - dx, ay - dy)
        expect(v).not.toBeUndefined()
      }
    }
    // Personaje lejos de la aparición, en una casilla de vivienda libre.
    const sitio = SITIOS[1]!['casa'].find(
      (q) => Math.abs(q.x - s.x) > 6 || Math.abs(q.y - s.y) > 6,
    )!
    const conPj = { ...e, personaje: { ...e.personaje, x: sitio.x + 1.5, y: sitio.y + 1.5 } }
    expect(comprobarMover(conPj, id, sitio.x, sitio.y)).toBe('personaje')
  })

  it('D9: tras mover la casa, el desmayo despierta en su puerta o, si no se puede, en una casilla libre alcanzable', () => {
    fc.assert(
      fc.property(partidas, fc.nat(10_000), fc.boolean(), ([b, pasos], i, taparPuerta) => {
        let e = BASES[b]!
        for (const p of pasos)
          for (const c of comandos(e, p, SITIOS[b]!)) e = aplicarComando(e, c).estado
        // Una casa terminada (si no la hay, se construye y termina).
        let casa = e.edificios.find((o) => o.tipo === 'casa')
        if (!casa) {
          const l = SITIOS[b]!['casa'].filter(
            (q) => comprobarConstruir({ ...e, dinero: 0 }, 'casa', q.x, q.y) === undefined,
          )
          if (l.length === 0) return
          const r = aplicarComando(e, {
            tipo: 'Construir',
            tipoEdificio: 'casa',
            ...l[i % l.length]!,
          })
          if (!r.ok) return
          e = r.estado
          casa = e.edificios.find((o) => o.tipo === 'casa')!
        }
        e = {
          ...e,
          edificios: e.edificios.map((o) => (o.id === casa!.id ? { ...o, obra: null } : o)),
        }
        // Moverla a cualquier sitio válido.
        const destinos: { x: number; y: number }[] = []
        for (let y = 0; y < LADO; y += 3) {
          for (let x = 0; x < LADO; x += 3) {
            if (comprobarMover(e, casa.id, x, y) === undefined) destinos.push({ x, y })
          }
        }
        if (destinos.length === 0) return
        const d = destinos[i % destinos.length]!
        const movida = aplicarComando(e, { tipo: 'MoverEdificio', id: casa.id, ...d })
        expect(movida.ok).toBe(true)
        let s = movida.estado
        const def = defEdificio('casa')!
        const puerta = puertaDe(def, d.x, d.y)
        if (taparPuerta) {
          // Una caja de envío justo en la puerta (si se puede): obliga a usar el respaldo.
          const caja = aplicarComando(
            { ...s, dinero: 1000, materiales: { madera: 100, piedra: 0 } },
            { tipo: 'Construir', tipoEdificio: 'caja-envio', ...puerta },
          )
          if (caja.ok) {
            s = {
              ...caja.estado,
              edificios: caja.estado.edificios.map((o) => ({ ...o, obra: null })),
            }
          }
        }
        const dormido = aplicarComando(
          { ...s, modo: 'vida' },
          { tipo: 'AvanzarTiempo', minutos: 100_000 },
        )
        expect(dormido.ok).toBe(true)
        const pj = dormido.estado.personaje
        const mapa = mapaTransitabilidad(dormido.estado)
        const cx = Math.floor(pj.x)
        const cy = Math.floor(pj.y)
        // Nunca dentro de un edificio ni en una casilla no alcanzable.
        expect(casillaBloqueada(mapa, cx, cy)).toBe(false)
        const libre = !casillaBloqueada(mapa, puerta.x, puerta.y)
        const tapada = dormido.estado.edificios.some((o) => {
          const h = huellaDe(defEdificio(o.tipo)!, o.x, o.y)
          return puerta.x >= h.x0 && puerta.x <= h.x1 && puerta.y >= h.y0 && puerta.y <= h.y1
        })
        if (libre && !tapada) {
          // La puerta libre gana, salvo que la caja de colisión no quepa (se acepta el respaldo cercano).
          const dist = Math.hypot(cx - puerta.x, cy - puerta.y)
          expect(dist).toBeLessThanOrEqual(Math.SQRT2 * 2)
        }
        // La casa no se ha movido con el día y su puerta sigue donde la dejamos.
        expect(dormido.estado.edificios.find((o) => o.id === casa!.id)).toMatchObject(d)
      }),
      { numRuns: 120 },
    )
  })
})

describe('M4-06 rompedor · refactor estadoDeEdificiosValido', () => {
  /** `comprobarConstruir` como estaba antes del refactor (copiado de hito/M4-zonas-construccion). */
  function comprobarAntiguo(estado: EstadoJuego, tipo: unknown, x: number, y: number) {
    if (typeof tipo !== 'string' || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      return 'parametro-invalido'
    }
    if (estado.modo !== 'plano') return 'solo-en-plano'
    if (
      !edificiosValidos(estado.edificios) ||
      typeof estado.zonas !== 'string' ||
      typeof estado.materiales !== 'object' ||
      estado.materiales === null ||
      !Number.isSafeInteger(estado.materiales.madera) ||
      !Number.isSafeInteger(estado.materiales.piedra) ||
      estado.materiales.madera < 0 ||
      estado.materiales.piedra < 0 ||
      !Number.isSafeInteger(estado.siguienteIdEdificio)
    ) {
      return 'estado-invalido'
    }
    const r = colocacionValida(estado, tipo, x, y)
    if (!r.valida) return r.motivo
    const def = defEdificio(tipo)
    if (!def) return 'tipo-desconocido'
    if (!Number.isSafeInteger(estado.dia + def.dias)) return 'limite-de-dia'
    return 'ok'
  }

  it('coincide con el oráculo con estados raros (materiales, ids, zonas, edificios corruptos)', () => {
    const raro = fc.constantFrom<unknown>(
      0,
      5,
      -1,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      2 ** 53,
      -0,
      '3',
      null,
      undefined,
    )
    fc.assert(
      fc.property(
        fc.nat(BASES.length - 1),
        fc.constantFrom(...TIPOS, 'nada'),
        fc.integer({ min: -3, max: LADO + 3 }),
        fc.integer({ min: -3, max: LADO + 3 }),
        raro,
        raro,
        raro,
        fc.constantFrom<unknown>('ok', null, 7, undefined),
        fc.constantFrom<unknown>(
          'ok',
          null,
          [{ id: 1 }],
          [{ id: 1, x: 0, y: 0, tipo: 'casa', obra: 3 }],
        ),
        fc.constantFrom<unknown>('ok', null, { madera: 1 }),
        (b, tipo, x, y, madera, piedra, sig, zonas, edificios, materialesObj) => {
          const e0 = BASES[b]!
          const e = {
            ...e0,
            materiales:
              materialesObj === 'ok'
                ? { madera, piedra }
                : (materialesObj as EstadoJuego['materiales']),
            siguienteIdEdificio: sig,
            zonas: zonas === 'ok' ? e0.zonas : zonas,
            edificios: edificios === 'ok' ? e0.edificios : edificios,
          } as unknown as EstadoJuego
          let antiguo: string
          let nuevo: string
          try {
            antiguo = comprobarAntiguo(e, tipo, x, y)
          } catch {
            antiguo = 'lanza'
          }
          try {
            nuevo = comprobarConstruir(e, tipo, x, y) ?? 'ok'
          } catch {
            nuevo = 'lanza'
          }
          expect(nuevo).toBe(antiguo)
        },
      ),
      { numRuns: 1500 },
    )
  })
})

describe('M4-06 rompedor · datos D8', () => {
  it('reembolsoDemolicion 0,5 abajo y la casa es la única no demolible', () => {
    expect(CONFIG_EDIFICIOS.reembolsoDemolicion).toBe(0.5)
    expect(CONFIG_EDIFICIOS.redondeoReembolso).toBe('abajo')
    for (const t of TIPOS) expect(defEdificio(t)!.demolible).toBe(t !== 'casa')
  })
})
