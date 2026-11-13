import {
  comprobarConstruir,
  comprobarMover,
  defEdificio,
  ladoValle,
  type EstadoJuego,
  type ErrorComando,
  type TipoEdificio,
} from '../core'
import { casillaVecina, type Casilla, type DireccionCasilla } from './pincel'

/**
 * Estado de INTERFAZ del modo Construir (Modo Plano): catálogo abierto, edificio elegido, casilla
 * del cursor y confirmación pendiente. No es del núcleo ni se guarda. Las reglas de dónde se puede
 * construir son del núcleo (`colocacionValida`, que usa `calcularSilueta`); aquí solo se decide
 * QUÉ se está intentando colocar y dónde.
 */

/** Veredicto de `Construir` para la silueta: mismo comprobador que el comando. */
export type ResultadoSilueta =
  { readonly valida: true } | { readonly valida: false; readonly motivo: ErrorComando }

/** Silueta de un edificio sobre el valle: su huella y si se puede colocar (con el motivo si no). */
export interface Silueta {
  readonly tipo: TipoEdificio
  /** Esquina superior izquierda de la huella (casillas). */
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
  readonly resultado: ResultadoSilueta
  /**
   * Solo al mover: la silueta está justo donde el edificio ya está. El núcleo lo acepta (mover a su
   * sitio no cambia nada), pero para el jugador no es un sitio al que mover: ni se pinta como válida
   * ni Enter ni «Mover aquí» hacen nada.
   */
  readonly mismoSitio: boolean
}

/** ¿Se puede colocar de verdad? Válida para el núcleo y distinta del sitio actual (al mover). */
export function sePuedeColocar(s: Silueta | undefined): boolean {
  return s !== undefined && s.resultado.valida && !s.mismoSitio
}

/**
 * Esquina superior izquierda de la huella para que la casilla `centro` quede en su centro (en
 * huellas pares, la casilla de arriba o de la izquierda de las dos centrales). Siempre dentro del
 * valle: junto al borde la silueta se queda pegada y no desaparece.
 */
export function esquinaDeSilueta(
  def: { readonly ancho: number; readonly alto: number },
  centro: Casilla,
  lado: number,
): Casilla {
  const acotar = (n: number, max: number): number => Math.min(Math.max(0, max), Math.max(0, n))
  return {
    x: acotar(centro.x - Math.floor((def.ancho - 1) / 2), lado - def.ancho),
    y: acotar(centro.y - Math.floor((def.alto - 1) / 2), lado - def.alto),
  }
}

/** Casilla que hay que apuntar para que la silueta de `def` quede con la esquina `esquina` (inversa de `esquinaDeSilueta`). */
export function centroDeSilueta(
  def: { readonly ancho: number; readonly alto: number },
  esquina: Casilla,
): Casilla {
  return {
    x: esquina.x + Math.floor((def.ancho - 1) / 2),
    y: esquina.y + Math.floor((def.alto - 1) / 2),
  }
}

function veredicto(
  estado: EstadoJuego,
  tipo: TipoEdificio,
  x: number,
  y: number,
  origenId: number | undefined,
): ResultadoSilueta {
  // Mover usa las mismas reglas que construir, sin costes y sin chocar con el propio edificio.
  const motivo =
    origenId === undefined
      ? comprobarConstruir(estado, tipo, x, y)
      : comprobarMover(estado, origenId, x, y)
  return motivo ? { valida: false, motivo } : { valida: true }
}

/**
 * Silueta de `tipo` centrada en la casilla `centro`, con el veredicto del núcleo; undefined si el
 * tipo no existe. Con `origenId` es la silueta de mover ese edificio (`comprobarMover`).
 */
export function calcularSilueta(
  estado: EstadoJuego,
  tipo: TipoEdificio,
  centro: Casilla,
  origenId?: number,
): Silueta | undefined {
  const def = defEdificio(tipo)
  if (!def) return undefined
  const { x, y } = esquinaDeSilueta(def, centro, ladoValle(estado.valle))
  const actual =
    origenId === undefined ? undefined : estado.edificios.find((b) => b.id === origenId)
  return {
    tipo,
    x,
    y,
    ancho: def.ancho,
    alto: def.alto,
    resultado: veredicto(estado, tipo, x, y, origenId),
    mismoSitio: actual !== undefined && actual.x === x && actual.y === y,
  }
}

/**
 * ¿Cae toda la huella de la silueta en parcelas propias? Bastan las cuatro esquinas: ningún
 * edificio es mayor que una parcela (ancho y alto <= casillasPorParcela), así que la huella toca
 * como mucho dos parcelas por eje y las esquinas ya cubren todas las que pisa.
 */
function huellaEnPropia(estado: EstadoJuego, s: Silueta): boolean {
  const v = estado.valle
  const c = v.casillasPorParcela
  for (const y of [s.y, s.y + s.alto - 1]) {
    for (const x of [s.x, s.x + s.ancho - 1]) {
      const p = v.parcelas[Math.floor(y / c) * v.parcelasPorLado + Math.floor(x / c)]
      if (p?.estado !== 'propia') return false
    }
  }
  return true
}

/** Radio (casillas) de la búsqueda de un sitio válido junto a la tierra propia más cercana. */
const RADIO_BUSQUEDA_SILUETA = 6

/**
 * Casilla donde nace la silueta al elegir un edificio. Si la huella ya cae entera en tierra propia
 * en `preferida` (el centro de la zona libre) se queda ahí. Si no, va a la tierra propia más
 * cercana: una posición válida cerca de ella si existe; si no, la más cercana a `preferida` cuya
 * huella esté en tierra propia; y si tampoco hay, la casilla propia más cercana. Sin parcelas
 * propias, `preferida`.
 */
export function casillaInicialSilueta(
  estado: EstadoJuego,
  tipo: TipoEdificio,
  preferida: Casilla,
): Casilla {
  const inicial = calcularSilueta(estado, tipo, preferida)
  if (!inicial || huellaEnPropia(estado, inicial)) return preferida
  const v = estado.valle
  const lado = ladoValle(v)
  const c = v.casillasPorParcela
  // Casilla de tierra propia más cercana a `preferida`.
  let cercana: Casilla | undefined
  let dMin = Infinity
  for (const p of v.parcelas) {
    if (p.estado !== 'propia') continue
    const x = Math.min(Math.max(preferida.x, p.columna * c), (p.columna + 1) * c - 1)
    const y = Math.min(Math.max(preferida.y, p.fila * c), (p.fila + 1) * c - 1)
    const d = (x - preferida.x) ** 2 + (y - preferida.y) ** 2
    if (d < dMin) {
      dMin = d
      cercana = { x, y }
    }
  }
  if (!cercana) return preferida
  let valida: { c: Casilla; d: number } | undefined
  let propia: { c: Casilla; d: number } | undefined
  for (
    let y = Math.max(0, cercana.y - RADIO_BUSQUEDA_SILUETA);
    y <= Math.min(lado - 1, cercana.y + RADIO_BUSQUEDA_SILUETA);
    y++
  ) {
    for (
      let x = Math.max(0, cercana.x - RADIO_BUSQUEDA_SILUETA);
      x <= Math.min(lado - 1, cercana.x + RADIO_BUSQUEDA_SILUETA);
      x++
    ) {
      const s = calcularSilueta(estado, tipo, { x, y })
      if (!s) continue
      const d = (x - preferida.x) ** 2 + (y - preferida.y) ** 2
      if (s.resultado.valida) {
        if (!valida || d < valida.d) valida = { c: { x, y }, d }
      } else if (huellaEnPropia(estado, s)) {
        if (!propia || d < propia.d) propia = { c: { x, y }, d }
      }
    }
  }
  return valida?.c ?? propia?.c ?? cercana
}

/** Quién pidió la confirmación: decide dónde cae el foco (con el puntero, en «Cancelar»; con el teclado, en «Construir»). */
export type OrigenConfirmacion = 'puntero' | 'teclado'

export type AvisoConstruccion = () => void

export class Construccion {
  private _abierto = false
  private _tipo: TipoEdificio | undefined = undefined
  /** Edificio que se está moviendo (modo «mover»); undefined al construir. */
  private _origen: number | undefined = undefined
  private _centro: Casilla | undefined = undefined
  private _confirmando: OrigenConfirmacion | undefined = undefined
  private readonly suscriptores = new Set<AvisoConstruccion>()

  /** ¿Está abierto el modo Construir (catálogo, colocación o confirmación)? */
  get abierto(): boolean {
    return this._abierto
  }

  /** Edificio elegido en el catálogo, o undefined si se está viendo el catálogo. */
  get tipo(): TipoEdificio | undefined {
    return this._tipo
  }

  /** `id` del edificio que se está moviendo, o undefined si se está construyendo. */
  get origen(): number | undefined {
    return this._origen
  }

  /** Casilla del cursor (centro de la silueta), o undefined si aún no se ha colocado. */
  get centro(): Casilla | undefined {
    return this._centro
  }

  /** ¿Hay una confirmación abierta? Devuelve quién la pidió. */
  get confirmando(): OrigenConfirmacion | undefined {
    return this._confirmando
  }

  /** ¿Se coloca ahora? Hay edificio elegido y no se está confirmando: el puntero mueve la silueta. */
  get activo(): boolean {
    return this._abierto && this._tipo !== undefined && this._confirmando === undefined
  }

  abrir(): void {
    if (this._abierto) return
    this._abierto = true
    this.avisar()
  }

  /** Cierra el modo y suelta edificio, cursor y confirmación. */
  cerrar(): void {
    if (
      !this._abierto &&
      !this._tipo &&
      !this._centro &&
      !this._confirmando &&
      this._origen === undefined
    )
      return
    this._abierto = false
    this._tipo = undefined
    this._origen = undefined
    this._centro = undefined
    this._confirmando = undefined
    this.avisar()
  }

  /**
   * Abre el modo en «mover»: la silueta es la del edificio `id` (de tipo `tipo`) y empieza donde
   * está (`centro`). No se elige otro edificio ni hay catálogo; «Cerrar» o `cerrar()` cancela.
   */
  abrirMover(id: number, tipo: TipoEdificio, centro: Casilla): void {
    this._abierto = true
    this._origen = id
    this._tipo = tipo
    this._centro = { x: centro.x, y: centro.y }
    this._confirmando = undefined
    this.avisar()
  }

  /** Elige el edificio (o vuelve al catálogo con `undefined`). Con el modo cerrado no hace nada. */
  elegir(tipo: TipoEdificio | undefined): void {
    if (!this._abierto || tipo === this._tipo || this._origen !== undefined) return
    this._tipo = tipo
    this._confirmando = undefined
    if (tipo === undefined) this._centro = undefined
    this.avisar()
  }

  /** Mueve el cursor (la silueta lo sigue). Solo si se está colocando. */
  colocar(c: Casilla): void {
    if (!this.activo) return
    const a = this._centro
    if (a && a.x === c.x && a.y === c.y) return
    this._centro = { x: c.x, y: c.y }
    this.avisar()
  }

  /** Flechas: desplaza el cursor una casilla; true si había cursor (la flecha es entonces suya y no de la cámara). */
  mover(lado: number, d: DireccionCasilla): boolean {
    const c = this._centro
    if (!c || !this.activo) return false
    const n = casillaVecina(lado, c, d)
    if (n.x !== c.x || n.y !== c.y) {
      this._centro = n
      this.avisar()
    }
    return true
  }

  /** Abre la confirmación (hace falta edificio y cursor). */
  pedirConfirmacion(origen: OrigenConfirmacion): void {
    if (!this.activo || !this._centro) return
    this._confirmando = origen
    this.avisar()
  }

  /** Cierra la confirmación sin construir; true si había una. */
  cancelarConfirmacion(): boolean {
    if (this._confirmando === undefined) return false
    this._confirmando = undefined
    this.avisar()
    return true
  }

  /** Tras construir: vuelve al catálogo (el modo sigue abierto). */
  terminarColocacion(): void {
    if (!this._abierto) return
    this._tipo = undefined
    this._origen = undefined
    this._centro = undefined
    this._confirmando = undefined
    this.avisar()
  }

  suscribir(f: AvisoConstruccion): () => void {
    this.suscriptores.add(f)
    return () => {
      this.suscriptores.delete(f)
    }
  }

  private avisar(): void {
    for (const f of [...this.suscriptores]) {
      try {
        f()
      } catch (error) {
        console.error(error)
      }
    }
  }
}
