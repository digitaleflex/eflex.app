'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound, Mail, Palette, ShieldCheck, TriangleAlert, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import {
  PASSPHRASE_HINT,
  validatePassphrase,
  validatePassphraseConfirmation,
} from '@/lib/auth-validation'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

interface AccountSettingsProps {
  user: { name: string; email: string }
  /** false pour un compte créé uniquement via Google (aucun mot de passe local). */
  hasPassword: boolean
  /** false sans Resend : le changement d'adresse ne peut pas aboutir. */
  emailEnabled: boolean
  /** Projets réellement déployés : ils doivent être supprimés avant le compte. */
  deployedProjectCount: number
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

function FeedbackMessage({ feedback, id }: { feedback: Feedback; id: string }) {
  if (!feedback) return null
  if (feedback.tone === 'success') {
    return (
      <p id={id} role="status" className="rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-foreground">
        {feedback.message}
      </p>
    )
  }
  return (
    <p id={id} role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
      {feedback.message}
    </p>
  )
}

export function AccountSettings({
  user,
  hasPassword,
  emailEnabled,
  deployedProjectCount,
}: AccountSettingsProps) {
  const router = useRouter()

  const [name, setName] = useState(user.name)
  const [savingName, setSavingName] = useState(false)
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null)

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setNameFeedback(null)
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameFeedback({ tone: 'error', message: 'Le nom ne peut pas être vide.' })
      return
    }
    setSavingName(true)
    try {
      const { error } = await authClient.updateUser({ name: trimmed })
      if (error) {
        setNameFeedback({ tone: 'error', message: authErrorMessage(error) })
        return
      }
      setNameFeedback({ tone: 'success', message: 'Nom mis à jour.' })
      router.refresh()
    } catch {
      setNameFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingName(false)
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordFeedback(null)
    const passphraseError = validatePassphrase(newPassword)
    if (passphraseError) {
      setPasswordFeedback({ tone: 'error', message: passphraseError })
      return
    }
    const confirmationError = validatePassphraseConfirmation(newPassword, confirmPassword)
    if (confirmationError) {
      setPasswordFeedback({ tone: 'error', message: confirmationError })
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (error) {
        setPasswordFeedback({ tone: 'error', message: authErrorMessage(error) })
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordFeedback({
        tone: 'success',
        message: 'Phrase secrète mise à jour. Les autres sessions ont été déconnectées.',
      })
    } catch {
      setPasswordFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingPassword(false)
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailFeedback(null)
    if (newEmail.trim() === '' || newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setEmailFeedback({ tone: 'error', message: 'Indiquez une adresse différente de celle du compte.' })
      return
    }
    setSavingEmail(true)
    try {
      const { error } = await authClient.changeEmail({
        newEmail: newEmail.trim(),
        callbackURL: '/dashboard/settings',
      })
      if (error) {
        setEmailFeedback({ tone: 'error', message: authErrorMessage(error) })
        return
      }
      setNewEmail('')
      setEmailFeedback({
        tone: 'success',
        message:
          'Un lien de vérification a été envoyé à la nouvelle adresse. Cliquez dessus pour confirmer le changement.',
      })
    } catch {
      setEmailFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingEmail(false)
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault()
    setDeleteError('')
    if (confirmText.trim().toUpperCase() !== 'SUPPRIMER') {
      setDeleteError('Saisissez SUPPRIMER pour confirmer.')
      return
    }
    if (hasPassword && deletePassword === '') {
      setDeleteError('Indiquez votre phrase secrète pour confirmer.')
      return
    }
    setDeleting(true)
    try {
      const { error } = await authClient.deleteUser({
        ...(hasPassword ? { password: deletePassword } : {}),
      })
      if (error) {
        setDeleteError(authErrorMessage(error))
        return
      }
      await authClient.signOut().catch(() => undefined)
      router.push('/')
      router.refresh()
    } catch {
      setDeleteError(NETWORK_ERROR)
    } finally {
      setDeleting(false)
    }
  }

  const deleteBlocked = deployedProjectCount > 0

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <User className="w-4 h-4" aria-hidden="true" />
            Profil
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Le nom affiché dans la console et dans les e-mails.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeedbackMessage feedback={nameFeedback} id="account-name-feedback" />
          <form onSubmit={saveName} className="space-y-4">
            <Input
              id="account-name"
              label="Nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              aria-invalid={nameFeedback?.tone === 'error' ? true : undefined}
              aria-describedby={nameFeedback?.tone === 'error' ? 'account-name-feedback' : undefined}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" loading={savingName} disabled={name.trim() === user.name}>
                Enregistrer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <Palette className="w-4 h-4" aria-hidden="true" />
            Apparence
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choisissez le thème de l’interface. « Système » suit le réglage de votre appareil.
          </p>
        </CardHeader>
        <CardContent>
          <ThemeSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            Phrase secrète (mot de passe)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {hasPassword
              ? 'Changez votre phrase secrète. Les autres sessions seront déconnectées.'
              : 'Vous vous connectez avec Google : ce compte n’a pas de phrase secrète EFLEX.'}
          </p>
        </CardHeader>
        <CardContent>
          {hasPassword ? (
            <form onSubmit={savePassword} className="space-y-4">
              <FeedbackMessage feedback={passwordFeedback} id="account-password-feedback" />
              <Input
                id="current-password"
                label="Phrase secrète actuelle (mot de passe)"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                aria-invalid={passwordFeedback?.tone === 'error' ? true : undefined}
                aria-describedby={passwordFeedback?.tone === 'error' ? 'account-password-feedback' : undefined}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="new-password"
                  label="Nouvelle phrase secrète (mot de passe)"
                  type="password"
                  autoComplete="new-password"
                  hint={PASSPHRASE_HINT}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={passwordFeedback?.tone === 'error' ? true : undefined}
                  aria-describedby={passwordFeedback?.tone === 'error' ? 'account-password-feedback' : undefined}
                  required
                />
                <Input
                  id="confirm-password"
                  label="Confirmer la phrase secrète"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={passwordFeedback?.tone === 'error' ? true : undefined}
                  aria-describedby={passwordFeedback?.tone === 'error' ? 'account-password-feedback' : undefined}
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={savingPassword}>
                  Mettre à jour la phrase secrète
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune phrase secrète à gérer : la connexion se fait via Google.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4" aria-hidden="true" />
            Adresse e-mail
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adresse actuelle : <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailEnabled ? (
            <>
              <FeedbackMessage feedback={emailFeedback} id="account-email-feedback" />
              <form onSubmit={saveEmail} className="space-y-4">
                <Input
                  id="new-email"
                  label="Nouvelle adresse"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  aria-invalid={emailFeedback?.tone === 'error' ? true : undefined}
                  aria-describedby={emailFeedback?.tone === 'error' ? 'account-email-feedback' : undefined}
                  required
                />
                <div className="flex justify-end">
                  <Button type="submit" variant="outline" loading={savingEmail}>
                    Envoyer le lien de vérification
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le changement d’adresse sera disponible dès que l’envoi d’e-mails sera configuré.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <h3 className="font-semibold flex items-center gap-2 text-destructive">
            <TriangleAlert className="w-4 h-4" aria-hidden="true" />
            Zone de danger
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            La suppression du compte est définitive : projets, déploiements et variables d’environnement
            sont effacés.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteBlocked ? (
            <div className="rounded-lg bg-warning/10 border border-warning/25 p-3 text-sm text-foreground space-y-2">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                Suppression impossible pour le moment
              </p>
              <p>
                {deployedProjectCount} projet{deployedProjectCount > 1 ? 's sont' : ' est'} encore déployé
                {deployedProjectCount > 1 ? 's' : ''}. Supprimez-les d’abord pour arrêter les applications
                correspondantes.
              </p>
              <Link href="/dashboard" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Gérer mes projets
              </Link>
            </div>
          ) : (
            <form onSubmit={deleteAccount} className="space-y-4">
              {deleteError && (
                <p id="account-delete-feedback" role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {deleteError}
                </p>
              )}
              <Input
                id="delete-confirm"
                label="Saisissez SUPPRIMER pour confirmer"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                aria-invalid={deleteError ? true : undefined}
                aria-describedby={deleteError ? 'account-delete-feedback' : undefined}
                required
              />
              {hasPassword && (
                <Input
                  id="delete-password"
                  label="Phrase secrète (mot de passe)"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  aria-invalid={deleteError ? true : undefined}
                  aria-describedby={deleteError ? 'account-delete-feedback' : undefined}
                  required
                />
              )}
              <div className="flex justify-end">
                <Button type="submit" variant="destructive" loading={deleting}>
                  Supprimer mon compte
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
