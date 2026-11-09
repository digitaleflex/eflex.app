/**
 * Parcours déterministe d'un dépôt local. Source unique de vérité pour les
 * segments ignorés : `isIgnoredPath` (donc `IGNORED_SEGMENTS`).
 *
 * Utilisé par le CLI du détecteur et par le renderer, qui avaient chacun leur
 * propre copie de la liste d'exclusions (issue 09).
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isIgnoredPath } from './detect.js';

/** Chemins relatifs POSIX, triés à chaque niveau (parcours profondeur d'abord). */
export function walkRepository(root: string): string[] {
  const files: string[] = [];

  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      if (isIgnoredPath(relativePath)) continue;

      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  visit(root);
  return files;
}
