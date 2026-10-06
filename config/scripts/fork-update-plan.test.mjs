import { describe, expect, it, vi } from 'vitest'
import { fetchForkUpdatePlan, planForkUpdate } from './fork-update-plan.mjs'

function release(tag = 'v1.4.215') {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{ name: 'latest.yml' }, { name: 'orca-windows-setup.exe' }]
  }
}

describe('fork update planning', () => {
  it('builds a ready upstream stable release with a distinct fork tag', () => {
    expect(planForkUpdate(release(), null, '1.4.214')).toEqual({
      needed: true,
      upstreamTag: 'v1.4.215',
      version: '1.4.215+fork.1',
      tag: 'v1.4.215+fork.1'
    })
  })
  it.each(['mobile-v0.1.0', 'v1.4.215-rc.1', 'bad;command'])('rejects %s', (tag) => {
    expect(() => planForkUpdate(release(tag), null)).toThrow('stable release')
  })
  it('waits for the Windows installer and manifest', () => {
    const upstream = release()
    upstream.assets.pop()
    expect(planForkUpdate(upstream, null).needed).toBe(false)
  })
  it('does not downgrade the source or an already-published fork', () => {
    expect(planForkUpdate(release(), null, '1.4.216').needed).toBe(false)
    expect(planForkUpdate(release(), release('v1.4.216+fork.1'), '1.4.214').needed).toBe(false)
  })
  it('skips published versions and permits retrying an incomplete draft', () => {
    const existing = release('v1.4.215+fork.1')
    expect(planForkUpdate(release(), existing).needed).toBe(false)
    existing.draft = true
    expect(planForkUpdate(release(), existing).needed).toBe(true)
  })
  it('checks only named release endpoints and permits a missing fork release', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => release() })
      .mockResolvedValue({ ok: false, status: 404 })
    expect((await fetchForkUpdatePlan('test-token', fetchImpl)).needed).toBe(true)
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.github.com/repos/stablyai/orca/releases/latest',
      'https://api.github.com/repos/Kaizer-6/OrcaFork/releases/latest',
      'https://api.github.com/repos/Kaizer-6/OrcaFork/releases/tags/v1.4.215%2Bfork.1'
    ])
  })
  it('treats API errors as failures instead of creating a duplicate release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    await expect(fetchForkUpdatePlan('test-token', fetchImpl)).rejects.toThrow('403')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
