import { describe, expect, it, vi } from 'vitest'
import { publishForkAssets } from './publish-fork-release.mjs'

const NAMES = ['orca-windows-setup.exe', 'orca-windows-setup.exe.blockmap', 'latest.yml']
function draft() {
  return {
    id: 1,
    draft: true,
    assets: [],
    upload_url: 'https://uploads.github.com/repos/Kaizer-6/OrcaFork/releases/1/assets{?name,label}'
  }
}
function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function options(fetchImpl) {
  return {
    tag: 'v1.4.215+fork.1',
    token: 'test-token',
    body: 'Tested fork release',
    fetchImpl,
    loadAsset: async () => new Blob(['installer'])
  }
}

describe('fork release publishing', () => {
  it('publishes only after every asset upload and completeness check succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(null, 404))
      .mockResolvedValueOnce(response(draft()))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response({ ...draft(), assets: NAMES.map((name) => ({ name, size: 9 })) })
      )
      .mockResolvedValueOnce(response({ id: 1, draft: false }))
    await publishForkAssets(options(fetchImpl))
    const calls = fetchImpl.mock.calls
    expect(JSON.parse(calls[1][1].body).draft).toBe(true)
    expect(calls.slice(2, 5).map(([url]) => new URL(url).searchParams.get('name'))).toEqual(NAMES)
    expect(calls[6][1].method).toBe('PATCH')
    expect(JSON.parse(calls[6][1].body).draft).toBe(false)
  })
  it('leaves a draft unpublished if an upload fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(draft()))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}, 500))
    await expect(publishForkAssets(options(fetchImpl))).rejects.toThrow('remains unpublished')
    expect(fetchImpl.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false)
  })
  it('does not publish a release that is missing an uploaded asset', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(draft()))
    await expect(publishForkAssets(options(fetchImpl))).rejects.toThrow('incomplete')
    expect(fetchImpl.mock.calls.some(([, init]) => init.method === 'PATCH')).toBe(false)
  })
  it('refuses replacing a published release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ ...draft(), draft: false }))
    await expect(publishForkAssets(options(fetchImpl))).rejects.toThrow('already-published')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('retries a draft by replacing its assets and handles GitHub 204 responses', async () => {
    const existing = { ...draft(), assets: [{ name: NAMES[0], id: 7 }] }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(existing))
      .mockResolvedValueOnce(response(null, 204))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(
        response({ ...draft(), assets: NAMES.map((name) => ({ name, size: 9 })) })
      )
      .mockResolvedValueOnce(response({ draft: false }))
    await publishForkAssets(options(fetchImpl))
    expect(fetchImpl.mock.calls[1][1].method).toBe('DELETE')
    expect(fetchImpl.mock.calls.at(-1)[1].method).toBe('PATCH')
  })
  it('does not send the token to a foreign upload host', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response({ ...draft(), upload_url: 'https://example.com/assets' }))
    await expect(publishForkAssets(options(fetchImpl))).rejects.toThrow(
      'Unexpected GitHub upload URL'
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
