/** Interfaz única de almacenamiento de partidas (ADR 0001). Implementación: M7. */
export interface ResumenPartida {
  readonly id: string
  readonly nombre: string
  readonly actualizada: string
}

export interface PartidaSerializada {
  readonly versionFormato: number
  readonly datos: unknown
}

export interface AlmacenPartidas {
  listar(): Promise<ResumenPartida[]>
  cargar(id: string): Promise<PartidaSerializada>
  guardar(id: string, partida: PartidaSerializada): Promise<void>
  borrar(id: string): Promise<void>
}
