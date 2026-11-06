/**
 * Generates an env template file from a map of runtime secrets.
 * The keys appear in the output with empty values.
 * Secrets must NEVER appear in the compose YAML in plain text.
 */
export function generateEnvTemplate(env: Record<string, string>): string {
  return Object.keys(env)
    .sort()
    .map((key) => `${key}=`)
    .join('\n') + '\n';
}