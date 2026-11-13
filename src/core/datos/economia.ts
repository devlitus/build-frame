import * as v from 'valibot'
import datos from '../../../data/economia.json'
import { EsquemaConfigEconomia } from './esquemas'

/** Configuración económica, validada al cargar el módulo. */
export const CONFIG_ECONOMIA = v.parse(EsquemaConfigEconomia, datos)
