'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Check, Fingerprint, KeyRound, Laptop, Link2, ShieldCheck, ShieldOff, Smartphone, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import {
  PASSPHRASE_HINT,
  validatePassphrase,
  validatePassphraseConfirmation,
} from '@/lib/auth-validation'

interface SessionView {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string | Date
  expiresAt: string | Date
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Appareil inconnu'
  if (/iphone|ipad|android/i.test(userAgent)) return 'Mobile'
  if (/macintosh|windows|linux/i.test(userAgent)) return 'Ordinateur'
  return 'Navigateur'
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Double authentification TOTP, passkeys, comptes liés et sessions actives (Better Auth). */
export function SecuritySettings({
  hasPassword: initialHasPassword,
  twoFactorEnabled: initialTwoFactor,
  currentSessionToken,
  linkedAccounts,
  googleEnabled,
}: {
  hasPassword: boolean
  twoFactorEnabled: boolean
  currentSessionToken: string
  linkedAccounts: { id: string; providerId: string }[]
  googleEnabled: boolean
}) {
  const router = useRouter()
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const [enabled, setEnabled] = useState(initialTwoFactor)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState<{ totpURI: string; secret: string; backupCodes: string[]; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)

  const loadSessions = useCallback(async () => {
    try {
      const result = await authClient.listSessions()
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Sessions indisponibles.') })
        return
      }
      setSessions((result.data ?? []) as unknown as SessionView[])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  // Liste des passkeys enregistrées : rechargée après ajout ou suppression.
  const { data: passkeys, isPending: passkeysLoading, refetch: refetchPasskeys } = authClient.useListPasskeys()
  const [passkeyName, setPasskeyName] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [deletingPasskey, setDeletingPasskey] = useState<string | null>(null)

  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [newAccountPasswordConfirm, setNewAccountPasswordConfirm] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  async function addPasskey() {
    setPasskeyBusy(true)
    setFeedback(null)
    try {
      const result = await authClient.passkey.addPasskey({ name: passkeyName.trim() || undefined })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, "Impossible d'ajouter cette passkey.") })
        return
      }
      setPasskeyName('')
      setFeedback({ tone: 'success', message: 'Passkey ajoutée. Vous pouvez désormais vous connecter sans mot de passe.' })
      await refetchPasskeys()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function removePasskey(id: string) {
    setDeletingPasskey(id)
    setFeedback(null)
    try {
      const result = await authClient.passkey.deletePasskey({ id })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Passkey non supprimée.') })
        return
      }
      setFeedback({ tone: 'success', message: 'Passkey supprimée.' })
      await refetchPasskeys()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setDeletingPasskey(null)
    }
  }

  async function linkGoogle() {
    setFeedback(null)
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: '/dashboard/settings' })
      if (result?.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Impossible de lier Google pour le moment.') })
      }
      // En cas de succès, le navigateur est redirigé vers Google.
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    }
  }

  async function unlink(accountId: string) {
    setUnlinking(accountId)
    setFeedback(null)
    try {
      const result = await authClient.unlinkAccount({ accountId })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Impossible de retirer ce moyen de connexion.') })
        return
      }
      setFeedback({ tone: 'success', message: 'Moyen de connexion retiré.' })
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setUnlinking(null)
    }
  }

  async function definePassword(e: React.FormEvent) {
    e.preventDefault()
    const passphraseError = validatePassphrase(newAccountPassword)
    if (passphraseError) {
      setFeedback({ tone: 'error', message: passphraseError })
      return
    }
    const confirmationError = validatePassphraseConfirmation(newAccountPassword, newAccountPasswordConfirm)
    if (confirmationError) {
      setFeedback({ tone: 'error', message: confirmationError })
      return
    }
    setPasswordBusy(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: newAccountPassword }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error ?? 'Impossible de définir la phrase secrète.' })
        return
      }
      setHasPassword(true)
      setNewAccountPassword('')
      setNewAccountPasswordConfirm('')
      setFeedback({ tone: 'success', message: 'Phrase secrète définie. Vous pouvez aussi vous connecter avec votre adresse e-mail.' })
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setPasswordBusy(false)
    }
  }

  async function enable() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await authClient.twoFactor.enable({
        ...(hasPassword ? { password } : {}),
        method: 'totp',
        issuer: 'Eflex',
      })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Impossible d’activer la 2FA.') })
        return
      }
      const data = result.data as { totpURI?: string; backupCodes?: string[] } | null
      if (!data?.totpURI || !data.backupCodes) {
        setFeedback({ tone: 'error', message: 'Réponse 2FA incomplète.' })
        return
      }
      const secret = new URL(data.totpURI).searchParams.get('secret') ?? ''
      const qr = await QRCode.toDataURL(data.totpURI, { width: 220, margin: 1 })
      setSetup({ totpURI: data.totpURI, secret, backupCodes: data.backupCodes, qr })
      setPassword('')
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Code incorrect.') })
        return
      }
      setEnabled(true)
      setSetup(null)
      setCode('')
      setFeedback({ tone: 'success', message: 'Double authentification activée.' })
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await authClient.twoFactor.disable({ ...(hasPassword ? { password } : {}) })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Impossible de désactiver la 2FA.') })
        return
      }
      setEnabled(false)
      setPassword('')
      setFeedback({ tone: 'success', message: 'Double authentification désactivée.' })
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setBusy(false)
    }
  }

  async function revoke(token: string) {
    setRevoking(token)
    setFeedback(null)
    try {
      const result = await authClient.revokeSession({ token })
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Session non révoquée.') })
        return
      }
      setFeedback({ tone: 'success', message: 'Session révoquée.' })
      await loadSessions()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setRevoking(null)
    }
  }

  async function revokeOthers() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await authClient.revokeOtherSessions()
      if (result.error) {
        setFeedback({ tone: 'error', message: authErrorMessage(result.error, 'Sessions non révoquées.') })
        return
      }
      setFeedback({ tone: 'success', message: 'Autres sessions déconnectées.' })
      setConfirmRevokeAll(false)
      await loadSessions()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setBusy(false)
    }
  }

  async function copyBackupCodes() {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.backupCodes.join('\n'))
      setFeedback({ tone: 'success', message: 'Codes de secours copiés.' })
    } catch {
      setFeedback({ tone: 'error', message: 'Copie impossible dans ce navigateur.' })
    }
  }

  const googleAccount = linkedAccounts.find((account) => account.providerId === 'google')
  const passkeyCount = passkeys?.length ?? 0

  return (
    <div className="space-y-6">
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

      <section aria-labelledby="passkeys-title" className="space-y-3">
        <div>
          <h3 id="passkeys-title" className="flex items-center gap-2 text-sm font-semibold">
            <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Passkeys
            <span className="text-xs font-medium text-muted-foreground">
              {passkeyCount > 0 ? `${passkeyCount} enregistrée${passkeyCount > 1 ? 's' : ''}` : 'Aucune'}
            </span>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Connectez-vous sans mot de passe avec l’empreinte, la reconnaissance faciale ou une clé de sécurité (WebAuthn).
            Une passkey reste liée à l’appareil qui l’a créée.
          </p>
        </div>

        {passkeysLoading ? (
          <p className="text-sm text-muted-foreground">Chargement des passkeys…</p>
        ) : passkeyCount > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(passkeys ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name || 'Passkey'}</p>
                  <p className="text-xs text-muted-foreground">
                    Ajoutée le {dateTime.format(new Date(item.createdAt))}
                    {item.backedUp ? ' · sauvegardée par votre gestionnaire de mots de passe' : ' · liée à cet appareil'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={deletingPasskey === item.id}
                  onClick={() => void removePasskey(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Supprimer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            Aucune passkey pour le moment. Ajoutez-en une pour vous connecter sans saisir de mot de passe.
          </p>
        )}

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
          <Input
            id="passkey-name"
            label="Nom (facultatif)"
            placeholder="MacBook, iPhone, clé YubiKey…"
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            maxLength={60}
          />
          <Button type="button" loading={passkeyBusy} onClick={() => void addPasskey()}>
            <Fingerprint className="h-4 w-4" aria-hidden="true" />
            Ajouter une passkey
          </Button>
        </div>
      </section>

      <section aria-labelledby="two-factor-title" className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="two-factor-title" className="flex items-center gap-2 text-sm font-semibold">
              {enabled ? <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              Double authentification (TOTP)
              <span className={enabled ? 'text-xs font-medium text-success' : 'text-xs font-medium text-muted-foreground'}>
                {enabled ? 'Activée' : 'Désactivée'}
              </span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Un code à 6 chiffres généré par votre application d’authentification (Google Authenticator, Aegis, 1Password…).
            </p>
          </div>
        </div>

        {!enabled && !setup && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            {hasPassword && (
              <Input
                id="two-factor-password"
                label="Phrase secrète actuelle (mot de passe)"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="Requis pour activer la double authentification."
              />
            )}
            <Button type="button" loading={busy} onClick={() => void enable()}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Activer la 2FA
            </Button>
          </div>
        )}

        {setup && (
          <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code de configuration TOTP" width={220} height={220} className="rounded-lg border border-border bg-white p-2" />
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Scannez le QR code, ou saisissez ce secret dans votre application :
              </p>
              <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs">{setup.secret}</code>
              <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
                <p className="text-xs font-medium text-warning">Codes de secours (à conserver hors ligne)</p>
                <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
                  {setup.backupCodes.map((backup) => <span key={backup}>{backup}</span>)}
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void copyBackupCodes()}>
                  Copier les codes
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  id="two-factor-code"
                  label="Code à 6 chiffres"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <Button type="button" loading={busy} onClick={() => void verify()}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Vérifier et activer
                </Button>
              </div>
            </div>
          </div>
        )}

        {enabled && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm text-muted-foreground">La 2FA protège votre compte même si votre phrase secrète est compromise.</p>
            {hasPassword && (
              <Input
                id="two-factor-disable-password"
                label="Phrase secrète actuelle pour désactiver"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            <Button type="button" variant="outline" loading={busy} onClick={() => void disable()}>
              Désactiver la 2FA
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="linked-accounts-title" className="space-y-3 border-t border-border pt-5">
        <div>
          <h3 id="linked-accounts-title" className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Moyens de connexion
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Associez Google et une phrase secrète à la même identité : vous choisissez la méthode à chaque connexion.
          </p>
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Adresse e-mail et phrase secrète</p>
              <p className="text-xs text-muted-foreground">
                {hasPassword ? 'Phrase secrète définie.' : 'Aucune phrase secrète : vous vous connectez uniquement avec Google.'}
              </p>
            </div>
            {hasPassword ? (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Actif</span>
            ) : (
              <span className="text-xs text-muted-foreground">Non configuré</span>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 9.99 1 12.48 1 15.23c0 2.74 1.02 5.24 2.81 7.07z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.31l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {googleAccount
                  ? 'Compte Google associé. Vous pouvez vous connecter avec le bouton Google.'
                  : googleEnabled
                    ? 'Aucun compte Google associé.'
                    : 'La connexion Google n’est pas configurée sur cette instance.'}
              </p>
            </div>
            {googleAccount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={unlinking === googleAccount.id}
                disabled={!hasPassword && passkeyCount === 0}
                title={!hasPassword && passkeyCount === 0 ? 'Définissez une phrase secrète ou ajoutez une passkey avant de retirer Google.' : undefined}
                onClick={() => void unlink(googleAccount.id)}
              >
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                Retirer
              </Button>
            ) : googleEnabled ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void linkGoogle()}>
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Lier Google
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Indisponible</span>
            )}
          </li>
          {(passkeys ?? []).length > 0 && (
            <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Passkeys</p>
                <p className="text-xs text-muted-foreground">
                  {passkeyCount} passkey{passkeyCount > 1 ? 's' : ''} enregistrée{passkeyCount > 1 ? 's' : ''}.
                </p>
              </div>
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Actif</span>
            </li>
          )}
        </ul>

        {!hasPassword && (
          <form onSubmit={definePassword} className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Définir une phrase secrète</p>
              <p className="text-xs text-muted-foreground">
                Utile si vous perdez l’accès à votre compte Google. Vous pourrez vous connecter avec votre adresse e-mail.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="set-account-password"
                label="Nouvelle phrase secrète (mot de passe)"
                type="password"
                autoComplete="new-password"
                hint={PASSPHRASE_HINT}
                value={newAccountPassword}
                onChange={(e) => setNewAccountPassword(e.target.value)}
                required
              />
              <Input
                id="set-account-password-confirm"
                label="Confirmer la phrase secrète"
                type="password"
                autoComplete="new-password"
                value={newAccountPasswordConfirm}
                onChange={(e) => setNewAccountPasswordConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" loading={passwordBusy}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Définir la phrase secrète
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby="sessions-title" className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="sessions-title" className="text-sm font-semibold">Sessions actives</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Appareils connectés à votre compte. Révoquez ceux que vous ne reconnaissez pas.
            </p>
          </div>
          {sessions.length > 1 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRevokeAll(true)}>
              Déconnecter les autres
            </Button>
          )}
        </div>

        {sessionsLoading ? (
          <p className="text-sm text-muted-foreground">Chargement des sessions…</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sessions.map((session) => {
              const current = session.token === currentSessionToken
              const mobile = /iphone|ipad|android/i.test(session.userAgent ?? '')
              return (
                <li key={session.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  {mobile ? <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <Laptop className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {deviceLabel(session.userAgent)}
                      {current && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Cet appareil</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.ipAddress ?? 'IP inconnue'} · connecté le {dateTime.format(new Date(session.createdAt))} · expire le {dateTime.format(new Date(session.expiresAt))}
                    </p>
                  </div>
                  {!current && (
                    <Button type="button" variant="ghost" size="sm" loading={revoking === session.token} onClick={() => void revoke(session.token)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Révoquer
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmRevokeAll}
        title="Déconnecter les autres sessions ?"
        description="Tous les autres appareils devront se reconnecter. Votre session actuelle est conservée."
        confirmLabel="Déconnecter les autres"
        destructive
        onConfirm={revokeOthers}
        onCancel={() => setConfirmRevokeAll(false)}
      />
    </div>
  )
}
