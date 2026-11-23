// Loads a framework-free TypeScript module of the Angular app (a page's mock backend …) into Node — the SAME code the browser runs —
// so the Java replica and the Angular page are served identical data. Node strips the types itself but needs explicit `.ts`
// extensions, so the module and everything it reaches (relative imports and the @core/@shared/@layout/@features aliases) is
// mirrored into `outDir` with every import rewritten to the file URL of the mirrored copy. A fresh `outDir` = a fresh module
// instance (the mocks keep their state at module level), which is how every scenario gets a clean backend.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ALIAS = { '@core/': 'src/app/core/', '@shared/': 'src/app/shared/', '@layout/': 'src/app/layout/', '@features/': 'src/app/features/' };

function resolveSpec(ngRoot, spec, from) {
  let base;
  if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else {
    const a = Object.keys(ALIAS).find((k) => spec.startsWith(k));
    if (!a) return null; // a package
    base = resolve(ngRoot, ALIAS[a] + spec.slice(a.length));
  }
  for (const c of [base, base + '.ts', join(base, 'index.ts')]) if (c.endsWith('.ts') && existsSync(c)) return c;
  return null;
}

export async function loadTs(ngRoot, entry, outDir) {
  const seen = new Map();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'package.json'), '{"type":"module"}'); // (no "reparsing as ES module" warning)
  const mirror = (file) => {
    if (seen.has(file)) return seen.get(file);
    const dest = join(outDir, relative(ngRoot, file));
    seen.set(file, dest);
    const src = readFileSync(file, 'utf8').replace(/(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (m, pre, q, spec) => {
      const target = resolveSpec(ngRoot, spec, file);
      return target ? pre + q + pathToFileURL(mirror(target)).href + q : m;
    });
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, src);
    return dest;
  };
  return import(pathToFileURL(mirror(resolve(entry))).href);
}
