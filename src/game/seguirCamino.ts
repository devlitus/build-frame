import { CONFIG_PERSONAJE, buscarCamino, type Comando, type DatosMapa } from '../core'

export interface PuntoMundo {
  readonly x: number
  readonly y: number
}

/** Distancia (casillas) a la que se da por alcanzado un punto de la ruta. */
const LLEGADA = 0.02
/** Fotogramas seguidos sin avanzar (con tiempo de juego) tras los que se abandona la ruta. */
const FOTOGRAMAS_ATASCO = 10
/** Fracción mínima del avance esperado para contar como que el personaje avanza. */
const AVANCE_MINIMO = 0.25
/** Tope de comandos por fotograma (varios puntos de la ruta caben en un fotograma lento). */
const MAX_COMANDOS_POR_FOTOGRAMA = 8

/**
 * Sigue la ruta de A* hasta un destino, un comando por fotograma. No toca Phaser: recibe la
 * posición actual y el tiempo, y devuelve el comando de movimiento (o nada si ya llegó).
 */
export class SeguidorCamino {
  private ruta: PuntoMundo[] = []
  private _destino: PuntoMundo | undefined = undefined
  private previa: PuntoMundo | undefined = undefined
  private esperado = 0
  private atascado = 0

  /** Centro de la casilla final mientras se siga una ruta; undefined si no hay destino. */
  get destino(): PuntoMundo | undefined {
    return this._destino
  }

  /** Calcula la ruta desde `desde` hasta `hasta` (casillas). Devuelve si hay destino. */
  fijar(datos: DatosMapa, desde: PuntoMundo, hasta: PuntoMundo): boolean {
    this.cancelar()
    const ruta = buscarCamino(datos, desde, hasta)
    const ultimo = ruta[ruta.length - 1]
    if (!ultimo) return false
    this.ruta = [...ruta]
    this._destino = ultimo
    return true
  }

  cancelar(): void {
    this.ruta = []
    this._destino = undefined
    this.previa = undefined
    this.esperado = 0
    this.atascado = 0
  }

  /** Un solo comando por fotograma (sin arrastrar el sobrante al siguiente punto). */
  siguiente(personaje: PuntoMundo, delta: number): Comando | undefined {
    return this.generar(personaje, delta, 1)[0]
  }

  /**
   * Comandos del fotograma: si sobra tiempo al llegar a un punto se sigue hacia el siguiente en
   * el mismo fotograma, así el trayecto va a la velocidad del personaje aunque haya muchas casillas.
   */
  comandos(personaje: PuntoMundo, delta: number): Comando[] {
    return this.generar(personaje, delta, MAX_COMANDOS_POR_FOTOGRAMA)
  }

  private generar(personaje: PuntoMundo, delta: number, maximo: number): Comando[] {
    if (!this._destino) return []
    // ¿Avanzó lo esperado desde el fotograma anterior?
    if (this.previa && this.esperado > 0) {
      const avance = Math.hypot(personaje.x - this.previa.x, personaje.y - this.previa.y)
      this.atascado = avance < this.esperado * AVANCE_MINIMO ? this.atascado + 1 : 0
      if (this.atascado >= FOTOGRAMAS_ATASCO) {
        this.cancelar()
        return []
      }
    }
    const velocidad = CONFIG_PERSONAJE.velocidadCasillasPorSegundo
    const comandos: Comando[] = []
    let x = personaje.x
    let y = personaje.y
    let resto = delta
    while (comandos.length < maximo) {
      let objetivo = this.ruta[0]
      while (objetivo && Math.hypot(objetivo.x - x, objetivo.y - y) < LLEGADA) {
        this.ruta.shift()
        objetivo = this.ruta[0]
      }
      if (!objetivo) {
        // Llegó al final de la ruta (si ya se movió en este fotograma, se cancela en el siguiente).
        if (comandos.length === 0) this.cancelar()
        break
      }
      if (!(resto > 0)) break
      const dx = objetivo.x - x
      const dy = objetivo.y - y
      const distancia = Math.hypot(dx, dy)
      const necesario = (distancia / velocidad) * 1000
      // Sin pasarse del punto: el tiempo se acota a lo que falta para llegar.
      const ms = Math.min(resto, necesario)
      comandos.push({ tipo: 'MoverPersonaje', dx: dx / distancia, dy: dy / distancia, ms })
      resto -= ms
      if (ms < necesario || resto <= 1e-9) {
        x += (dx / distancia) * ((velocidad * ms) / 1000)
        y += (dy / distancia) * ((velocidad * ms) / 1000)
        break
      }
      x = objetivo.x
      y = objetivo.y
      this.ruta.shift()
    }
    this.previa = { x: personaje.x, y: personaje.y }
    this.esperado = Math.hypot(x - personaje.x, y - personaje.y)
    return comandos
  }
}
