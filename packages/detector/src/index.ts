export * from './types.js';
export {
  detect,
  detectApplication,
  normalizeFiles,
  normalizePath,
  isIgnoredPath,
  IGNORED_SEGMENTS,
} from './detect.js';
export { walkRepository } from './walk.js';
export {
  BASE_CONFIDENCE,
  clampConfidence,
  roundTwo,
  scoreConfidence,
} from './confidence.js';
export {
  nodeRuntime,
  phpRuntime,
  pythonRuntime,
  parseNodeMajor,
  parsePythonVersion,
} from './versions.js';
