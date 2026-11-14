declare const __VERSION__: string

interface Window {
  /** Información de solo lectura para los tests e2e. */
  __raices?: {
    escenaActiva(): string | undefined
    semilla(): number | undefined
    /** Lado del mundo en píxeles (el valle es cuadrado); undefined si aún no hay valle. */
    mundoPx(): number | undefined
    /** Número de texturas en el gestor de Phaser. */
    texturas(): number
    /** Reinicia la escena del valle; solo hace algo con `?debug`. */
    reiniciarValle(): void
    /** Aplica un comando del nucleo a la partida; solo hace algo con `?debug`. */
    emitir(comando: { tipo: string; [campo: string]: unknown }): void
    /** Fotogramas por segundo medidos por el bucle de Phaser. */
    fps(): number
    /** Texto del contador de fps; undefined si no hay escena de depuración (sin `?debug`). */
    contadorFps(): string | undefined
    /** Número de objetos en la lista de la escena del valle, sin los de la capa por profundidad (`objetosCapa`). */
    objetosValle(): number | undefined
    /**
     * Objetos con profundidad (árboles y rocas) vivos (`activos`), los que caen en la vista más el
     * margen (`enVista`) y los obstáculos del estado (`obstaculos`, techo de `activos`).
     */
    objetosCapa(): { activos: number; enVista: number; obstaculos: number } | undefined
    /** Tamaño (en órdenes de dibujo) de cada `Graphics` vivo en la escena del valle. */
    graficosValle(): number[]
    /** Modo de juego vigente; undefined si no hay valle. */
    modo(): 'vida' | 'plano' | undefined
    /** Personaje en casillas (centro de su caja); undefined si no hay valle. */
    personaje(): { x: number; y: number; orientacion: string } | undefined
    /** ¿La casilla (cx, cy) no se puede pisar? (true también fuera del valle o sin valle) */
    bloqueada(cx: number, cy: number): boolean
    /** Destino del personaje en casillas (centro); undefined si no hay ruta en curso. */
    destino(): { x: number; y: number } | undefined
    /** ¿Hay un joystick virtual en pantalla? */
    joystickVisible(): boolean
    /** Reloj de la partida; undefined si no hay valle. */
    reloj(): { dia: number; minutoDelDia: number; pausado: boolean; velocidad: number } | undefined
    /** Tinte del ciclo día/noche (opacidad 0..1); undefined si no hay valle. */
    luz(): { alfa: number } | undefined
    /** Claves de casilla de los vados (`y * lado + x`) y lado del valle en casillas. */
    vados(): { lado: number; claves: number[] } | undefined
    /** Dinero de la partida; undefined si no hay partida. */
    /** Energía del personaje (0..máximo); undefined si no hay partida. */
    energia(): number | undefined
    dinero(): number | undefined
    /** Estado visual con el que se dibujó la parcela por última vez; undefined si no hay valle. */
    estadoVisual(indice: number): 'propia' | 'comprable' | 'no-comprable' | undefined
    /** Veces que se ha redibujado el Graphics de parcelas (no el valle horneado). */
    repintadosParcelas(): number | undefined
    /** Índice de la parcela seleccionada (Modo Plano); undefined si no hay. */
    seleccionada(): number | undefined
    /** Selecciona una parcela por índice; solo con `?debug` y en Plano. */
    seleccionar(indice: number): void
    /** Atributos, precio y comprabilidad de una parcela según el estado; solo con `?debug`. */
    parcelaInfo(indice: number):
      | {
          fila: number
          columna: number
          terreno: string
          fertilidad: string
          agua: string
          estado: string
          precio: number | undefined
          comprable: boolean
          motivo: string | undefined
          dinero: number
        }
      | undefined
    /** Punto de pantalla (px) donde pulsar para tocar la parcela; solo con `?debug`. */
    puntoClicParcela(indice: number): { x: number; y: number } | undefined
    /** Zona pintada en la casilla (cx, cy); solo con `?debug`. */
    zonaDe(cx: number, cy: number): 'cultivo' | 'huerto' | 'vivienda' | 'almacen' | undefined
    /** Punto de pantalla (px) donde pulsar para tocar la casilla; solo con `?debug`. */
    puntoClicCasilla(cx: number, cy: number): { x: number; y: number } | undefined
    /** Opacidad de la capa de zonas; solo con `?debug`. */
    alfaZonas(): number | undefined
    /** Estado del pincel de zonas (barra, herramienta, cursor de teclado y vista previa). */
    pincel():
      | {
          abierto: boolean
          herramienta: string | undefined
          cursor: { x: number; y: number } | undefined
          ancla: { x: number; y: number } | undefined
          rectangulo: { x0: number; y0: number; x1: number; y1: number } | undefined
        }
      | undefined
    /** Herramienta activa y semilla elegida; undefined si no hay partida. */
    herramienta(): { herramienta: string; semilla: string | null } | undefined
    /** Inventario: ranuras, capacidad y si el panel está abierto; undefined si no hay partida. */
    inventario():
      | {
          ranuras: { objeto: string; cantidad: number }[]
          capacidad: number
          abierto: boolean
        }
      | undefined
    /** Último uso de una herramienta (acción o clic): cuántos van, dónde y el motivo del rechazo. */
    ultimoUso():
      | { n: number; herramienta: string; x: number; y: number; error: string | undefined }
      | undefined
    /** Madera y piedra de la partida; undefined si no hay partida. */
    materiales(): { madera: number; piedra: number } | undefined
    /** Estado del modo Construir: catálogo, edificio elegido, cursor y silueta con su veredicto. */
    construccion():
      | {
          abierto: boolean
          tipo: string | undefined
          /** `id` del edificio que se está moviendo (modo mover); undefined al construir. */
          origen: number | undefined
          confirmando: boolean
          centro: { x: number; y: number } | undefined
          silueta:
            | {
                tipo: string
                x: number
                y: number
                ancho: number
                alto: number
                valida: boolean
                motivo: string | undefined
              }
            | undefined
        }
      | undefined
    /** Edificios y obras que se ven: huella, si están en obra y los días del cartel. */
    edificios(): {
      id: number
      tipo: string
      x: number
      y: number
      ancho: number
      alto: number
      enObra: boolean
      diasCartel: number | undefined
      profundidad: number
    }[]
    /** Edificio u obra seleccionado y la confirmación abierta («demoler» o «cancelar»); undefined sin partida. */
    edificioSeleccionado():
      { id: number | undefined; confirmando: 'demoler' | 'cancelar' | undefined } | undefined
    /** Selecciona un edificio u obra por id (Modo Plano); solo con `?debug`. */
    seleccionarEdificio(id: number): void
    /** Punto de pantalla (px) donde pulsar para tocar el edificio; solo con `?debug`. */
    puntoClicEdificio(id: number): { x: number; y: number } | undefined
    /** Centra la cámara del Plano en la casilla (cx, cy); solo con `?debug`. */
    centrarCamara(cx: number, cy: number): void
    /** Veredicto de `colocacionValida` en (x, y); solo con `?debug`. */
    colocacion(
      tipo: string,
      x: number,
      y: number,
    ): { valida: boolean; motivo: string | undefined } | undefined
    /** Cámara del valle; scrollX/Y es la esquina superior izquierda de la vista sin zoom. */
    camara():
      | {
          zoom: number
          scrollX: number
          scrollY: number
          ancho: number
          alto: number
          guiando: boolean
        }
      | undefined
  }
}
