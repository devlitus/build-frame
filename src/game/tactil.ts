import Phaser from 'phaser'
import type { Intencion } from './entrada'
import { CONFIG_TACTIL, intencionJoystick, type PuntoPantalla } from './joystick'
import { mundoDePantalla, pantallaLogica } from './resolucion'

type Fase = 'libre' | 'candidato' | 'joystick' | 'bloqueado'

/**
 * Gestos del Modo Vida. Un toque corto (o clic) en el suelo fija el destino; un arrastre de un
 * dedo es un joystick virtual (solo táctil) que aparece donde se apoya el pulgar; con dos dedos
 * se cancela el joystick y la cámara hace el pellizco. El joystick es DOM sobre el lienzo.
 */
export class ControlTactil {
  /** Solo en el Modo Vida; fuera de él se ignoran los gestos. */
  activo = true
  private fase: Fase = 'libre'
  private id = -1
  private inicio: PuntoPantalla = { x: 0, y: 0 }
  /** Centro de la base del joystick: el punto de apoyo, acotado para que quepa en la pantalla. */
  private centro: PuntoPantalla = { x: 0, y: 0 }
  private t0 = 0
  private actual: PuntoPantalla = { x: 0, y: 0 }
  private destinoPendiente: PuntoPantalla | undefined = undefined
  private readonly base: HTMLElement
  private readonly mando: HTMLElement

  constructor(private readonly escena: Phaser.Scene) {
    const padre = escena.game.canvas.parentElement ?? document.body
    this.base = document.createElement('div')
    this.base.className = 'joystick-base'
    this.mando = document.createElement('div')
    this.mando.className = 'joystick-mando'
    this.base.appendChild(this.mando)
    this.base.hidden = true
    this.base.setAttribute('aria-hidden', 'true')
    padre.appendChild(this.base)
    const input = escena.input
    input.on('pointerdown', this.alBajar, this)
    input.on('pointermove', this.alMover, this)
    input.on('pointerup', this.alSoltar, this)
    input.on('pointerupoutside', this.alSoltar, this)
    input.mouse?.disableContextMenu()
    // Girar o redimensionar con el joystick activo lo suelta (la base quedaría fuera de sitio).
    escena.scale.on('resize', this.reiniciar, this)
    escena.game.events.on(Phaser.Core.Events.BLUR, this.reiniciar, this)
    escena.game.events.on(Phaser.Core.Events.HIDDEN, this.reiniciar, this)
    escena.events.once('shutdown', this.destruir, this)
  }

  /** Intención actual del joystick (0, 0 si no hay). */
  leer(): Intencion {
    if (!this.activo || this.fase !== 'joystick') return { dx: 0, dy: 0 }
    return intencionJoystick(this.centro, this.actual)
  }

  /** El joystick está en pantalla. */
  get joystickVisible(): boolean {
    return this.fase === 'joystick'
  }

  /** Destino tocado desde la última llamada (punto del mundo en px), o undefined. */
  tomarDestino(): PuntoPantalla | undefined {
    const d = this.destinoPendiente
    this.destinoPendiente = undefined
    return d
  }

  /** Descarta el gesto en curso (cambio de modo, pérdida de foco...). */
  reiniciar(): void {
    this.fase = 'libre'
    this.id = -1
    this.base.hidden = true
    this.destinoPendiente = undefined
  }

  private esTactil(p: Phaser.Input.Pointer): boolean {
    return p.wasTouch
  }

  private dedosAbajo(): number {
    return this.escena.input.manager.pointers.filter((p) => p.isDown).length
  }

  private alBajar(p: Phaser.Input.Pointer): void {
    if (!this.activo) return
    // Con ratón solo cuenta el botón izquierdo; en táctil, cualquier dedo.
    if (!this.esTactil(p) && !p.leftButtonDown()) return
    if (this.dedosAbajo() > 1) {
      // Segundo dedo: pellizco de la cámara; se cancela el joystick y no se fija destino.
      this.fase = 'bloqueado'
      this.base.hidden = true
      return
    }
    this.fase = 'candidato'
    this.id = p.id
    this.inicio = { x: p.x, y: p.y }
    this.actual = this.inicio
    this.t0 = performance.now()
  }

  private alMover(p: Phaser.Input.Pointer): void {
    if (!this.activo || p.id !== this.id) return
    this.actual = { x: p.x, y: p.y }
    if (this.fase === 'candidato' && this.esTactil(p) && p.isDown) {
      if (Math.hypot(p.x - this.inicio.x, p.y - this.inicio.y) > CONFIG_TACTIL.umbralToquePx) {
        this.fase = 'joystick'
        const { ancho: width, alto: height } = pantallaLogica(this.escena)
        const m = CONFIG_TACTIL.baseJoystickPx / 2
        this.centro = {
          x: Math.min(Math.max(this.inicio.x, m), Math.max(m, width - m)),
          y: Math.min(Math.max(this.inicio.y, m), Math.max(m, height - m)),
        }
        this.base.style.left = `${this.centro.x}px`
        this.base.style.top = `${this.centro.y}px`
        this.base.hidden = false
      }
    }
    if (this.fase === 'joystick') {
      const r = CONFIG_TACTIL.radioJoystickPx
      const dx = this.actual.x - this.centro.x
      const dy = this.actual.y - this.centro.y
      const largo = Math.hypot(dx, dy)
      const k = largo > r ? r / largo : 1
      this.mando.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`
    }
  }

  private alSoltar(p: Phaser.Input.Pointer): void {
    if (this.fase === 'bloqueado') {
      if (this.dedosAbajo() === 0) this.fase = 'libre'
      return
    }
    if (p.id !== this.id) return
    // El umbral de tiempo solo distingue toque y joystick en táctil: un clic largo sigue siendo clic.
    const rapido = !this.esTactil(p) || performance.now() - this.t0 < CONFIG_TACTIL.umbralToqueMs
    const corto =
      Math.hypot(p.x - this.inicio.x, p.y - this.inicio.y) <= CONFIG_TACTIL.umbralToquePx && rapido
    // Un toque cancelado por el sistema (`pointercancel`) no fija destino.
    const toque = this.fase === 'candidato' && corto && this.activo && !p.wasCanceled
    this.reiniciar()
    if (toque) {
      const m = mundoDePantalla(this.escena, p.x, p.y)
      this.destinoPendiente = { x: m.x, y: m.y }
    }
  }

  private destruir(): void {
    const input = this.escena.input
    input.off('pointerdown', this.alBajar, this)
    input.off('pointermove', this.alMover, this)
    input.off('pointerup', this.alSoltar, this)
    input.off('pointerupoutside', this.alSoltar, this)
    this.escena.scale.off('resize', this.reiniciar, this)
    this.escena.game.events.off(Phaser.Core.Events.BLUR, this.reiniciar, this)
    this.escena.game.events.off(Phaser.Core.Events.HIDDEN, this.reiniciar, this)
    this.base.remove()
  }
}

/**
 * Profundidad de la marca: por encima de todo lo del mundo y, a propósito, también del tinte
 * día/noche (M2-06), para que el destino se vea igual de noche.
 */
export const PROFUNDIDAD_MARCA = 1e9

/** Marca del destino en el suelo: aro crema con borde oscuro (se ve sobre claro y oscuro). */
export class MarcaDestino {
  private readonly borde: Phaser.GameObjects.Arc
  private readonly aro: Phaser.GameObjects.Arc

  constructor(escena: Phaser.Scene) {
    // Diámetro visible de unos 40 px (radio 16 + trazo exterior).
    this.borde = escena.add
      .circle(0, 0, 16)
      .setStrokeStyle(10, 0x3b2a1a)
      .setVisible(false)
      .setDepth(PROFUNDIDAD_MARCA)
    this.aro = escena.add
      .circle(0, 0, 16)
      .setStrokeStyle(5, 0xfff3c4)
      .setFillStyle(0xfff3c4, 0.35)
      .setVisible(false)
      .setDepth(PROFUNDIDAD_MARCA + 1)
  }

  mostrar(xPx: number, yPx: number): void {
    this.borde.setPosition(xPx, yPx).setVisible(true)
    this.aro.setPosition(xPx, yPx).setVisible(true)
  }

  ocultar(): void {
    this.borde.setVisible(false)
    this.aro.setVisible(false)
  }

  get visible(): boolean {
    return this.aro.visible
  }

  destruir(): void {
    this.borde.destroy()
    this.aro.destroy()
  }
}
