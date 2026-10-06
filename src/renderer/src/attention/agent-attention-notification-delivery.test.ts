import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deliverAgentAttentionNotification } from './agent-attention-notification-delivery'
import { playDesktopNotificationSound } from '@/lib/desktop-notification-sound'

vi.mock('@/lib/desktop-notification-sound', () => ({
  playDesktopNotificationSound: vi.fn(async () => true)
}))
vi.mock('@/lib/blocked-notification-fallback', () => ({
  showBlockedNotificationFallbackToast: vi.fn()
}))

const dispatch = vi.fn()
const sound = {
  customSoundId: 'system',
  customSoundVolume: 30,
  agentSoundPaths: { claude: '/claude.wav', codex: '/codex.mp3' }
}

describe('agent completion sound delivery', () => {
  beforeEach(() => {
    vi.mocked(playDesktopNotificationSound).mockClear()
    dispatch.mockReset().mockResolvedValue({ delivered: true })
    vi.stubGlobal('window', { api: { notifications: { dispatch } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(['claude', 'codex'])('routes %s completion playback to that agent', async (agentType) => {
    deliverAgentAttentionNotification({ source: 'agent-task-complete', agentType }, sound)
    await Promise.resolve()
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('custom', 30, agentType)
  })

  it('uses the default for terminal bells even when the pane has an agent', async () => {
    deliverAgentAttentionNotification(
      { source: 'terminal-bell', agentType: 'claude' },
      { ...sound, customSoundId: 'ding' }
    )
    await Promise.resolve()
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('ding', 30, undefined)
  })

  it('does not play a sound when delivery is suppressed', async () => {
    dispatch.mockResolvedValue({ delivered: false, reason: 'suppressed-focus' })
    deliverAgentAttentionNotification({ source: 'agent-task-complete', agentType: 'codex' }, sound)
    await Promise.resolve()
    expect(playDesktopNotificationSound).not.toHaveBeenCalled()
  })
})
