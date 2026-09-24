import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRS = ['src', 'server', 'relay', 'scripts'];
const LOCAL_IMPORT = /\bfrom\s+['"](\.[^'"]+)['"]|\bimport\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)|\bnew\s+URL\s*\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url/g;

async function sourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const name = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(name);
    return entry.isFile() && /\.(?:m?js)$/.test(entry.name) ? [name] : [];
  }));
  return nested.flat();
}

export async function checkSource(root, dirs = SOURCE_DIRS) {
  const issues = [];
  const dependencies = new Map();
  for (const dir of dirs) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const file of await sourceFiles(path)) {
      const label = relative(root, file);
      const source = await readFile(file, 'utf8');
      source.split(/\r?\n/).forEach((line, index) => {
        if (/[ \t]+$/.test(line)) issues.push(`${label}:${index + 1}: trailing whitespace`);
      });
      // Force ESM parsing even for fixture files outside this package's
      // type:module boundary. Node's file-mode --check can miss that case.
      const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
      if (syntax.status !== 0) issues.push(`${label}: syntax error\n${syntax.stderr.trim()}`);
      const refs = [];
      for (const match of source.matchAll(LOCAL_IMPORT)) {
        const specifier = match.slice(1).find(Boolean);
        const target = resolve(dirname(file), specifier);
        refs.push(target);
        if (!existsSync(target)) {
          issues.push(`${label}: missing local import ${specifier}`);
        }
      }
      dependencies.set(file, refs);
    }
  }
  const browserRoot = join(root, 'src');
  const entrypoint = join(browserRoot, 'main.js');
  if (dirs.includes('src') && dependencies.has(entrypoint)) {
    const reachable = new Set();
    const visit = file => {
      if (reachable.has(file) || !dependencies.has(file)) return;
      reachable.add(file);
      for (const ref of dependencies.get(file)) visit(ref);
    };
    visit(entrypoint);
    for (const file of dependencies.keys()) {
      if (file.startsWith(browserRoot + sep) && !reachable.has(file)) {
        issues.push(`${relative(root, file)}: unreachable from src/main.js`);
      }
    }
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const issues = await checkSource(root);
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Source lint, local imports, and browser module reachability are valid.');
  }
}
