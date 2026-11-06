import type { BuildPlan } from '../../detector/src/types.js';

export interface RenderContext {
  projectId: string;
  image: string;
  domain?: string;
  env?: Record<string, string>;
  network?: string;
  traefik?: {
    entrypoint?: string;
    certResolver?: string;
    middlewares?: string[];
  };
  resources?: {
    cpu?: number;
    memoryMb?: number;
  };
  replicas?: Record<string, number>;
}

export interface RenderedStack {
  compose: string;
  files: Record<string, string>;
  envTemplate: string;
  metadata: {
    services: string[];
    ports: Record<string, number>;
    volumes: string[];
    warnings: string[];
  };
}

export interface ComposeOptions {
  projectId: string;
  network: string;
  resources?: { cpu?: number; memoryMb?: number };
  domain?: string;
  traefik?: { entrypoint?: string; certResolver?: string; middlewares?: string[] };
}

export interface ComposeService {
  image?: string;
  command?: string;
  expose?: number[];
  ports?: string[];
  depends_on?: string[];
  restart: string;
  init?: boolean;
  security_opt?: string[];
  environment?: string[];
  volumes?: string[];
  networks?: string[];
  labels?: string[];
  healthcheck?: {
    test: string[];
    interval: string;
    retries: number;
  };
  deploy?: {
    resources?: {
      limits?: {
        cpus: string;
        memory: string;
      };
    };
    replicas?: number;
  };
  logging: {
    driver: string;
    options: {
      'max-size': string;
      'max-file': string;
    };
  };
}

export interface ComposeDocument {
  name: string;
  services: Record<string, ComposeService>;
  networks: Record<string, { external?: boolean }>;
  volumes?: Record<string, unknown>;
}

export type { BuildPlan };