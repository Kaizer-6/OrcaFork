import { useState } from 'react'
import { toast } from 'sonner'
import type { NotificationSettings } from '../../../../shared/notification-settings-types'
import { getAgentNotificationSoundPath } from '../../../../shared/notification-agent-sounds'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type AgentNotificationSoundSectionProps = {
  notificationSettings: NotificationSettings
  volume: number
  onUpdateNotificationSettings: (updates: Partial<NotificationSettings>) => Promise<void>
}

export function AgentNotificationSoundSection({
  notificationSettings,
  volume,
  onUpdateNotificationSettings
}: AgentNotificationSoundSectionProps): React.JSX.Element {
  const [agentType, setAgentType] = useState('claude')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()
  const path = getAgentNotificationSoundPath(notificationSettings, agentType)
  const disabled = busy || !notificationSettings.enabled || !notificationSettings.agentTaskComplete

  const preview = async (): Promise<void> => {
    const result = await window.api.notifications.playSound({ agentType, force: true, volume })
    if (!result.played) {
      toast.error(
        translate(
          'auto.components.settings.NotificationsPane.0fadad17ce',
          'Notification sound could not be played'
        )
      )
    }
  }

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } catch {
      toast.error(
        translate(
          'settings.agentNotificationSounds.error',
          'Could not update or play the agent sound.'
        )
      )
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }

  const chooseFile = async (): Promise<void> => {
    const soundPath = await window.api.shell.pickAudio()
    if (!soundPath) {
      return
    }
    await onUpdateNotificationSettings({
      agentSoundPaths: { ...notificationSettings.agentSoundPaths, [agentType]: soundPath }
    })
    await preview()
  }

  const reset = async (): Promise<void> => {
    const paths = { ...notificationSettings.agentSoundPaths }
    delete paths[agentType]
    await onUpdateNotificationSettings({ agentSoundPaths: paths })
  }

  return (
    <section className="space-y-3 py-2">
      <div className="space-y-1">
        <Label htmlFor="notification-sound-agent">
          {translate('settings.agentNotificationSounds.title', 'Agent Completion Sounds')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.agentNotificationSounds.description',
            'Choose a sound file for each agent. Unassigned agents use the notification sound above.'
          )}
        </p>
      </div>
      <Select value={agentType} onValueChange={setAgentType} disabled={disabled}>
        <SelectTrigger id="notification-sound-agent" size="sm" className="w-full max-w-[360px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {getAgentCatalog().map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="truncate font-mono text-[11px] text-muted-foreground" title={path ?? undefined}>
        {path ??
          translate('settings.agentNotificationSounds.default', 'Using default notification sound')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => void runAction(chooseFile)}
        >
          {translate('auto.components.settings.NotificationsPane.6e6df3a09a', 'Choose Custom File')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !path}
          onClick={() => void runAction(preview)}
        >
          {translate('settings.agentNotificationSounds.preview', 'Preview')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !path}
          onClick={() => void runAction(reset)}
        >
          {translate('settings.agentNotificationSounds.reset', 'Use Default')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'settings.agentNotificationSounds.formats',
          'MP3, WAV, OGG, M4A, AAC or FLAC, up to 10 MB. Uses the notification volume and focus settings.'
        )}
      </p>
    </section>
  )
}
