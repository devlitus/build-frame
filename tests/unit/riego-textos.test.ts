import { describe, expect, it } from 'vitest'
import textos from '../../src/ui/textos/es.json'

describe('textos de la regadera', () => {
  it('todos sus motivos de rechazo tienen texto', () => {
    for (const m of ['no-arada', 'ya-regada', 'planta-marchita', 'planta-madura']) {
      expect(textos[`errorHerramienta_${m}` as keyof typeof textos]).toBeTruthy()
    }
  })
})
