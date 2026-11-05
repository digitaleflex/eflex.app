export const DEFAULT_NODE_MAJOR = 22;
export const DEFAULT_PHP_VERSION = '8.3';
export const DEFAULT_PYTHON_VERSION = '3.12';

export const SUPPORTED_PHP_VERSIONS = ['8.2', '8.3', '8.4'] as const;

/**
 * A constraint is considered pinned when it is an exact version such as
 * "20", "20.11" or "3.12.1" (operators and ranges are not pinned).
 */
export function isPinnedConstraint(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().replace(/^v/, '');
  return /^\d+(\.\d+){0,2}$/.test(trimmed);
}

/** Extract the first major version number from an engines.node constraint. */
export function parseNodeMajor(constraint: string | null | undefined): number | null {
  if (!constraint) return null;
  const match = constraint.match(/(\d{1,2})/);
  if (!match || !match[1]) return null;
  const major = Number.parseInt(match[1], 10);
  if (!Number.isInteger(major) || major < 1 || major > 99) return null;
  return major;
}

export interface ResolvedRuntime {
  runtime: string;
  version: string;
  pinned: boolean;
}

export function nodeRuntime(constraint: string | null | undefined): ResolvedRuntime {
  const major = parseNodeMajor(constraint) ?? DEFAULT_NODE_MAJOR;
  return {
    runtime: `node@${major}`,
    version: String(major),
    pinned: isPinnedConstraint(constraint),
  };
}

/**
 * Map a PHP constraint (^8.2, >=8.3, 8.4.*, ...) to the nearest supported
 * runtime among 8.2, 8.3 and 8.4. Defaults to 8.3.
 */
export function phpRuntime(constraint: string | null | undefined): ResolvedRuntime {
  const match = constraint ? constraint.match(/8\.(\d+)/) : null;
  let version: string = DEFAULT_PHP_VERSION;

  if (match && match[1]) {
    const minor = Number.parseInt(match[1], 10);
    version = SUPPORTED_PHP_VERSIONS.reduce<string>((best, candidate) => {
      const bestMinor = Number.parseInt(best.split('.')[1] ?? '0', 10);
      const candidateMinor = Number.parseInt(candidate.split('.')[1] ?? '0', 10);
      const bestDistance = Math.abs(bestMinor - minor);
      const candidateDistance = Math.abs(candidateMinor - minor);
      return candidateDistance < bestDistance ? candidate : best;
    }, SUPPORTED_PHP_VERSIONS[0]);
  }

  return {
    runtime: `php@${version}`,
    version,
    pinned: isPinnedConstraint(constraint),
  };
}

/** Extract "3.12" (or "3.9") from arbitrary text such as "python-3.12.1". */
export function parsePythonVersion(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/3\.(\d{1,2})/);
  if (!match || !match[1]) return null;
  const minor = Number.parseInt(match[1], 10);
  if (!Number.isInteger(minor) || minor < 0 || minor > 99) return null;
  return `3.${minor}`;
}

export interface PythonVersionSources {
  pythonVersionFile?: string | null;
  runtimeTxt?: string | null;
  requiresPython?: string | null;
}

/**
 * Priority: .python-version, then runtime.txt, then requires-python.
 * Defaults to 3.12.
 */
export function pythonRuntime(sources: PythonVersionSources): ResolvedRuntime {
  const candidates: Array<{ text: string; pinned: boolean }> = [];
  if (sources.pythonVersionFile) {
    candidates.push({ text: sources.pythonVersionFile, pinned: true });
  }
  if (sources.runtimeTxt) {
    candidates.push({ text: sources.runtimeTxt, pinned: true });
  }
  if (sources.requiresPython) {
    candidates.push({
      text: sources.requiresPython,
      pinned: isPinnedConstraint(sources.requiresPython),
    });
  }

  for (const candidate of candidates) {
    const version = parsePythonVersion(candidate.text);
    if (version) {
      return {
        runtime: `python@${version}`,
        version,
        pinned: candidate.pinned,
      };
    }
  }

  return {
    runtime: `python@${DEFAULT_PYTHON_VERSION}`,
    version: DEFAULT_PYTHON_VERSION,
    pinned: false,
  };
}

/** Read the PEP 621 `requires-python` value from a pyproject.toml text. */
export function extractRequiresPython(pyproject: string | null | undefined): string | null {
  if (!pyproject) return null;
  const match = pyproject.match(/requires-python\s*=\s*["']([^"']+)["']/);
  return match && match[1] ? match[1] : null;
}
