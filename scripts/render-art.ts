// Renders all 3D assets with Blender: `npm run render-art` (or `npm run render-art -- ragnar loot`).
// Finds Blender via the BLENDER env var, the PATH, or the default Windows install folder.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function findBlender(): string {
  if (process.env.BLENDER) return process.env.BLENDER
  const base = 'C:\\Program Files\\Blender Foundation'
  if (existsSync(base)) {
    const versions = readdirSync(base).filter(d => d.startsWith('Blender')).sort().reverse()
    for (const v of versions) {
      const exe = join(base, v, 'blender.exe')
      if (existsSync(exe)) return exe
    }
  }
  return 'blender'
}

const blender = findBlender()
const subjects = process.argv.slice(2)
const args = ['-b', '--factory-startup', '-P', 'art-source/blender/render_assets.py', ...(subjects.length ? ['--', ...subjects] : [])]
console.log(`Rendering with ${blender} ${subjects.length ? `(${subjects.join(', ')})` : '(everything)'}`)
const r = spawnSync(blender, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf-8' })
if (r.error) {
  console.error(`Could not start Blender (${r.error.message}). Install it or set BLENDER to blender.exe.`)
  process.exit(1)
}
for (const line of r.stdout.split('\n')) if (line.includes('[viking-loot]') || line.includes('Traceback') || line.includes('Error:') && !line.includes('Shadow buffer')) console.log(line)
process.exit(r.status ?? 1)
