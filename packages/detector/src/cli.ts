#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { detect, isIgnoredPath } from './detect.js';

const HELP = `Usage : pnpm detect <chemin>

Analyse récursivement un répertoire local (aucun appel réseau) et affiche le
plan de déploiement Eflex détecté au format JSON.

Exemple :
  pnpm detect ./mon-repo
`;

function walk(target: string): string[] {
  const files: string[] = [];

  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relativePath = relative(target, absolute).split(sep).join('/');
      if (isIgnoredPath(relativePath)) continue;

      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  visit(target);
  return files;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const targetArg = args[0];
  if (!targetArg) {
    process.stderr.write('Erreur : chemin du dépôt manquant.\n\n');
    process.stderr.write(HELP);
    process.exitCode = 1;
    return;
  }

  const target = resolve(targetArg);
  let isDirectory = false;
  try {
    isDirectory = statSync(target).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    process.stderr.write(`Erreur : répertoire introuvable : ${target}\n`);
    process.exitCode = 1;
    return;
  }

  const files = walk(target);
  const snapshot = {
    files,
    read: (path: string): string | null => {
      try {
        return readFileSync(join(target, path), 'utf8');
      } catch {
        return null;
      }
    },
  };

  const result = detect(snapshot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
