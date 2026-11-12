import * as v from 'valibot'
import datos from '../../../data/tiempo.json'
import { EsquemaConfigTiempo, type ConfigTiempo } from './esquemas'

/** Configuración del reloj y el calendario, validada al cargar el módulo. */
export const CONFIG_TIEMPO: ConfigTiempo = Object.freeze({
  ...v.parse(EsquemaConfigTiempo, datos),
})
Object.freeze(CONFIG_TIEMPO.estaciones)
Object.freeze(CONFIG_TIEMPO.velocidades)
