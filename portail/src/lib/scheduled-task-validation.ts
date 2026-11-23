/**
 * Validation côté serveur des tâches planifiées (issue #189) : rien n'est transmis tel quel à l'hébergement.
 * La commande s'exécute dans le conteneur du client ; on borne donc surtout la forme (une seule ligne,
 * pas de caractère de contrôle) et l'expression de planification.
 */
const ALIASES = new Set(['@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'])
const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // heure
  [1, 31], // jour du mois
  [1, 12], // mois
  [0, 7], // jour de semaine
]
const NAMES = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)$/i
const CONTROL = /[\u0000-\u001f\u007f]/

function validField(field: string, [min, max]: [number, number]): boolean {
  return field.split(',').every((part) => {
    const [range, step, extra] = part.split('/')
    if (extra !== undefined || range === undefined || range === '') return false
    if (step !== undefined && !/^[1-9]\d{0,2}$/.test(step)) return false
    if (range === '*') return true
    return range.split('-').every((value, _, parts) => {
      if (parts.length > 2) return false
      if (NAMES.test(value)) return true
      if (!/^\d{1,2}$/.test(value)) return false
      const n = Number(value)
      return n >= min && n <= max
    })
  })
}

export function validateCronExpression(raw: string): boolean {
  const value = raw.trim()
  if (ALIASES.has(value.toLowerCase())) return true
  const fields = value.split(/\s+/)
  return fields.length === 5 && fields.every((field, index) => validField(field, FIELD_RANGES[index]!))
}

export function validateTaskCommand(raw: string): boolean {
  const value = raw.trim()
  return value.length > 0 && value.length <= 4000 && !CONTROL.test(value)
}

export function validateContainerName(raw: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(raw.trim())
}

export function validateTaskName(raw: string): boolean {
  const value = raw.trim()
  return value.length > 0 && value.length <= 120 && !CONTROL.test(value)
}
