'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

type Feedback = { tone: 'success' | 'error'; message: string } | null

export interface TransferTarget {
  id: string
  name: string
}

/** Transfert du projet vers une autre organisation dont l'utilisateur est owner/admin. */
export function ProjectTransfer({
  projectId,
  projectName,
  targets,
}: {
  projectId: string
  projectName: string
  targets: TransferTarget[]
}) {
  const router = useRouter()
  const selectId = useId()
  const hintId = `${selectId}-hint`

  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  if (targets.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Vous n’êtes propriétaire ou administrateur d’aucune autre organisation. Créez ou rejoignez une
        organisation avec ce rôle pour pouvoir y transférer ce projet.
      </p>
    )
  }

  const targetName = targets.find((target) => target.id === targetId)?.name ?? 'l’organisation de destination'

  async function transfer(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)

    if (!targetId) {
      setFeedback({ tone: 'error', message: 'Sélectionnez l’organisation de destination.' })
      return
    }
    if (confirmation.trim() !== projectName) {
      setFeedback({ tone: 'error', message: 'Saisissez le nom exact du projet pour confirmer le transfert.' })
      return
    }

    setBusy(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: data.error || 'Le projet n’a pas pu être transféré.',
        })
        return
      }

      // Le projet n'existe plus dans l'organisation active : on bascule sur la
      // destination pour que l'utilisateur le retrouve immédiatement. Si la bascule
      // échoue (réseau), on revient au tableau de bord plutôt que vers un 404.
      let switched = true
      try {
        const result = await authClient.organization.setActive({ organizationId: targetId })
        if (result && 'error' in result && result.error) switched = false
      } catch {
        switched = false
      }
      router.push(switched ? `/dashboard/projects/${projectId}` : '/dashboard')
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={transfer} className="space-y-5">
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={
            feedback.tone === 'error'
              ? 'rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground'
          }
        >
          {feedback.message}
        </p>
      )}

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-sm font-medium text-foreground">Organisation de destination</legend>
        <div className="space-y-1.5">
          <label htmlFor={selectId} className="block text-sm font-medium text-foreground">
            Transférer vers
          </label>
          <select
            id={selectId}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            aria-describedby={hintId}
            className="h-11 w-full cursor-pointer rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <p id={hintId} className="text-xs text-muted-foreground">
            Seules les organisations où vous êtes propriétaire ou administrateur apparaissent.
          </p>
        </div>
      </fieldset>

      <ul className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Facturation et quotas :</span> le projet compte
          désormais dans le quota de <span className="font-medium text-foreground">{targetName}</span> ; le
          quota de l’organisation actuelle est libéré.
        </li>
        <li>
          <span className="font-medium text-foreground">Accès :</span> les membres de l’organisation
          actuelle perdent l’accès au projet, ceux de la destination l’obtiennent. Vous devez être
          propriétaire ou administrateur des deux organisations.
        </li>
        <li>
          <span className="font-medium text-foreground">Ce qui suit le projet :</span> domaines, variables
          d’environnement chiffrées, bases de données et historique de déploiements. Le domaine EFLEX,
          l’identifiant technique et l’application hébergée ne changent pas.
        </li>
        <li>
          <span className="font-medium text-foreground">Déploiement en cours :</span> le transfert est
          refusé tant qu’un déploiement n’est pas terminé ou annulé.
        </li>
      </ul>

      <Input
        id="transfer-project-confirm"
        label={`Saisissez « ${projectName} » pour confirmer`}
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        autoComplete="off"
        disabled={busy}
        required
      />

      <div className="flex justify-end">
        <Button type="submit" variant="destructive" loading={busy}>
          Transférer le projet
        </Button>
      </div>
    </form>
  )
}
