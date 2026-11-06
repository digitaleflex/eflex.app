import type { ComposeService } from './types.js';

export function defaultResources(cpu?: number, memoryMb?: number): {
  cpus: string;
  memory: string;
} {
  return {
    cpus: String(cpu ?? 1.0),
    memory: `${memoryMb ?? 512}M`,
  };
}

export function defaultDeploy(cpu?: number, memoryMb?: number, replicas?: number): ComposeService['deploy'] {
  const resources = defaultResources(cpu, memoryMb);
  const result: NonNullable<ComposeService['deploy']> = {
    resources: { limits: resources },
  };
  if (replicas && replicas > 1) {
    result.replicas = replicas;
  }
  return result;
}

export function defaultLogging(): ComposeService['logging'] {
  return {
    driver: 'json-file',
    options: {
      'max-size': '10m',
      'max-file': '3',
    },
  };
}