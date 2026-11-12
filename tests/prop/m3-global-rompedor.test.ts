/**
 * Rompedor · pasada global de M3 (Parcelas): partidas largas sobre el núcleo que mezclan la
 * compra con el tiempo, el personaje, los modos, la pausa y los desmayos; y balance con la
 * economía real (data/economia.json) sobre cientos de semillas.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  CONFIG_ECONOMIA,
  CONFIG_PERSONAJE,
  CONFIG_TIEMPO,
  MODOS_JUEGO,
  aplicarComando,
  aplicarComandos,
  casillaBloqueada,
  crearEstadoInicial,
  mapaTransitabilidad,
  parcelaComprable,
  precioParcela,
  tiempoDetenido,
  type Comando,
  type EstadoJuego,
} from '../../src/core'
import { Partida } from '../../src/game/partida'

const N = 36

const comando: fc.Arbitrary<Comando> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      tipo: fc.constant('ComprarParcela' as const),
      indice: fc.integer({ min: -2, max: N + 1 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      tipo: fc.constant('AvanzarTiempo' as const),
      minutos: fc.integer({ min: 0, max: 1500 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      tipo: fc.constant('MoverPersonaje' as const),
      dx: fc.constantFrom(-1, -0.5, 0, 0.7, 1),
      dy: fc.constantFrom(-1, -0.5, 0, 0.7, 1),
      ms: fc.integer({ min: 0, max: 400 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      tipo: fc.constant('CambiarModo' as const),
      modo: fc.constantFrom(...MODOS_JUEGO),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ tipo: 'Pausar' as const }) },
  { weight: 1, arbitrary: fc.constant({ tipo: 'Reanudar' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      tipo: fc.constant('CambiarVelocidad' as const),
      velocidad: fc.constantFrom(...CONFIG_TIEMPO.velocidades),
    }),
  },
  // Desmayo seguro: llevar el reloj más allá de las 02:00 (si el tiempo corre).
  { weight: 1, arbitrary: fc.constant({ tipo: 'AvanzarTiempo' as const, minutos: 1300 }) },
  // Ruido: compras con índices no enteros o de otro tipo.
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      { tipo: 'ComprarParcela', indice: 1.5 } as unknown as Comando,
      { tipo: 'ComprarParcela', indice: '3' } as unknown as Comando,
      { tipo: 'ComprarParcela', indice: Number.NaN } as unknown as Comando,
      { tipo: 'ComprarParcela', indice: -0 } as unknown as Comando,
      { tipo: 'ComprarParcela' } as unknown as Comando,
    ),
  },
)

function propias(e: EstadoJuego): number[] {
  return e.valle.parcelas.flatMap((p, i) => (p.estado === 'propia' ? [i] : []))
}

function bloque4Conexo(e: EstadoJuego): boolean {
  const ps = propias(e)
  if (ps.length <= 1) return true
  const n = e.valle.parcelasPorLado
  const set = new Set(ps)
  const vistos = new Set<number>([ps[0] as number])
  const pila = [ps[0] as number]
  while (pila.length) {
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
      if (set.has(j) && !vistos.has(j)) {
        vistos.add(j)
        pila.push(j)
      }
    }
  }
  return vistos.size === ps.length
}

function personajeLibre(e: EstadoJuego): boolean {
  const m = mapaTransitabilidad(e)
  const h = CONFIG_PERSONAJE.tamanoCaja / 2
  const { x, y } = e.personaje
  return [
    [x - h, y - h],
    [x + h - 1e-9, y - h],
    [x - h, y + h - 1e-9],
    [x + h - 1e-9, y + h - 1e-9],
  ].every(([cx, cy]) => !casillaBloqueada(m, Math.floor(cx as number), Math.floor(cy as number)))
}

describe('M3 global: partida larga con compras, tiempo, personaje, modos y desmayos', () => {
  it('invariantes de la economía, las parcelas y el personaje en cada paso', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.constantFrom(0, 259, 260, CONFIG_ECONOMIA.dineroInicial, 3000, 50_000, 10 ** 9),
        fc.array(comando, { minLength: 60, maxLength: 300 }),
        (semilla, inicial, comandos) => {
          let e = crearEstadoInicial({ semilla, dineroInicial: inicial })
          let gastado = 0
          let desmayos = 0
          for (const c of comandos) {
            const antes = e
            const precioEsperado =
              c.tipo === 'ComprarParcela' ? parcelaComprable(antes, c.indice) : undefined
            const r = aplicarComando(e, c)
            e = r.estado
            if (!r.ok) expect(e).toBe(antes)
            for (const ev of r.ok ? r.eventos : []) {
              if (ev.tipo === 'parcela-comprada') {
                gastado += ev.precio
                expect(precioEsperado?.comprable).toBe(true)
                expect(ev.precio).toBe(precioEsperado?.comprable ? precioEsperado.precio : NaN)
                expect(Object.is(ev.indice, -0)).toBe(false)
              }
              if (ev.tipo === 'desmayo') {
                desmayos++
                // El desmayo no toca el dinero, las propias ni las compras.
                expect(e.dinero).toBe(antes.dinero)
                expect(e.comprasHechas).toBe(antes.comprasHechas)
                expect(e.valle).toBe(antes.valle)
                expect(e.personaje).toEqual({ ...e.personaje, x: e.aparicion.x, y: e.aparicion.y })
              }
            }
            // La compra no toca el reloj ni el personaje; el tiempo y el personaje no tocan el dinero.
            if (c.tipo === 'ComprarParcela') {
              expect(e.dia).toBe(antes.dia)
              expect(e.minutoDelDia).toBe(antes.minutoDelDia)
              expect(e.personaje).toBe(antes.personaje)
              expect(e.modo).toBe(antes.modo)
              expect(e.pausado).toBe(antes.pausado)
            } else {
              expect(e.dinero).toBe(antes.dinero)
              expect(e.comprasHechas).toBe(antes.comprasHechas)
              expect(e.valle).toBe(antes.valle)
            }
            if (tiempoDetenido(antes) && c.tipo === 'AvanzarTiempo') expect(e).toBe(antes)
            expect(Number.isSafeInteger(e.dinero)).toBe(true)
            expect(e.dinero).toBeGreaterThanOrEqual(0)
            expect(e.dinero + gastado).toBe(inicial)
            expect(e.comprasHechas).toBe(propias(e).length)
            expect(bloque4Conexo(e)).toBe(true)
            expect(personajeLibre(e)).toBe(true)
          }
          expect(desmayos).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('determinista, no muta la entrada y el estado sobrevive a JSON (y sigue jugando igual)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(comando, { minLength: 20, maxLength: 150 }),
        fc.array(comando, { minLength: 20, maxLength: 150 }),
        (semilla, primera, segunda) => {
          const e0 = crearEstadoInicial({ semilla, dineroInicial: 5000 })
          const copia = JSON.stringify(e0)
          const a = aplicarComandos(e0, primera)
          const b = aplicarComandos(crearEstadoInicial({ semilla, dineroInicial: 5000 }), primera)
          expect(JSON.stringify(a)).toBe(JSON.stringify(b))
          expect(JSON.stringify(e0)).toBe(copia)
          const rt = JSON.parse(JSON.stringify(a)) as EstadoJuego
          expect(rt).toEqual(a)
          // El estado deserializado se comporta igual que el original con más comandos.
          expect(JSON.stringify(aplicarComandos(rt, segunda))).toBe(
            JSON.stringify(aplicarComandos(a, segunda)),
          )
        },
      ),
      { numRuns: 120 },
    )
  })

  it('Partida: el desmayo y la pausa no tocan la selección ni el dinero; Vida la suelta', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(comando, { minLength: 30, maxLength: 150 }),
        (semilla, comandos) => {
          const p = new Partida(crearEstadoInicial({ semilla }))
          let avisos = 0
          p.suscribir(() => avisos++)
          for (const c of comandos) {
            // Antes de cada comando, en Plano, se selecciona una parcela (como haría la interfaz).
            if (p.estado.modo === 'plano') p.seleccion.seleccionar(7)
            const selAntes = p.seleccion.indice
            const antes = p.estado
            const avisosAntes = avisos
            const r = p.emitir(c)
            if (!r.ok || r.estado === antes) {
              const conEvento = r.ok && r.eventos.length > 0
              expect(avisos).toBe(avisosAntes + (conEvento ? 1 : 0))
            } else expect(avisos).toBe(avisosAntes + 1)
            if (p.estado.modo === 'vida') expect(p.seleccion.indice).toBeUndefined()
            else expect(p.seleccion.indice).toBe(selAntes)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

/** Precio de `i` con `compras` hechas en el valle de `e`. */
const precio = (e: EstadoJuego, i: number, compras: number): number =>
  precioParcela({ valle: e.valle, comprasHechas: compras }, i) ?? Infinity

function vecinas(i: number, n = 6): number[] {
  const f = Math.floor(i / n)
  const c = i % n
  return [
    [f - 1, c],
    [f + 1, c],
    [f, c - 1],
    [f, c + 1],
  ]
    .filter(
      ([a, b]) =>
        (a as number) >= 0 && (b as number) >= 0 && (a as number) < n && (b as number) < n,
    )
    .map(([a, b]) => (a as number) * n + (b as number))
}

describe('M3 global: balance con la economía real', () => {
  const D = CONFIG_ECONOMIA.dineroInicial
  const SEMILLAS = 500

  it(`con ${D} monedas: una primera siempre asequible, segunda adyacente posible y nunca tres`, () => {
    let maxParcelas = 0
    let conDos = 0
    let primerasTotales = 0
    let primerasAtascadas = 0
    let semillasBaratisimaAtasca = 0
    let semillasTodaPrimeraAtasca = 0
    const histograma = new Map<number, number>()
    for (let s = 0; s < SEMILLAS; s++) {
      const e = crearEstadoInicial({ semilla: s * 7919 + 1 })
      expect(e.dinero).toBe(D)
      const asequibles = Array.from({ length: N }, (_, i) => i).filter((i) => precio(e, i, 0) <= D)
      expect(asequibles.length, `semilla ${s}: ninguna primera asequible`).toBeGreaterThan(0)
      histograma.set(asequibles.length, (histograma.get(asequibles.length) ?? 0) + 1)
      let dosEnEsta = false
      let todasAtascan = true
      for (const a of asequibles) {
        primerasTotales++
        const resto = D - precio(e, a, 0)
        // Comprobado con el comando real, no solo con la fórmula.
        const tras = aplicarComando(e, { tipo: 'ComprarParcela', indice: a })
        expect(tras.ok).toBe(true)
        expect(tras.estado.dinero).toBe(resto)
        const segundas = vecinas(a).filter((b) => parcelaComprable(tras.estado, b).comprable)
        if (segundas.length === 0) primerasAtascadas++
        else {
          dosEnEsta = true
          todasAtascan = false
          for (const b of segundas) {
            const t2 = aplicarComando(tras.estado, { tipo: 'ComprarParcela', indice: b }).estado
            const terceras = t2.valle.parcelas.some((_, k) => parcelaComprable(t2, k).comprable)
            expect(terceras, `semilla ${s}: caben tres (${a}, ${b})`).toBe(false)
            maxParcelas = Math.max(maxParcelas, 2)
          }
        }
        maxParcelas = Math.max(maxParcelas, 1)
      }
      // ¿Qué pasa si el jugador compra la más barata de todas (decisión natural)?
      const barata = asequibles.reduce((m, i) => (precio(e, i, 0) < precio(e, m, 0) ? i : m))
      const trasBarata = aplicarComando(e, { tipo: 'ComprarParcela', indice: barata }).estado
      if (!vecinas(barata).some((b) => parcelaComprable(trasBarata, b).comprable))
        semillasBaratisimaAtasca++
      if (todasAtascan) semillasTodaPrimeraAtasca++
      if (dosEnEsta) conDos++
    }
    const resumen = {
      semillas: SEMILLAS,
      maxParcelas,
      semillasConDos: conDos,
      primerasPosibles: primerasTotales,
      primerasQueAtascan: primerasAtascadas,
      porcentajePrimerasQueAtascan: Math.round((1000 * primerasAtascadas) / primerasTotales) / 10,
      semillasEnQueComprarLaMasBarataAtasca: semillasBaratisimaAtasca,
      semillasEnQueTodaPrimeraAtasca: semillasTodaPrimeraAtasca,
      histogramaPrimerasAsequibles: Object.fromEntries([...histograma].sort((a, b) => a[0] - b[0])),
    }
    console.info('[balance M3]', JSON.stringify(resumen))
    expect(maxParcelas).toBe(2)
    expect(conDos).toBe(SEMILLAS)
    expect(semillasTodaPrimeraAtasca).toBe(0)
  })
})
