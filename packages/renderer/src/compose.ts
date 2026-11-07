import { stringify } from 'yaml';

import type { ComposeDocument, ComposeOptions, ComposeService } from './types.js';
import { defaultDeploy, defaultLogging } from './resources.js';
import { traefikLabels } from './routing.js';

export function newCompose(name: string): ComposeDocument {
  return {
    name,
    services: {},
    networks: {
      proxy: { external: true },
      internal: {},
    },
  };
}

function baseService(cpu?: number, memoryMb?: number, replicas?: number): Pick<ComposeService, 'restart' | 'init' | 'security_opt' | 'deploy' | 'logging'> {
  return {
    restart: 'unless-stopped',
    init: true,
    security_opt: ['no-new-privileges:true'],
    deploy: defaultDeploy(cpu, memoryMb, replicas),
    logging: defaultLogging(),
  };
}

export function appService(
  projectId: string,
  image: string,
  port: number,
  opts: ComposeOptions,
  extra?: { command?: string; volumes?: string[]; healthcheck?: string },
): ComposeService {
  const network = opts.domain ? 'proxy' : '';
  const service: ComposeService = {
    ...baseService(opts.resources?.cpu, opts.resources?.memoryMb),
    image,
    expose: [port],
    networks: network ? [network, 'internal'] : ['internal'],
    environment: [], // runtime env refs injected separately
  };

  if (extra?.command) service.command = extra.command;
  if (extra?.volumes) service.volumes = extra.volumes;
  if (extra?.healthcheck) {
    service.healthcheck = {
      test: ['CMD', 'curl', '-f', `http://localhost:${port}${extra.healthcheck}`],
      interval: '30s',
      retries: 3,
    };
  }

  if (opts.domain) {
    const svcName = extra?.command ? 'queue' : 'app';
    service.labels = traefikLabels(projectId, svcName, opts.domain, port, network, opts.traefik);
  }

  return service;
}

export function webService(
  projectId: string,
  port: number,
  opts: ComposeOptions,
  extra?: { image?: string; volumes?: string[]; dependsOn?: string[] },
): ComposeService {
  const network = opts.domain ? 'proxy' : '';
  const service: ComposeService = {
    ...baseService(),
    image: extra?.image ?? 'nginx:1.27-alpine',
    expose: [port],
    networks: network ? [network, 'internal'] : ['internal'],
    volumes: extra?.volumes ?? [],
  };

  if (extra?.dependsOn) service.depends_on = extra?.dependsOn;

  if (opts.domain) {
    service.labels = traefikLabels(projectId, 'web', opts.domain, port, network, opts.traefik);
    service.healthcheck = {
      test: ['CMD', 'curl', '-f', `http://localhost:${port}/`],
      interval: '30s',
      retries: 3,
    };
  }

  return service;
}

export function workerService(
  command: string,
  opts: ComposeOptions,
  extra?: { image?: string; replicas?: number; volumes?: string[] },
): ComposeService {
  return {
    ...baseService(opts.resources?.cpu, opts.resources?.memoryMb, extra?.replicas ?? 1),
    image: extra?.image ?? '${IMAGE}', // placeholder replaced by renderer
    command,
    networks: ['internal'],
    volumes: extra?.volumes ?? [],
  };
}

export function serializeCompose(doc: ComposeDocument): string {
  return stringify(doc, { lineWidth: 0 });
}