import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { OPS_TOOL_IDS } from '@/lib/ops-tools'
import { installOpsTool, listOpsTools, rotateOpsPassword, setBeszelAgentKey } from '@/lib/ops-tools-install'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Outils d'exploitation (Uptime Kuma, Beszel, Dozzle) : installés ou non, et leur adresse. */
export async function GET() {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const result = await listOpsTools()
  if ('error' in result) return coolifyError(result.error)
  return NextResponse.json(result, noStore)
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('install'), tool: z.enum(OPS_TOOL_IDS) }),
  z.object({ action: z.literal('rotate'), tool: z.enum(OPS_TOOL_IDS) }),
  z.object({
    action: z.literal('agent-key'),
    tool: z.literal('metrics'),
    // Clé publique SSH du hub (« ssh-ed25519 AAAA… ») et jeton d'enregistrement de l'agent.
    key: z.string().trim().regex(/^ssh-ed25519 [A-Za-z0-9+/=]{40,200}$/, 'Clé publique invalide (ssh-ed25519 …).'),
    token: z.string().trim().regex(/^[A-Za-z0-9_-]{8,128}$/, 'Jeton invalide.'),
  }),
])

/**
 * `install` / `rotate` renvoient l'identifiant et le mot de passe d'accès **une seule fois** (jamais
 * stockés ni journalisés). `agent-key` relie l'agent Beszel du serveur au hub.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Action invalide.' }, { status: 400 })
  }
  const input = parsed.data
  const result =
    input.action === 'install'
      ? await installOpsTool(input.tool)
      : input.action === 'rotate'
        ? await rotateOpsPassword(input.tool)
        : await setBeszelAgentKey(input.key, input.token)
  if ('error' in result) {
    return result.status === 502 ? coolifyError(result.error) : NextResponse.json({ error: result.error }, { status: result.status })
  }
  await audit({
    actor: { id: guard.session.user.id, email: guard.session.user.email },
    action: `platform.ops-tool.${input.action}`,
    target: { type: 'ops_tool', id: input.tool },
    details: { tool: input.tool },
    request,
  })
  return NextResponse.json(result, { status: input.action === 'install' ? 201 : 200, ...noStore })
}
