import * as v from 'valibot'
import datos from '../../../data/recursos.json'
import { EsquemaConfigRecursos, type ConfigRecursos } from './esquemas'

/** Botín, dureza y crecimiento de árboles, rocas y plantones, validado al cargar el módulo. */
export const CONFIG_RECURSOS: ConfigRecursos = v.parse(EsquemaConfigRecursos, datos)
