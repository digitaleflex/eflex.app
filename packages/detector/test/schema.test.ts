import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { detect } from '../src/index.js';
import { allFixtures } from './fixtures.js';

const schemaPath = fileURLToPath(new URL('../../../schema/v1.json', import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

describe('schema v1', () => {
  it('validates every produced build plan and alternative', () => {
    for (const fixture of allFixtures()) {
      const result = detect(fixture.snapshot);

      if (result.plan) {
        expect(
          validate(result.plan),
          `${fixture.name}: ${ajv.errorsText(validate.errors)}`,
        ).toBe(true);
      }

      for (const alternative of result.alternatives) {
        expect(
          validate(alternative),
          `${fixture.name} (alternative): ${ajv.errorsText(validate.errors)}`,
        ).toBe(true);
      }
    }
  });

  it('rejects any plan containing a top-level env key', () => {
    expect(validate({ version: 1, env: { DATABASE_URL: 'postgres://secret' } })).toBe(false);
  });

  it('accepts a string map in buildEnv', () => {
    expect(
      validate({ version: 1, buildEnv: { PUBLIC_URL: 'https://example.com', FLAG: 'true' } }),
    ).toBe(true);
    expect(validate({ version: 1, buildEnv: { RETRIES: 3 } })).toBe(false);
  });
});
