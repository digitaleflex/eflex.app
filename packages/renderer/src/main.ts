#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { detect, walkRepository } from '../../detector/src/index.js';
import type { RepoSnapshot } from '../../detector/src/types.js';
import { renderStack } from './render.js';
import type { RenderContext } from './types.js';

function readSnapshot(dir: string): RepoSnapshot {
  const absDir = resolve(dir);
  return {
    files: walkRepository(absDir),
    read: (path: string) => {
      try { return readFileSync(resolve(absDir, path), 'utf-8'); }
      catch { return null; }
    },
  };
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: pnpm render <path>');
  process.exit(1);
}

if (!existsSync(target)) {
  console.error(`Path not found: ${target}`);
  process.exit(1);
}

const snapshot = readSnapshot(target);
const result = detect(snapshot);

if (!result.plan) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const ctx: RenderContext = {
  projectId: 'demo-' + (target.split('/').pop() ?? 'project'),
  image: 'ghcr.io/eflex/app:latest',
};

const stack = renderStack(result.plan, ctx);
console.log('# === COMPOSE YAML ===');
console.log(stack.compose);
console.log('# === FILES ===');
for (const [name, content] of Object.entries(stack.files)) {
  console.log(`# --- ${name} ---`);
  console.log(content);
}
console.log('# === .env.example ===');
console.log(stack.envTemplate || '(no runtime env)');
console.log('# === METADATA ===');
console.log(JSON.stringify(stack.metadata, null, 2));