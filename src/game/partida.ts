import {
  aplicarComando,
  casillaDeEnfrente,
  defEdificio,
  esSemilla,
  type Herramienta,
  type ObjetoId,
  type Comando,
  type ErrorComando,
  type EstadoJuego,
  type EventoJuego,
  type ResultadoComando,
  type TipoEdificio,
} from '../core'
import { Construccion, calcularSilueta, centroDeSilueta, type Silueta } from './construir'
import { SeleccionEdificio } from './edificioSeleccion'
import { PanelInventario } from './panelInventario'
import { Pincel } from './pincel'
import { Seleccion } from './seleccion'

/** Aviso a los suscriptores: el estado vigente y los eventos del comando que lo provocó. */
export interface CambioPartida {
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoJuego[]
}

export type Suscriptor = (cambio: CambioPartida) => void

/** Avisos de interfaz que no nacen de un evento del núcleo (un comando rechazado, por ejemplo). */
export type AvisoInterfaz =
  | 'zona-sin-casillas'
  /** El núcleo rechazó `UsarHerramienta` (lejos, en pausa, sin semilla...). */
  | { readonly tipo: 'herramienta-rechazada'; readonly error: ErrorComando }
  /** El núcleo rechazó `Construir` (el estado cambió entre la silueta y la confirmación). */
  | {
      readonly tipo: 'construir-rechazado'
      readonly error: ErrorComando
      /** Edificio que se quiso construir (para el detalle de zona del motivo). */
      readonly edificio: TipoEdificio
    }
  /** El núcleo rechazó mover, demoler o cancelar una obra (el estado cambió desde que se pidió). */
  | {
      readonly tipo: 'edificio-rechazado'
      readonly accion: 'mover' | 'demoler' | 'cancelar'
      readonly error: ErrorComando
      readonly edificio: TipoEdificio
    }

/** Resultado del último `usarHerramienta` (para los tests e2e; no es estado del juego). */
export interface UltimoUso {
  /** Número de usos intentados desde que empezó la partida. */
  readonly n: number
  readonly herramienta: Herramienta
  readonly x: number
  readonly y: number
  /** Motivo del rechazo; undefined si se aceptó. */
  readonly error: ErrorComando | undefined
}

/**
 * Contenedor de la partida en la capa de juego: guarda el `EstadoJuego`, aplica comandos con
 * el núcleo y avisa a los suscriptores (observador mínimo). Lo usan la escena y, más
 * adelante, el HUD de Preact. Solo se avisa cuando el estado cambia o hay eventos.
 */
export class Partida {
  private _estado: EstadoJuego
  private readonly suscriptores = new Set<Suscriptor>()
  /** Parcela seleccionada: estado de interfaz, no del núcleo ni de lo que se guarda. */
  readonly seleccion = new Seleccion()
  /** Pincel de zonas (barra, herramienta, arrastre y cursor): también estado de interfaz. */
  readonly pincel = new Pincel()
  /** Modo Construir (catálogo, silueta y confirmación): estado de interfaz. Excluyente con el pincel y la selección. */
  readonly construccion = new Construccion()
  /** Edificio u obra seleccionado (panel con Mover, Demoler o Cancelar obra): también estado de interfaz. */
  readonly edificioSeleccionado = new SeleccionEdificio()
  /** Panel de inventario (solo en Modo Vida): estado de interfaz. */
  readonly inventario = new PanelInventario()
  private _ultimoUso: UltimoUso | undefined = undefined
  private ultimaSilueta:
    | {
        estado: EstadoJuego
        tipo: string
        origen: number | undefined
        x: number
        y: number
        silueta: Silueta | undefined
      }
    | undefined = undefined
  private readonly suscriptoresAviso = new Set<(aviso: AvisoInterfaz) => void>()

  constructor(estado: EstadoJuego) {
    this._estado = estado
    // Barra de zonas, panel de parcela y modo Construir no conviven: abrir uno cierra los otros.
    this.pincel.suscribir(() => {
      if (!this.pincel.abierto) return
      this.inventario.cerrar()
      this.construccion.cerrar()
      this.edificioSeleccionado.deseleccionar()
    })
    this.construccion.suscribir(() => {
      if (!this.construccion.abierto) return
      this.inventario.cerrar()
      this.pincel.cerrar()
      this.seleccion.deseleccionar()
      this.edificioSeleccionado.deseleccionar()
    })
    // Un edificio y una parcela no se seleccionan a la vez: elegir uno suelta el otro.
    this.seleccion.suscribir(() => {
      if (this.seleccion.indice === undefined) return
      this.inventario.cerrar()
      this.edificioSeleccionado.deseleccionar()
    })
    this.edificioSeleccionado.suscribir(() => {
      if (this.edificioSeleccionado.id === undefined) return
      this.inventario.cerrar()
      this.seleccion.deseleccionar()
      this.pincel.cerrar()
      this.construccion.cerrar()
    })
  }

  /**
   * Silueta del edificio elegido en el cursor, con el veredicto de `colocacionValida`; undefined si
   * no se está colocando. Memoizada por estado, edificio y casilla (la piden la escena y la
   * interfaz en cada cambio del puntero).
   */
  silueta(): Silueta | undefined {
    const { tipo, centro, origen } = this.construccion
    if (!this.construccion.abierto || tipo === undefined || !centro) return undefined
    const u = this.ultimaSilueta
    if (
      u &&
      u.estado === this._estado &&
      u.tipo === tipo &&
      u.origen === origen &&
      u.x === centro.x &&
      u.y === centro.y
    ) {
      return u.silueta
    }
    const silueta = calcularSilueta(this._estado, tipo, centro, origen)
    this.ultimaSilueta = { estado: this._estado, tipo, origen, x: centro.x, y: centro.y, silueta }
    return silueta
  }

  /**
   * Empieza a mover el edificio terminado `id`: abre el modo Construir en «mover» con la silueta
   * donde está ahora. No hace nada (y devuelve false) si no existe, es una obra o no es Plano.
   */
  iniciarMover(id: number): boolean {
    const e = this._estado.edificios.find((b) => b.id === id)
    const def = e && defEdificio(e.tipo)
    if (!e || !def || e.obra !== null || this._estado.modo !== 'plano') return false
    this.construccion.abrirMover(id, e.tipo, centroDeSilueta(def, e))
    return true
  }

  /**
   * Mueve el edificio a donde está la silueta de mover. Si el núcleo lo acepta se sale del modo;
   * si lo rechaza se avisa y se sigue colocando.
   */
  moverAqui(): ResultadoComando | undefined {
    const s = this.silueta()
    const id = this.construccion.origen
    // En su mismo sitio no hay nada que mover: el modo sigue abierto.
    if (!s || id === undefined || s.mismoSitio) return undefined
    const r = this.emitir({ tipo: 'MoverEdificio', id, x: s.x, y: s.y })
    if (r.ok) this.construccion.cerrar()
    else
      this.avisarInterfaz({
        tipo: 'edificio-rechazado',
        accion: 'mover',
        error: r.error,
        edificio: s.tipo,
      })
    return r
  }

  /**
   * Demuele el edificio seleccionado (si está terminado) o cancela su obra, tras la confirmación.
   * Si el núcleo lo acepta se suelta la selección; si lo rechaza se avisa y se cierra la confirmación.
   */
  quitarSeleccionado(): ResultadoComando | undefined {
    const id = this.edificioSeleccionado.id
    const c = this.edificioSeleccionado.confirmando
    const e = this._estado.edificios.find((b) => b.id === id)
    if (id === undefined || !c || !e) return undefined
    const r = this.emitir({ tipo: c.accion === 'demoler' ? 'DemolerEdificio' : 'CancelarObra', id })
    if (r.ok) this.edificioSeleccionado.deseleccionar()
    else {
      this.edificioSeleccionado.cancelarConfirmacion()
      this.avisarInterfaz({
        tipo: 'edificio-rechazado',
        accion: c.accion,
        error: r.error,
        edificio: e.tipo,
      })
    }
    return r
  }

  /** Suelta lo que ya no existe: un edificio seleccionado o en movimiento que desaparece del estado. */
  private soltarEdificiosPerdidos(): void {
    const sel = this.edificioSeleccionado.id
    if (sel !== undefined && !this._estado.edificios.some((e) => e.id === sel)) {
      this.edificioSeleccionado.deseleccionar()
    }
    const mov = this.construccion.origen
    if (mov !== undefined && !this._estado.edificios.some((e) => e.id === mov)) {
      this.construccion.cerrar()
    }
  }

  /**
   * Construye el edificio elegido donde está la silueta (tras la confirmación). Si el núcleo lo
   * acepta se vuelve al catálogo; si lo rechaza se avisa y se cierra la confirmación.
   */
  construirAqui(): ResultadoComando | undefined {
    const s = this.silueta()
    if (!s || this.construccion.confirmando === undefined) return undefined
    const r = this.emitir({ tipo: 'Construir', tipoEdificio: s.tipo, x: s.x, y: s.y })
    if (r.ok) this.construccion.terminarColocacion()
    else {
      this.construccion.cancelarConfirmacion()
      this.avisarInterfaz({ tipo: 'construir-rechazado', error: r.error, edificio: s.tipo })
    }
    return r
  }

  get estado(): EstadoJuego {
    return this._estado
  }

  get ultimoUso(): UltimoUso | undefined {
    return this._ultimoUso
  }

  /**
   * Elige la herramienta activa. Al elegir «semillas» sin semilla elegida (o con una que ya no
   * queda) toma la primera semilla del inventario, para que se pueda plantar sin más pasos.
   */
  elegirHerramienta(herramienta: Herramienta): ResultadoComando {
    const r = this.emitir({ tipo: 'ElegirHerramienta', herramienta })
    if (!r.ok || herramienta !== 'semillas') return r
    const e = this._estado
    const sigue =
      e.semillaElegida !== null && e.inventario.some((s) => s.objeto === e.semillaElegida)
    if (sigue) return r
    const primera = e.inventario.find((s) => esSemilla(s.objeto))
    return primera ? this.emitir({ tipo: 'ElegirSemilla', objeto: primera.objeto }) : r
  }

  /** Elige la semilla (del panel de inventario) y deja activa la herramienta «semillas». */
  elegirSemilla(objeto: ObjetoId): ResultadoComando {
    const r = this.emitir({ tipo: 'ElegirSemilla', objeto })
    if (r.ok) return this.elegirHerramienta('semillas')
    return r
  }

  /** Usa la herramienta activa en la casilla (x, y); si el núcleo la rechaza avisa de por qué. */
  usarHerramienta(x: number, y: number): ResultadoComando {
    const r = this.emitir({ tipo: 'UsarHerramienta', x, y })
    this._ultimoUso = {
      n: (this._ultimoUso?.n ?? 0) + 1,
      herramienta: this._estado.herramienta,
      x,
      y,
      error: r.ok ? undefined : r.error,
    }
    if (!r.ok) this.avisarInterfaz({ tipo: 'herramienta-rechazada', error: r.error })
    return r
  }

  /** Usa la herramienta activa en la casilla de enfrente del personaje (la tecla de acción y el botón). */
  usarEnfrente(): ResultadoComando {
    const c = casillaDeEnfrente(this._estado.personaje)
    return this.usarHerramienta(c.x, c.y)
  }

  /** Aplica un comando; si lo rechaza el estado no cambia y no se avisa. */
  emitir(comando: Comando): ResultadoComando {
    const r = aplicarComando(this._estado, comando)
    if (!r.ok) return r
    const cambio = r.estado !== this._estado
    this._estado = r.estado
    // La selección solo existe en el Modo Plano: al volver a Vida se suelta (y el panel se cierra).
    if (r.estado.modo !== 'plano') {
      this.seleccion.deseleccionar()
      this.pincel.cerrar()
      this.construccion.cerrar()
      this.edificioSeleccionado.deseleccionar()
    }
    // El inventario solo se abre en Vida: al pasar al Plano se cierra.
    if (r.estado.modo === 'plano') this.inventario.cerrar()
    if (cambio) this.soltarEdificiosPerdidos()
    if (cambio || r.eventos.length > 0) this.avisar({ estado: r.estado, eventos: r.eventos })
    return r
  }

  /** Reemplaza el estado sin comando (solo depuración y pruebas); avisa a los suscriptores. */
  reemplazar(estado: EstadoJuego): void {
    this._estado = estado
    this.inventario.cerrar()
    this.seleccion.deseleccionar()
    this.pincel.cerrar()
    this.construccion.cerrar()
    this.edificioSeleccionado.deseleccionar()
    this.avisar({ estado, eventos: [] })
  }

  /** Devuelve la función que cancela la suscripción. */
  suscribir(f: Suscriptor): () => void {
    this.suscriptores.add(f)
    return () => {
      this.suscriptores.delete(f)
    }
  }

  /** Pide a la interfaz un aviso breve (lo muestra `Aviso`). */
  avisarInterfaz(aviso: AvisoInterfaz): void {
    for (const f of [...this.suscriptoresAviso]) {
      try {
        f(aviso)
      } catch (error) {
        console.error(error)
      }
    }
  }

  suscribirAvisos(f: (aviso: AvisoInterfaz) => void): () => void {
    this.suscriptoresAviso.add(f)
    return () => {
      this.suscriptoresAviso.delete(f)
    }
  }

  private avisar(cambio: CambioPartida): void {
    for (const f of [...this.suscriptores]) {
      try {
        f(cambio)
      } catch (error) {
        // Un suscriptor roto no debe impedir avisar a los demás ni romper el bucle.
        console.error(error)
      }
    }
  }
}
