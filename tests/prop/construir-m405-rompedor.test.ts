/* eslint-disable @typescript-eslint/no-non-null-assertion -- catálogo e índices conocidos en tests */
/**
 * Rompedor · M4-05 Construir: catálogo, silueta y confirmación.
 * Ataques: el refactor de `unicoYaExiste` y `faltaPagar` frente a un oráculo con las reglas de
 * pago de antes; el catálogo (`entradaCatalogo`) y la confirmación (`restoTrasPagar`) frente a lo
 * que de verdad descuenta `Construir`; la silueta (`calcularSilueta`) frente a `Construir` en
 * bordes, huellas pares e impares y estados con zonas y edificios aleatorios; `Partida` con doble
 * confirmación, segunda casa y cambios de estado con la confirmación abierta; textos de los motivos.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  catalogo,
  CONFIG_EDIFICIOS,
  colocacionValida,
  crearEstadoInicial,
  diasRestantes,
  entradaCatalogo,
  faltaPagar,
  ladoValle,
  MOTIVOS_COLOCACION,
  restoTrasPagar,
  unicoYaExiste,
  type Comando,
  type EstadoJuego,
  type TipoEdificio,
  type Zona,
} from '../../src/core'
import { calcularSilueta, esquinaDeSilueta } from '../../src/game/construir'
import { Partida } from '../../src/game/partida'
import { textoColocacion, textoMotivoCatalogo } from '../../src/ui/construirTextos'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const def = (t: TipoEdificio) => CONFIG_EDIFICIOS.edificios[t]
const cmd = (e: EstadoJuego, c: unknown) => aplicarComando(e, c as Comando)

/** Todas las parcelas propias, en Plano, con el dinero y los materiales que se pidan. */
function nuevo(semilla: number): EstadoJuego {
  const e = crearEstadoInicial({ semilla })
  return {
    ...e,
    modo: 'plano',
    valle: { ...e.valle, parcelas: e.valle.parcelas.map((p) => ({ ...p, estado: 'propia' })) },
  }
}
const BASE = nuevo(42)
const LADO = ladoValle(BASE.valle)

function pintar(e: EstadoJuego, x0: number, y0: number, x1: number, y1: number, zona: Zona) {
  const r = cmd(e, { tipo: 'PintarZona', x0, y0, x1, y1, zona })
  return r.ok ? r.estado : e
}

/** Oráculo de las reglas de pago tal como estaban en `colocacionValida` antes del refactor. */
function pagoAntiguo(e: EstadoJuego, tipo: TipoEdificio): string | undefined {
  const { dinero, madera, piedra } = def(tipo).coste
  if (!Number.isSafeInteger(e.dinero) || e.dinero < dinero) return 'fondos-insuficientes'
  const mat = e.materiales
  if (!(mat.madera >= madera) || !(mat.piedra >= piedra)) return 'materiales-insuficientes'
  return undefined
}

/** Sitio con zona correcta para cada tipo (vivienda a la izquierda, almacén a la derecha). */
const ESCENARIO = (() => {
  let e = pintar(BASE, 30, 30, 47, 60, 'vivienda')
  e = pintar(e, 48, 30, 65, 60, 'almacen')
  return e
})()

function sitioValido(e: EstadoJuego, tipo: TipoEdificio): { x: number; y: number } {
  for (let y = 30; y < 60; y++)
    for (let x = 30; x < 65; x++)
      if (colocacionValida(e, tipo, x, y, { ignorarCostes: true }).valida) return { x, y }
  throw new Error(`sin sitio para ${tipo}`)
}
const SITIOS = Object.fromEntries(TIPOS.map((t) => [t, sitioValido(ESCENARIO, t)])) as Record<
  TipoEdificio,
  { x: number; y: number }
>

const arbCantidad = (max: number) =>
  fc.oneof(
    fc.integer({ min: 0, max }),
    fc.constantFrom(0, 10, 19, 20, 21, 49, 50, 51, 299, 300, 301, 9, 11),
  )

describe('refactor de unicoYaExiste y faltaPagar: sin cambio de comportamiento', () => {
  it('colocacionValida coincide con las reglas de pago de antes (dinero y materiales raros incluidos)', () => {
    const raro = fc.oneof(
      fc.integer({ min: -100, max: 400 }),
      fc.constantFrom(Number.NaN, Infinity, -Infinity, 0.5, 49.9, 50.5, 2 ** 53, -0),
    )
    fc.assert(
      fc.property(
        fc.constantFrom(...TIPOS),
        raro,
        raro,
        raro,
        fc.boolean(),
        (tipo, dinero, madera, piedra, ignorar) => {
          const e = { ...ESCENARIO, dinero, materiales: { madera, piedra } }
          const { x, y } = SITIOS[tipo]
          const r = colocacionValida(e, tipo, x, y, { ignorarCostes: ignorar })
          const esperado = ignorar ? undefined : pagoAntiguo(e, tipo)
          expect(r.valida ? undefined : r.motivo).toBe(esperado)
          expect(faltaPagar(e, def(tipo))).toBe(pagoAntiguo(e, tipo))
        },
      ),
      { numRuns: 600 },
    )
  })

  it('unicoYaExiste: solo la casa, con obra o sin ella, e ignorando su propio id', () => {
    const casa = { id: 7, tipo: 'casa' as const, x: 40, y: 40, obra: null }
    const e = { ...ESCENARIO, edificios: [casa] }
    expect(unicoYaExiste(e, 'casa', def('casa'))).toBe(true)
    expect(unicoYaExiste(e, 'casa', def('casa'), 7)).toBe(false)
    expect(unicoYaExiste(e, 'casa', def('casa'), 8)).toBe(true)
    expect(unicoYaExiste(e, 'caja-envio', def('caja-envio'))).toBe(false)
    // Con ignorarId la colocación de la casa sobre sí misma vuelve a mirar el sitio, como antes.
    expect(colocacionValida(e, 'casa', 40, 40).valida ? 'ok' : 'no').toBe('no')
  })
})

describe('el catálogo y la confirmación dicen exactamente lo que hace Construir', () => {
  it('motivo de pago del catálogo ⇔ rechazo de Construir; resto mostrado = resto real; nada negativo', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TIPOS),
        arbCantidad(1200),
        arbCantidad(120),
        arbCantidad(30),
        fc.boolean(),
        (tipo, dinero, madera, piedra, conCasa) => {
          const casa = conCasa
            ? [{ id: 99, tipo: 'casa' as const, x: 2, y: 2, obra: { diaInicio: 1, diaFin: 4 } }]
            : []
          let e: EstadoJuego = { ...ESCENARIO, dinero, materiales: { madera, piedra } }
          e = { ...e, edificios: casa, siguienteIdEdificio: 100 }
          const entrada = entradaCatalogo(e, tipo)
          const { x, y } = SITIOS[tipo]
          const r = cmd(e, { tipo: 'Construir', tipoEdificio: tipo, x, y })
          if (entrada.motivo === undefined) {
            expect(r.ok).toBe(true)
            if (!r.ok) return
            const resto = restoTrasPagar(e, entrada.def.coste)
            expect({
              dinero: r.estado.dinero,
              madera: r.estado.materiales.madera,
              piedra: r.estado.materiales.piedra,
            }).toEqual(resto)
            expect(resto.dinero).toBeGreaterThanOrEqual(0)
            expect(resto.madera).toBeGreaterThanOrEqual(0)
            expect(resto.piedra).toBeGreaterThanOrEqual(0)
            expect(entrada.faltan).toEqual({ dinero: 0, madera: 0, piedra: 0 })
            // El pagado guardado es el coste mostrado.
            expect(r.estado.edificios.at(-1)?.pagado).toEqual(entrada.def.coste)
          } else {
            expect(r.ok).toBe(false)
            if (r.ok) return
            expect(r.error).toBe(entrada.motivo)
            // Si el motivo es de pago, el catálogo dice algo que falta de verdad.
            if (entrada.motivo !== 'unico-ya-existe') {
              const f = entrada.faltan
              expect(f.dinero + f.madera + f.piedra).toBeGreaterThan(0)
            }
          }
        },
      ),
      { numRuns: 1500 },
    )
  })

  it('una partida de muchas construcciones: dinero y materiales nunca negativos y cada pago = coste del catálogo', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...TIPOS), fc.nat(LADO - 1), fc.nat(LADO - 1)), {
          minLength: 5,
          maxLength: 60,
        }),
        (pasos) => {
          let e = ESCENARIO
          let casas = 0
          for (const [tipo, x, y] of pasos) {
            const antes = e
            const lista = catalogo(e)
            const r = cmd(e, { tipo: 'Construir', tipoEdificio: tipo, x, y })
            if (!r.ok) continue
            e = r.estado
            const entrada = lista.find((l) => l.tipo === tipo)!
            expect(entrada.motivo).toBeUndefined()
            expect(e.dinero).toBe(antes.dinero - entrada.def.coste.dinero)
            expect(e.materiales.madera).toBe(antes.materiales.madera - entrada.def.coste.madera)
            expect(e.materiales.piedra).toBe(antes.materiales.piedra - entrada.def.coste.piedra)
            expect(e.dinero).toBeGreaterThanOrEqual(0)
            expect(e.materiales.madera).toBeGreaterThanOrEqual(0)
            expect(e.materiales.piedra).toBeGreaterThanOrEqual(0)
            if (tipo === 'casa') casas++
          }
          expect(casas).toBeLessThanOrEqual(1)
          expect(e.edificios.filter((b) => b.tipo === 'casa').length).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('lote de bienvenida (D1): 80 de madera, 20 de piedra; caja y cobertizo según D3', () => {
    const e = crearEstadoInicial({ semilla: 1 })
    expect(e.materiales).toEqual({ madera: 80, piedra: 20 })
    expect(def('casa')).toMatchObject({
      ancho: 4,
      alto: 3,
      dias: 3,
      unico: true,
      zonas: ['vivienda'],
    })
    expect(def('casa').coste).toEqual({ dinero: 0, madera: 0, piedra: 0 })
    expect(def('caja-envio')).toMatchObject({ ancho: 1, alto: 1, dias: 1 })
    expect(def('caja-envio').coste).toEqual({ dinero: 50, madera: 20, piedra: 0 })
    expect([...def('caja-envio').zonas].sort()).toEqual(['almacen', 'vivienda'])
    expect(def('cobertizo')).toMatchObject({ ancho: 3, alto: 2, dias: 2, zonas: ['almacen'] })
    expect(def('cobertizo').coste).toEqual({ dinero: 300, madera: 50, piedra: 10 })
  })

  it('[S3] con dinero no entero (o > 2^53) el catálogo dice «Te faltan Gratis»', () => {
    // faltaPagar rechaza el dinero que no es un entero seguro, pero `faltan.dinero` sale 0:
    // el motivo es de pago y la lista de lo que falta está vacía.
    for (const dinero of [100.5, 2 ** 60, Number.NaN]) {
      for (const tipo of TIPOS) {
        const e = entradaCatalogo({ ...ESCENARIO, dinero }, tipo)
        const texto = textoMotivoCatalogo(e)
        if (texto !== undefined) expect(texto, `${tipo} con ${dinero}`).not.toMatch(/Gratis/i)
      }
    }
  })
})

describe('la silueta no miente', () => {
  /** Estado aleatorio con zonas, cajas, cobertizos y quizá la casa, por comandos reales. */
  const arbEstado = fc
    .record({
      zonas: fc.array(
        fc.tuple(
          fc.nat(LADO - 1),
          fc.nat(LADO - 1),
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          fc.constantFrom<Zona>('vivienda', 'almacen', 'cultivo'),
        ),
        { maxLength: 6 },
      ),
      obras: fc.array(fc.tuple(fc.constantFrom(...TIPOS), fc.nat(LADO - 1), fc.nat(LADO - 1)), {
        maxLength: 12,
      }),
      dinero: fc.oneof(fc.constant(1100), fc.integer({ min: 0, max: 400 })),
      madera: fc.oneof(fc.constant(80), fc.integer({ min: 0, max: 60 })),
      piedra: fc.oneof(fc.constant(20), fc.integer({ min: 0, max: 12 })),
    })
    .map(({ zonas, obras, dinero, madera, piedra }) => {
      let e: EstadoJuego = {
        ...BASE,
        dinero: 1_000_000,
        materiales: { madera: 9999, piedra: 9999 },
      }
      e = pintar(e, 30, 30, 47, 60, 'vivienda')
      e = pintar(e, 48, 30, 65, 60, 'almacen')
      for (const [x, y, w, h, z] of zonas)
        e = pintar(e, x, y, Math.min(LADO - 1, x + w), Math.min(LADO - 1, y + h), z)
      for (const [t, x, y] of obras) {
        const r = cmd(e, { tipo: 'Construir', tipoEdificio: t, x, y })
        if (r.ok) e = r.estado
      }
      return { ...e, dinero, materiales: { madera, piedra } }
    })

  it('verde ⇔ Construir aceptado, rojo ⇔ rechazado con el mismo motivo (también en los bordes)', () => {
    const arbCentro = fc.oneof(
      fc.record({ x: fc.integer({ min: 25, max: 70 }), y: fc.integer({ min: 25, max: 65 }) }),
      fc.record({
        x: fc.constantFrom(-3, -1, 0, 1, 2, LADO - 3, LADO - 2, LADO - 1, LADO, LADO + 4),
        y: fc.constantFrom(-3, -1, 0, 1, 2, LADO - 3, LADO - 2, LADO - 1, LADO, LADO + 4),
      }),
    )
    let verdes = 0
    fc.assert(
      fc.property(arbEstado, fc.constantFrom(...TIPOS), arbCentro, (e, tipo, centro) => {
        const s = calcularSilueta(e, tipo, centro)!
        // La huella siempre dentro del valle.
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.x + s.ancho).toBeLessThanOrEqual(LADO)
        expect(s.y + s.alto).toBeLessThanOrEqual(LADO)
        const r = cmd(e, { tipo: 'Construir', tipoEdificio: tipo, x: s.x, y: s.y })
        expect(r.ok).toBe(s.resultado.valida)
        if (!r.ok && !s.resultado.valida) expect(r.error).toBe(s.resultado.motivo)
        if (s.resultado.valida) verdes++
        // La casilla apuntada queda dentro de la huella cuando está dentro del valle.
        if (centro.x >= 0 && centro.y >= 0 && centro.x < LADO && centro.y < LADO) {
          expect(centro.x).toBeGreaterThanOrEqual(s.x)
          expect(centro.x).toBeLessThan(s.x + s.ancho)
          expect(centro.y).toBeGreaterThanOrEqual(s.y)
          expect(centro.y).toBeLessThan(s.y + s.alto)
        }
      }),
      { numRuns: 1500 },
    )
    expect(verdes).toBeGreaterThan(50)
  })

  it('esquinaDeSilueta en huellas pares e impares: centro arriba-izquierda y pegada al borde', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: -10, max: 110 }),
        fc.integer({ min: -10, max: 110 }),
        (ancho, alto, cx, cy) => {
          const c = esquinaDeSilueta({ ancho, alto }, { x: cx, y: cy }, LADO)
          expect(c.x).toBe(Math.min(LADO - ancho, Math.max(0, cx - Math.floor((ancho - 1) / 2))))
          expect(c.y).toBe(Math.min(LADO - alto, Math.max(0, cy - Math.floor((alto - 1) / 2))))
        },
      ),
    )
  })

  it('[S3] con el día en el límite la silueta es verde pero Construir da limite-de-dia', () => {
    const e = { ...ESCENARIO, dia: Number.MAX_SAFE_INTEGER - 1 }
    const { x, y } = SITIOS.casa
    const s = calcularSilueta(e, 'casa', { x: x + 1, y: y + 1 })!
    const r = cmd(e, { tipo: 'Construir', tipoEdificio: 'casa', x: s.x, y: s.y })
    // La silueta debe decir lo mismo que el núcleo.
    expect(s.resultado.valida).toBe(r.ok)
  })
})

describe('Partida: confirmación, doble clic y segunda casa', () => {
  function partidaEn(e: EstadoJuego, tipo: TipoEdificio): Partida {
    const p = new Partida(e)
    p.construccion.abrir()
    p.construccion.elegir(tipo)
    const { x, y } = SITIOS[tipo]
    const d = def(tipo)
    p.construccion.colocar({
      x: x + Math.floor((d.ancho - 1) / 2),
      y: y + Math.floor((d.alto - 1) / 2),
    })
    return p
  }

  it('doble confirmación: construirAqui dos veces seguidas construye una sola vez', () => {
    for (const tipo of TIPOS) {
      const p = partidaEn(ESCENARIO, tipo)
      expect(p.silueta()?.resultado.valida).toBe(true)
      p.construccion.pedirConfirmacion('puntero')
      const r1 = p.construirAqui()
      const r2 = p.construirAqui()
      // Y si el segundo clic vuelve a pedir confirmación (silueta suelta) tampoco hay nada.
      p.construccion.pedirConfirmacion('teclado')
      const r3 = p.construirAqui()
      expect(r1?.ok).toBe(true)
      expect(r2).toBeUndefined()
      expect(r3).toBeUndefined()
      expect(p.estado.edificios.length).toBe(1)
      expect(p.estado.dinero).toBe(ESCENARIO.dinero - def(tipo).coste.dinero)
    }
  })

  it('la segunda casa nunca se crea, ni repitiendo elegir/colocar/confirmar', () => {
    const p = partidaEn(ESCENARIO, 'casa')
    p.construccion.pedirConfirmacion('teclado')
    expect(p.construirAqui()?.ok).toBe(true)
    for (let i = 0; i < 40; i++) {
      p.construccion.elegir('casa')
      p.construccion.colocar({ x: 30 + (i % 15), y: 30 + Math.floor(i / 2) })
      expect(p.silueta()?.resultado.valida).toBe(false)
      p.construccion.pedirConfirmacion('teclado')
      const r = p.construirAqui()
      expect(r?.ok ?? false).toBe(false)
      p.construccion.elegir(undefined)
    }
    expect(p.estado.edificios.filter((b) => b.tipo === 'casa').length).toBe(1)
    expect(entradaCatalogo(p.estado, 'casa').motivo).toBe('unico-ya-existe')
  })

  it('si el estado cambia con la confirmación abierta, se construye según el estado nuevo (nunca en negativo)', () => {
    const p = partidaEn(ESCENARIO, 'cobertizo')
    p.construccion.pedirConfirmacion('puntero')
    // Algo gasta el dinero mientras se lee la confirmación.
    p.reemplazar({ ...p.estado, dinero: 10 })
    const r = p.construirAqui()
    expect(r?.ok ?? false).toBe(false)
    expect(p.estado.dinero).toBe(10)
  })

  it('volver a Vida con la confirmación abierta la cierra y construirAqui ya no hace nada', () => {
    const p = partidaEn(ESCENARIO, 'caja-envio')
    p.construccion.pedirConfirmacion('puntero')
    p.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(p.construccion.abierto).toBe(false)
    expect(p.construirAqui()).toBeUndefined()
    expect(p.estado.edificios.length).toBe(0)
  })
})

describe('obras: días restantes', () => {
  it('diasRestantes con obras reales: el cartel cuenta hacia atrás hasta el día de terminar', () => {
    for (const tipo of TIPOS) {
      const r = cmd(ESCENARIO, {
        tipo: 'Construir',
        tipoEdificio: tipo,
        x: SITIOS[tipo].x,
        y: SITIOS[tipo].y,
      })
      if (!r.ok) throw new Error(r.error)
      let e = r.estado
      const n = def(tipo).dias
      for (let d = 0; d < n; d++) {
        const obra = e.edificios[0]!.obra
        expect(obra, `${tipo} día ${d}`).not.toBeNull()
        expect(diasRestantes(obra!, e.dia)).toBe(n - d)
        const s = cmd(
          { ...e, modo: 'vida', pausado: false },
          { tipo: 'AvanzarTiempo', minutos: 1e9 },
        )
        if (!s.ok) throw new Error(s.error)
        e = s.estado
      }
      expect(e.edificios[0]!.obra).toBeNull()
    }
  })

  it('textos de colocación para cualquier motivo no lanzan ni salen vacíos', () => {
    const motivos = [
      ...MOTIVOS_COLOCACION,
      'solo-en-plano',
      'estado-invalido',
      'limite-de-dia',
      'parametro-invalido',
    ] as const
    for (const m of motivos)
      for (const tipo of TIPOS) {
        const t = textoColocacion(m, tipo, {
          ...ESCENARIO,
          dinero: 0,
          materiales: { madera: 0, piedra: 0 },
        })
        expect(t.trim().length, `${m}/${tipo}`).toBeGreaterThan(0)
        expect(t).not.toMatch(/\{|\}|undefined|NaN/)
      }
  })
})
