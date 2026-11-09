'use client'

import { useEvents } from '@/hooks/events-provider'
import { useToast } from '@/components/ui/toast'

/** Affiche une notification éphémère à chaque notification reçue en direct (monté une seule fois). */
export function NotificationToaster() {
  const { toast } = useToast()
  useEvents(['notification.created'], (event) => {
    const type = String(event.notificationType ?? '')
    toast({
      title: String(event.title ?? 'Nouvelle notification'),
      description: typeof event.body === 'string' ? event.body : undefined,
      href: typeof event.href === 'string' ? event.href : undefined,
      variant: type.endsWith('.failed') ? 'error' : type.endsWith('.succeeded') ? 'success' : 'info',
    })
  })
  return null
}
