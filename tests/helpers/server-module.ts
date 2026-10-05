import { readFileSync } from 'node:fs';
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
    module, exports: module.exports, Buffer, URL, fetch, process,
    require: (name: string) => name === 'server-only' ? {} :
      Object.hasOwn(dependencies, name) ? dependencies[name] : localRequire(name),
    ...globals,
  }, { filename });
  return module.exports as T;
}
