import { describe, expect, it } from 'vitest'
import { diffRuntimeSnapshot, streamRuntimeLogs } from '@/lib/runtime-log-stream'
import type { LogLine } from '@/lib/log-lines'

const l = (n: number, text: string, ts?: string): LogLine => ({ n, text, ...(ts ? { ts } : {}) })
const snap = (...texts: string[]) => texts.map((text, i) => l(i, text))
const logsJson = (...texts: string[]) => JSON.stringify(texts.map((output) => ({ output })))

describe('diffRuntimeSnapshot', () => {
  it('émet tout le premier instantané', () => {
    const { fresh, globalBase } = diffRuntimeSnapshot(snap('a', 'b'), [], 0)
    expect(globalBase).toBe(0)
    expect(fresh.map((x) => [x.n, x.text])).toEqual([
      [0, 'a'],
      [1, 'b'],
    ])
  })

  it('n’émet que les nouvelles lignes quand la fenêtre glisse', () => {
    const previous = snap('a', 'b', 'c')
    const current = snap('b', 'c', 'd')
    const { fresh, globalBase } = diffRuntimeSnapshot(current, previous, 3)
    expect(globalBase).toBe(1)
    expect(fresh.map((x) => [x.n, x.text])).toEqual([[3, 'd']])
  })

  it('n’émet rien si l’instantané est identique', () => {
    const previous = snap('a', 'b')
    const { fresh } = diffRuntimeSnapshot(snap('a', 'b'), previous, 2)
    expect(fresh).toEqual([])
  })

  it('traite une rotation complète comme un nouvel instantané', () => {
    const previous = snap('a', 'b')
    const { fresh, globalBase } = diffRuntimeSnapshot(snap('x', 'y'), previous, 2)
    expect(globalBase).toBe(2)
    expect(fresh.map((x) => [x.n, x.text])).toEqual([
      [2, 'x'],
      [3, 'y'],
    ])
  })
})

type Evt = { event: string; data: any; id?: string | number }

function script(steps: Array<{ logs: string } | { error: string } | Error>) {
  let i = 0
  return {
    calls: () => i,
    getLogs: async () => {
      const s = steps[Math.min(i++, steps.length - 1)]!
      if (s instanceof Error) throw s
      return s
    },
  }
}

describe('streamRuntimeLogs', () => {
  it('diffuse les lignes nouvelles et masque les secrets', async () => {
    const client = script([
      { logs: logsJson('hello token=s3cret', 'world') },
      { logs: logsJson('world', 'next') },
    ])
    const events: Evt[] = []
    const ctrl = new AbortController()
    let polls = 0
    const original = client.getLogs.bind(client)
    client.getLogs = async (n, s) => {
      polls++
      if (polls >= 3) ctrl.abort()
      return original(n, s)
    }
    await streamRuntimeLogs({
      client,
      secrets: ['s3cret'],
      intervalMs: 1,
      send: (event, data, id) => events.push({ event, data, id }),
      signal: ctrl.signal,
    })
    const lines = events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines.map((l: any) => l.text))
    expect(lines).toEqual(['hello token=***', 'world', 'next'])
    expect(JSON.stringify(events)).not.toContain('s3cret')
  })

  it('borne le débit et avertit en cas de rafale', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `l${i}`)
    const client = script([{ logs: logsJson(...many) }])
    const events: Evt[] = []
    const ctrl = new AbortController()
    let polls = 0
    const original = client.getLogs.bind(client)
    client.getLogs = async (n, s) => {
      polls++
      if (polls >= 2) ctrl.abort()
      return original(n, s)
    }
    await streamRuntimeLogs({
      client,
      secrets: [],
      intervalMs: 1,
      maxLinesPerPoll: 5,
      send: (event, data, id) => events.push({ event, data, id }),
      signal: ctrl.signal,
    })
    const warn = events.find((e) => e.event === 'warn' && String(e.data.message).includes('Débit élevé'))
    expect(warn).toBeTruthy()
    const emitted = events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines)
    expect(emitted.length).toBe(5)
  })

  it('émet un avertissement prudent si une ligne ressemble à un secret', async () => {
    const client = script([{ logs: logsJson('authorization: Bearer abcdefghijklmnopqrstuvwxyz123456') }])
    const events: Evt[] = []
    const ctrl = new AbortController()
    let polls = 0
    const original = client.getLogs.bind(client)
    client.getLogs = async (n, s) => {
      polls++
      if (polls >= 2) ctrl.abort()
      return original(n, s)
    }
    await streamRuntimeLogs({
      client,
      secrets: [],
      intervalMs: 1,
      send: (event, data, id) => events.push({ event, data, id }),
      signal: ctrl.signal,
    })
    expect(events.some((e) => e.event === 'warn' && String(e.data.message).includes('ressemblent à des secrets'))).toBe(
      true,
    )
  })
})
