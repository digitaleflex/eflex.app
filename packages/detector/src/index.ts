export * from './types.js';
export {
  detect,
  normalizeFiles,
  normalizePath,
  isIgnoredPath,
  IGNORED_SEGMENTS,
} from './detect.js';
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
