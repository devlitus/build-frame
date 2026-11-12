import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/prop/**/*.test.ts'],
    environment: 'node',
    // Algunos tests generan varios valles (~2 s cada uno): con la máquina cargada superan los 5 s.
    testTimeout: 20_000,
  },
})
