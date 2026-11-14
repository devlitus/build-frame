import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Newest modification time (ms) under `path`, a file or a directory (recursive). */
function newestMtime(path: string): number {
  if (!existsSync(path)) return 0
  const st = statSync(path)
  if (!st.isDirectory()) return st.mtimeMs
  let newest = st.mtimeMs
  for (const name of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, name)))
  return newest
}

/**
 * Returns an error message if `dist/` is missing or older than its sources
 * (src/, data/, index.html), or undefined if it is up to date.
 */
export function checkDist(root: string): string | undefined {
  const index = join(root, 'dist', 'index.html')
  if (!existsSync(index)) {
    return 'dist/ does not exist: run `npm run build` first (or use `npm run e2e`, which builds).'
  }
  const built = statSync(index).mtimeMs
  for (const source of ['src', 'data', 'index.html']) {
    if (newestMtime(join(root, source)) > built) {
      return `dist/ is older than ${source}: run \`npm run build\` (or use \`npm run e2e\`, which builds).`
    }
  }
  return undefined
}

/** Playwright globalSetup: fails with a clear message instead of testing a stale build. */
export default function globalSetup(): void {
  const error = checkDist(resolve(process.cwd()))
  if (error) throw new Error(`[e2e] ${error}`)
}

// Also runnable on its own (`node tests/e2e/apoyo/check-dist.ts`): the webServer command uses it so
// the error shows before `vite preview` fails with a less helpful message.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const error = checkDist(process.cwd())
  if (error) {
    console.error(`[e2e] ${error}`)
    process.exit(1)
  }
}
