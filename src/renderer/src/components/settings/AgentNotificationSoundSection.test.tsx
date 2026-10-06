// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AgentNotificationSoundSection } from './AgentNotificationSoundSection'
import { getDefaultNotificationSettings } from '../../../../shared/notification-settings-defaults'
import type { NotificationSettings } from '../../../../shared/notification-settings-types'

const { pickAudio, playSound, toastError } = vi.hoisted(() => ({
  pickAudio: vi.fn(),
  playSound: vi.fn(),
  toastError: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const saved = vi.fn()
function SoundSettings(): React.JSX.Element {
  const [notifications, setNotifications] = useState(getDefaultNotificationSettings())
  const update = async (changes: Partial<NotificationSettings>): Promise<void> => {
    saved(changes)
    setNotifications((current) => ({ ...current, ...changes }))
  }
  return (
    <AgentNotificationSoundSection
      notificationSettings={notifications}
      volume={40}
      onUpdateNotificationSettings={update}
    />
  )
}

describe('agent sound settings', () => {
  beforeEach(() => {
    saved.mockReset()
    toastError.mockReset()
    pickAudio.mockReset().mockResolvedValue('/sounds/claude.wav')
    playSound.mockReset().mockResolvedValue({ played: true })
    vi.stubGlobal('api', undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { shell: { pickAudio }, notifications: { playSound } }
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('selects, previews and resets the chosen agent without changing the other assignment', async () => {
    render(<SoundSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Custom File' }))
    await waitFor(() =>
      expect(playSound).toHaveBeenCalledWith({ agentType: 'claude', force: true, volume: 40 })
    )
    expect(saved).toHaveBeenLastCalledWith({ agentSoundPaths: { claude: '/sounds/claude.wav' } })
    await waitFor(() => expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false))
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: 'Codex' }))
    pickAudio.mockResolvedValue('/sounds/codex.mp3')
    fireEvent.click(screen.getByRole('button', { name: 'Choose Custom File' }))
    await waitFor(() =>
      expect(saved).toHaveBeenLastCalledWith({
        agentSoundPaths: { claude: '/sounds/claude.wav', codex: '/sounds/codex.mp3' }
      })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use Default' }).hasAttribute('disabled')).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use Default' }))
    await waitFor(() =>
      expect(saved).toHaveBeenLastCalledWith({ agentSoundPaths: { claude: '/sounds/claude.wav' } })
    )
  })

  it('leaves settings and playback alone when the file picker is cancelled', async () => {
    pickAudio.mockResolvedValue(null)
    render(<SoundSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Custom File' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Choose Custom File' }).hasAttribute('disabled')
      ).toBe(false)
    )
    expect(saved).not.toHaveBeenCalled()
    expect(playSound).not.toHaveBeenCalled()
  })
})
