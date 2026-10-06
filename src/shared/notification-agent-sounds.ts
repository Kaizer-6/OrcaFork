import type { NotificationSettings } from './notification-settings-types'

export function getAgentNotificationSoundPath(
  settings: Pick<NotificationSettings, 'agentSoundPaths'>,
  agentType?: string
): string | null {
  const paths = settings.agentSoundPaths
  return agentType && paths && Object.hasOwn(paths, agentType) ? paths[agentType] || null : null
}

export function normalizeAgentNotificationSoundPaths(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([agentType, path]) =>
        agentType.trim().length > 0 && typeof path === 'string' && path.trim().length > 0
    )
  )
}
