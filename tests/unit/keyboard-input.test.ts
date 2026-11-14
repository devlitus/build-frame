/**
 * E2E-16 · Rompedor. `EntradaMovimiento` (src/game/entrada.ts): what the keyboard turns into
 * (movement intention, keyboard zoom, «M» for the mode). Replaces the logic of:
 * - personaje-render-rompedor «dos teclas opuestas se anulan», «las teclas de movimiento no
 *   bloquean atajos del navegador», «mantener una tecla al reiniciar la escena…»;
 * - personaje «al perder el foco la ventana el personaje deja de andar»;
 * - modos-rompedor «Ctrl+M, Alt+M y Meta+M no cambian de modo», «mantener M pulsado
 *   (auto-repetición) cambia una sola vez», «tecla de movimiento mantenida al cambiar a Plano…».
 * Phaser is replaced by a minimal keyboard plugin: keys are objects with `isDown`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => {
  const KeyCodes = {
    W: 87,
    A: 65,
    S: 83,
    D: 68,
    UP: 38,
    DOWN: 40,
    LEFT: 37,
    RIGHT: 39,
    PLUS: 187,
    MINUS: 189,
    NUMPAD_ADD: 107,
    NUMPAD_SUBTRACT: 109,
    M: 77,
  }
  const Phaser = {
    Input: { Keyboard: { KeyCodes } },
    Core: { Events: { BLUR: 'blur', HIDDEN: 'hidden' } },
  }
  return { default: Phaser }
})

const { EntradaMovimiento } = await import('../../src/game/entrada')

type Oyente = { f: (...a: unknown[]) => void; ctx: unknown; once?: boolean }

class Emisor {
  readonly oyentes = new Map<string, Oyente[]>()
  on(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.oyentes.set(ev, [...(this.oyentes.get(ev) ?? []), { f, ctx }])
    return this
  }
  once(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.oyentes.set(ev, [...(this.oyentes.get(ev) ?? []), { f, ctx, once: true }])
    return this
  }
  off(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.oyentes.set(
      ev,
      (this.oyentes.get(ev) ?? []).filter((o) => o.f !== f || o.ctx !== ctx),
    )
    return this
  }
  emit(ev: string, ...a: unknown[]): void {
    const l = this.oyentes.get(ev) ?? []
    this.oyentes.set(
      ev,
      l.filter((o) => !o.once),
    )
    for (const o of l) o.f.apply(o.ctx, a)
  }
  cuenta(ev: string): number {
    return (this.oyentes.get(ev) ?? []).length
  }
}

interface Tecla {
  readonly codigo: number
  readonly captura: boolean
  isDown: boolean
}

class Teclado extends Emisor {
  readonly teclas: Tecla[] = []
  quitadas = 0
  addKey(codigo: number, captura = true): Tecla {
    const t = { codigo, captura, isDown: false }
    this.teclas.push(t)
    return t
  }
  removeKey(): void {
    this.quitadas++
  }
  resetKeys(): void {
    for (const t of this.teclas) t.isDown = false
  }
  /** Simula pulsar o soltar todas las teclas registradas con ese código. */
  fijar(codigo: number, abajo: boolean): void {
    for (const t of this.teclas) if (t.codigo === codigo) t.isDown = abajo
  }
}

const K = { W: 87, A: 65, S: 83, D: 68, UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39 } as const

function crear() {
  const teclado = new Teclado()
  const juego = new Emisor()
  const eventosEscena = new Emisor()
  const escena = {
    input: { keyboard: teclado },
    game: { events: juego },
    events: eventosEscena,
  }
  const entrada = new EntradaMovimiento(escena as never)
  return { teclado, juego, eventosEscena, entrada }
}

const tecla = (ev: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...ev }) as KeyboardEvent

describe('keyboard movement intention', () => {
  let c: ReturnType<typeof crear>
  beforeEach(() => {
    c = crear()
  })

  it('WASD and arrows give the 8 directions; nothing pressed is (0, 0)', () => {
    expect(c.entrada.leer()).toEqual({ dx: 0, dy: 0 })
    c.teclado.fijar(K.D, true)
    expect(c.entrada.leer()).toEqual({ dx: 1, dy: 0 })
    c.teclado.fijar(K.UP, true)
    expect(c.entrada.leer()).toEqual({ dx: 1, dy: -1 })
    c.teclado.fijar(K.D, false)
    c.teclado.fijar(K.LEFT, true)
    expect(c.entrada.leer()).toEqual({ dx: -1, dy: -1 })
  })

  it('two opposite keys cancel out (A+D, W+S, and arrows mixed with letters)', () => {
    // Original e2e: personaje-render-rompedor.spec.ts «dos teclas opuestas se anulan».
    c.teclado.fijar(K.A, true)
    c.teclado.fijar(K.D, true)
    expect(c.entrada.leer().dx).toBe(0)
    c.teclado.fijar(K.W, true)
    c.teclado.fijar(K.DOWN, true)
    expect(c.entrada.leer()).toEqual({ dx: 0, dy: 0 })
    // W and ↑ together are still one step up (no double speed).
    c.teclado.resetKeys()
    c.teclado.fijar(K.W, true)
    c.teclado.fijar(K.UP, true)
    expect(c.entrada.leer()).toEqual({ dx: 0, dy: -1 })
  })

  it('without arrows (parcel cursor in the Plano) only WASD count', () => {
    c.teclado.fijar(K.RIGHT, true)
    expect(c.entrada.leer(true)).toEqual({ dx: 0, dy: 0 })
    c.teclado.fijar(K.D, true)
    expect(c.entrada.leer(true)).toEqual({ dx: 1, dy: 0 })
  })

  it('keys are registered without capture, so browser shortcuts (Ctrl+L, F5…) are not blocked', () => {
    // Original e2e: personaje-render-rompedor.spec.ts «las teclas de movimiento no bloquean atajos
    // del navegador (Ctrl+L, F5)».
    expect(c.teclado.teclas.length).toBeGreaterThan(0)
    expect(c.teclado.teclas.every((t) => t.captura === false)).toBe(true)
  })

  it('losing the window focus (blur) or hiding the tab releases every key', () => {
    // Original e2e: personaje.spec.ts «al perder el foco la ventana el personaje deja de andar».
    c.teclado.fijar(K.D, true)
    c.teclado.fijar(K.W, true)
    c.juego.emit('blur')
    expect(c.entrada.leer()).toEqual({ dx: 0, dy: 0 })
    c.teclado.fijar(K.S, true)
    c.juego.emit('hidden')
    expect(c.entrada.leer()).toEqual({ dx: 0, dy: 0 })
  })

  it('keyboard zoom: + and - (also the Firefox and numpad codes); both at once cancel', () => {
    for (const codigo of [187, 107, 61, 171]) {
      c.teclado.resetKeys()
      c.teclado.fijar(codigo, true)
      expect(c.entrada.leerZoom(), `code ${codigo}`).toBe(1)
    }
    for (const codigo of [189, 109, 173]) {
      c.teclado.resetKeys()
      c.teclado.fijar(codigo, true)
      expect(c.entrada.leerZoom(), `code ${codigo}`).toBe(-1)
    }
    c.teclado.fijar(187, true)
    expect(c.entrada.leerZoom()).toBe(0)
  })
})

describe('«M» changes mode once per press', () => {
  let c: ReturnType<typeof crear>
  beforeEach(() => {
    c = crear()
  })

  it('one press is read once', () => {
    c.teclado.emit('keydown-M', tecla())
    expect(c.entrada.cambiarModo()).toBe(true)
    expect(c.entrada.cambiarModo()).toBe(false)
  })

  it('holding M (auto-repeat) changes the mode only once', () => {
    // Original e2e: modos-rompedor.spec.ts «mantener M pulsado (auto-repetición) cambia una sola vez».
    c.teclado.emit('keydown-M', tecla())
    expect(c.entrada.cambiarModo()).toBe(true)
    for (let i = 0; i < 10; i++) c.teclado.emit('keydown-M', tecla({ repeat: true }))
    expect(c.entrada.cambiarModo()).toBe(false)
  })

  it('Ctrl+M, Alt+M and Meta+M do not change mode; Shift+M does', () => {
    // Original e2e: modos-rompedor.spec.ts «Ctrl+M, Alt+M y Meta+M no cambian de modo».
    for (const mod of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      c.teclado.emit('keydown-M', tecla(mod))
      expect(c.entrada.cambiarModo(), JSON.stringify(mod)).toBe(false)
    }
    c.teclado.emit('keydown-M', tecla({ shiftKey: true }))
    expect(c.entrada.cambiarModo()).toBe(true)
  })

  it('two presses between two reads count as one change (no double toggle in one frame)', () => {
    c.teclado.emit('keydown-M', tecla())
    c.teclado.emit('keydown-M', tecla())
    expect(c.entrada.cambiarModo()).toBe(true)
    expect(c.entrada.cambiarModo()).toBe(false)
  })
})

describe('scene shutdown (restarting the valley)', () => {
  it('removes its listeners and keys, so a key held during the restart does not keep walking', () => {
    // Original e2e: personaje-render-rompedor.spec.ts «mantener una tecla al reiniciar la escena
    // no deja al personaje andando solo».
    const c = crear()
    expect(c.teclado.cuenta('keydown-M')).toBe(1)
    expect(c.juego.cuenta('blur')).toBe(1)
    expect(c.juego.cuenta('hidden')).toBe(1)
    c.eventosEscena.emit('shutdown')
    expect(c.teclado.cuenta('keydown-M')).toBe(0)
    expect(c.juego.cuenta('blur')).toBe(0)
    expect(c.juego.cuenta('hidden')).toBe(0)
    expect(c.teclado.quitadas).toBe(c.teclado.teclas.length)
    // The new scene's input starts from scratch: nothing pressed.
    const nueva = new EntradaMovimiento({
      input: { keyboard: new Teclado() },
      game: { events: new Emisor() },
      events: new Emisor(),
    } as never)
    expect(nueva.leer()).toEqual({ dx: 0, dy: 0 })
    expect(nueva.cambiarModo()).toBe(false)
  })

  it('without a keyboard plugin it fails loudly instead of silently ignoring input', () => {
    expect(
      () =>
        new EntradaMovimiento({
          input: { keyboard: null },
          game: { events: new Emisor() },
          events: new Emisor(),
        } as never),
    ).toThrow()
  })
})
