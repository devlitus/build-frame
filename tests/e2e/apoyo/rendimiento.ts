import { test } from '@playwright/test'

/**
 * Performance target of a @rendimiento test: noted, never fails.
 *
 * `expect.soft` is not used on purpose: a failed soft assertion still marks the test (and the run)
 * as failed. Here a missed target becomes a `target-missed` annotation (visible in the report) and a
 * console warning; only the floor, a normal `expect` in the test, makes the command fail.
 */
export function target(met: boolean, description: string): void {
  if (met) return
  test.info().annotations.push({ type: 'target-missed', description })
  console.warn(`[target-missed ${test.info().project.name}] ${description}`)
}
