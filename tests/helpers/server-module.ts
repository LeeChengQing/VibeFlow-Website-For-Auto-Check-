import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

// Supply Next's request-scoped boundary without weakening server-only production code.
export function loadServerModule<T>(
  path: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const filename = resolve(path);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const compiled = transformSync(readFileSync(filename, 'utf8'), {
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic',
    format: 'cjs', target: 'es2022', sourcefile: filename,
  }).code;
  runInNewContext(compiled, {
    module, exports: module.exports, Buffer, URL, URLSearchParams, fetch, process,
    AbortSignal, Headers, Request, Response,
    require: (name: string) => {
      if (name === 'server-only') return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith('@/')) {
        const fullPath = resolve(process.cwd(), name.slice(2));
        if (existsSync(fullPath + '.ts')) return localRequire(fullPath + '.ts');
        if (existsSync(fullPath + '.tsx')) return localRequire(fullPath + '.tsx');
        if (existsSync(fullPath + '/index.ts')) return localRequire(fullPath + '/index.ts');
        if (existsSync(fullPath + '/index.tsx')) return localRequire(fullPath + '/index.tsx');
        return localRequire(fullPath);
      }
      return localRequire(name);
    },
    ...globals,
  }, { filename });
  return module.exports as T;
}
