import { describe, expect, it } from 'vitest'
import type { BuildPlan } from '@eflex/detector'
import { buildProjectArtifacts } from './deploy-plan'

const pythonPlan: BuildPlan = {
  version: 1,
  framework: 'python',
  runtime: 'python@3.12',
  root: '',
  port: 8000,
  install: 'pip install -r requirements.txt',
  start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
}

const dockerPlan: BuildPlan = {
  version: 1,
  framework: 'docker',
  runtime: 'docker@1',
  root: '',
  port: 3000,
}

describe('buildProjectArtifacts', () => {
  it('transmet le port réel du plan, pas 3000 par défaut', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.portsExposes).toBe(8000)
    expect(artifacts.buildPack).toBe('dockercompose')
    expect(artifacts.files['Dockerfile']).toContain('EXPOSE 8000')
  })

  it('ne génère aucun appel implicite à nixpacks', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.buildPack).not.toBe('nixpacks')
    expect(artifacts.compose).not.toMatch(/nixpacks/i)
  })

  it('framework docker : le Dockerfile du dépôt fait foi', () => {
    const artifacts = buildProjectArtifacts(dockerPlan, 'dock-proj')
    expect(artifacts.buildPack).toBe('dockerfile')
    expect(artifacts.dockerfile).toBeNull()
    expect(artifacts.compose).toBe('')
  })

  it('ne place jamais de secret dans les artefacts', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.compose).not.toMatch(/supersecret|API_KEY=/)
    expect(artifacts.files['Dockerfile'] ?? '').not.toMatch(/supersecret|API_KEY=/)
  })
})
