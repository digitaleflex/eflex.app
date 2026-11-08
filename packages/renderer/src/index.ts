export { RenderError } from './errors.js';
export { renderStack, renderStackDeterministic } from './render.js';
export { generateDockerfile } from './dockerfile.js';
export { traefikLabels } from './routing.js';
export { buildDeploymentArtifacts } from './deploy.js';
export type { DeploymentArtifacts, DeploymentContext } from './deploy.js';
export type { BuildPlan, ComposeDocument, ComposeOptions, ComposeService, RenderedStack, RenderContext } from './types.js';