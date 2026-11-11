import * as v from 'valibot'
import datos from '../../../data/valle.json'
import { EsquemaConfigValle } from './esquemas'

/** Configuración del valle, validada al cargar el módulo. */
export const CONFIG_VALLE = v.parse(EsquemaConfigValle, datos)
