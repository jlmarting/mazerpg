import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));

function resolverEsbuild() {
  const pnpm = join(raiz, 'node_modules', '.pnpm');
  if (existsSync(pnpm)) {
    for (const entrada of readdirSync(pnpm)) {
      if (!entrada.startsWith('esbuild@')) continue;
      const bin = join(pnpm, entrada, 'node_modules', 'esbuild', 'bin', 'esbuild');
      if (existsSync(bin)) return bin;
    }
  }
  const directo = join(raiz, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (existsSync(directo)) return directo;
  throw new Error('esbuild no encontrado en node_modules');
}

const esbuild = resolverEsbuild();
const dirSpecs = join(raiz, 'src', 'world');
const specs = readdirSync(dirSpecs)
  .filter((f) => f.endsWith('.helpers.spec.ts'))
  .sort();

if (specs.length === 0) {
  console.error('No se encontraron specs *.helpers.spec.ts');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'mazerpg-test-'));
let fallos = 0;

try {
  for (const spec of specs) {
    const entrada = join(dirSpecs, spec);
    const salida = join(tmp, `${spec.replace(/\.ts$/, '')}.mjs`);

    const bundle = spawnSync(
      esbuild,
      ['--bundle', entrada, `--outfile=${salida}`, '--format=esm', '--platform=node', '--log-level=warning'],
      { stdio: 'inherit' },
    );
    if (bundle.status !== 0) {
      console.error(`FALLO bundle: ${spec}`);
      fallos++;
      continue;
    }

    const ejecucion = spawnSync(process.execPath, [salida], { stdio: 'inherit' });
    if (ejecucion.status !== 0) {
      console.error(`FALLO spec: ${spec}`);
      fallos++;
      continue;
    }
    console.log(`PASS ${spec}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (fallos > 0) {
  console.error(`\n${fallos}/${specs.length} specs fallaron`);
  process.exit(1);
}

console.log(`\n${specs.length}/${specs.length} specs en verde`);
