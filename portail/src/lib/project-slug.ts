/** Slugs de projets : normalisation + unicité sans erreur 500 (issue 08). */
import { randomBytes } from 'node:crypto'

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
  return slug || 'projet'
}

/**
 * Le slug est unique pour toute la plateforme : si le nom est déjà pris
 * (même chez un autre utilisateur), on ajoute un suffixe aléatoire plutôt que
 * de laisser `prisma.project.create` lever une contrainte d'unicité.
 */
export async function uniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name)
  let candidate = base
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!(await exists(candidate))) return candidate
    candidate = `${base}-${randomBytes(2).toString('hex')}`
  }
  return `${base}-${randomBytes(4).toString('hex')}`
}
