import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkRepository } from '../src/index.js';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeTree(files: string[]): string {
  root = mkdtempSync(join(tmpdir(), 'eflex-walk-'));
  for (const file of files) {
    const absolute = join(root, file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, 'x');
  }
  return root;
}

describe('walkRepository', () => {
  it('liste les fichiers relatifs et ignore les segments exclus', () => {
    const dir = makeTree([
      'src/index.ts',
      'package.json',
      'node_modules/dep/index.js',
      '.git/config',
      'dist/out.js',
      'apps/web/package.json',
    ]);

    expect(walkRepository(dir)).toEqual([
      'apps/web/package.json',
      'package.json',
      'src/index.ts',
    ]);
  });

  it('ignore les dossiers imbriqués exclus (vendor, .next, venv…)', () => {
    const dir = makeTree([
      'services/api/main.go',
      'services/api/vendor/lib.php',
      'web/.next/server/page.js',
      'py/.venv/lib/python.py',
      'py/main.py',
    ]);

    expect(walkRepository(dir)).toEqual(['py/main.py', 'services/api/main.go']);
  });

  it('renvoie un tableau vide pour un dossier vide et reste déterministe', () => {
    const dir = makeTree([]);
    expect(walkRepository(dir)).toEqual([]);
    expect(walkRepository(dir)).toEqual([]);
  });
});
