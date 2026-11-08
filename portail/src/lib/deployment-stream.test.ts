import { describe, expect, it } from 'vitest'
import { streamDeploymentLogs } from '@/lib/deployment-stream'

type Evt = { event: string; data: any; id?: string | number }
const logs = (...lines: string[]) => JSON.stringify(lines.map((output) => ({ output })))

/** Faux client : chaque appel renvoie l'étape suivante du scénario (la dernière se répète). */
function script(steps: Array<{ status: string; logs?: string; commit?: string } | Error>) {
  let i = 0
  return { calls: () => i, getDeployment: async () => { const s = steps[Math.min(i++, steps.length - 1)]!; if (s instanceof Error) throw s; return s } }
}
async function run(steps: Parameters<typeof script>[0], extra: Partial<Parameters<typeof streamDeploymentLogs>[0]> = {}) {
  const events: Evt[] = []
  const client = script(steps)
  const finished: unknown[] = []
  await streamDeploymentLogs({
    client,
    deployment: { status: 'building', coolifyBuildId: 'dep1', logsSummary: null },
    secrets: [],
    intervalMs: 1,
    send: (event, data, id) => events.push({ event, data, id }),
    signal: new AbortController().signal,
    onFinished: (r) => void finished.push(r),
    ...extra,
  })
  return { events, finished, client }
}
const lines = (events: Evt[]) => events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines.map((l: any) => l.text))

describe('streamDeploymentLogs', () => {
  it('n’envoie que les lignes nouvelles à chaque passage, puis termine à l’état final', async () => {
    const { events, finished } = await run([
      { status: 'in_progress', logs: logs('Clonage') },
      { status: 'in_progress', logs: logs('Clonage', 'Installation') },
      { status: 'in_progress', logs: logs('Clonage', 'Installation') },
      { status: 'finished', logs: logs('Clonage', 'Installation', 'Terminé'), commit: 'abc1234' },
    ])
    expect(lines(events)).toEqual(['Clonage', 'Installation', 'Terminé'])
    expect(events.filter((e) => e.event === 'status').map((e) => e.data.status)).toEqual(['building', 'live'])
    expect(events.at(-1)).toMatchObject({ event: 'end', data: { reason: 'complete' } })
    expect(finished).toEqual([{ status: 'live', commitSha: 'abc1234' }])
  })

  it('reprend après une coupure à partir du rang demandé (Last-Event-ID)', async () => {
    const { events } = await run([{ status: 'finished', logs: logs('a', 'b', 'c', 'd') }], { from: 2 })
    expect(lines(events)).toEqual(['c', 'd'])
    expect(events.find((e) => e.event === 'log')!.id).toBe(3)
  })

  it('masque les secrets avant l’envoi', async () => {
    const { events } = await run([{ status: 'finished', logs: logs('DATABASE_URL=postgres://u:s3cretPass@h/db', 'ok') }], { secrets: ['postgres://u:s3cretPass@h/db', 's3cretPass'] })
    expect(lines(events)).toEqual(['DATABASE_URL=***', 'ok'])
    expect(JSON.stringify(events)).not.toContain('s3cretPass')
  })

  it('résume l’échec pour le projet et le signale', async () => {
    const { finished } = await run([{ status: 'failed', logs: logs('npm ERR! build failed') }])
    expect(finished[0]).toMatchObject({ status: 'failed', logsSummary: expect.stringContaining('npm ERR!') })
  })

  it('tolère une panne passagère de Coolify puis reprend', async () => {
    const { events } = await run([new Error('502'), new Error('502'), { status: 'finished', logs: logs('ok') }])
    expect(events.filter((e) => e.event === 'warn')).toHaveLength(1) // un seul avertissement par épisode
    expect(lines(events)).toEqual(['ok'])
    expect(events.at(-1)).toMatchObject({ event: 'end', data: { reason: 'complete' } })
  })

  it('abandonne après trop d’échecs et rejoue le résumé enregistré', async () => {
    const { events } = await run([new Error('down')], {
      maxFailures: 3,
      deployment: { status: 'failed', coolifyBuildId: 'dep1', logsSummary: 'Dernière erreur connue' },
    })
    expect(lines(events)).toEqual(['Dernière erreur connue'])
    expect(events.at(-1)).toMatchObject({ event: 'end', data: { reason: 'unavailable' } })
  })

  it('sans déploiement Coolify, rejoue le résumé et termine', async () => {
    const { events, client } = await run([], { deployment: { status: 'failed', coolifyBuildId: null, logsSummary: 'Coolify non configuré' } })
    expect(client.calls()).toBe(0)
    expect(lines(events)).toEqual(['Coolify non configuré'])
    expect(events.find((e) => e.event === 'status')!.data.status).toBe('failed')
  })

  it('s’arrête dès que le client se déconnecte', async () => {
    const ctrl = new AbortController()
    const client = script([{ status: 'in_progress', logs: logs('a') }])
    const events: Evt[] = []
    const done = streamDeploymentLogs({
      client,
      deployment: { status: 'building', coolifyBuildId: 'd', logsSummary: null },
      secrets: [],
      intervalMs: 10_000,
      send: (event, data) => events.push({ event, data }),
      signal: ctrl.signal,
    })
    setTimeout(() => ctrl.abort(), 20)
    await done // ne reste pas bloqué dans l'attente de 10 s
    expect(events.some((e) => e.event === 'end')).toBe(false)
  })
})
