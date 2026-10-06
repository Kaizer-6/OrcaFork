import { describe, expect, it } from 'vitest'
import {
  assertForkMainBundle,
  assertForkManifest,
  assertForkPackageIdentity
} from './check-fork-release.mjs'

describe('fork package verification', () => {
  it('rejects a stale main bundle even if app-update.yml points to the fork', () => {
    const fork = 'const owner = "Kaizer-6", repo = "OrcaFork"; settings.agentSoundPaths'
    expect(() => assertForkMainBundle(fork)).not.toThrow()
    expect(() => assertForkMainBundle(fork.replaceAll('"', '`'))).not.toThrow()
    expect(() =>
      assertForkMainBundle(`${fork} https://github.com/stablyai/orca/releases/latest/download`)
    ).toThrow()
    expect(() => assertForkMainBundle('settings.agentSoundPaths')).toThrow()
    expect(() => assertForkMainBundle('"Kaizer-6"; "OrcaFork"')).toThrow()
  })
  it('rejects official feeds and signing identities on unsigned fork builds', () => {
    const fork = { provider: 'github', owner: 'Kaizer-6', repo: 'OrcaFork' }
    expect(() => assertForkPackageIdentity(fork, '1.4.215+fork.1')).not.toThrow()
    expect(() =>
      assertForkPackageIdentity({ ...fork, owner: 'stablyai' }, '1.4.215+fork.1')
    ).toThrow()
    expect(() =>
      assertForkPackageIdentity({ ...fork, publisherName: 'SignPath Foundation' }, '1.4.215+fork.1')
    ).toThrow()
    expect(() => assertForkPackageIdentity(fork, '1.4.215')).toThrow()
  })
  it('refuses stale versions, foreign installer URLs and mismatched installer bytes', () => {
    const manifest = {
      version: '1.4.215+fork.1',
      path: 'orca-windows-setup.exe',
      sha512: 'hash',
      files: [{ url: 'orca-windows-setup.exe', sha512: 'hash', size: 100 }]
    }
    expect(() => assertForkManifest(manifest, manifest.version, 100, 'hash')).not.toThrow()
    expect(() => assertForkManifest(manifest, '1.4.214', 100, 'hash')).toThrow()
    expect(() => assertForkManifest(manifest, manifest.version, 100, 'other-bytes')).toThrow()
    expect(() => assertForkManifest(manifest, manifest.version, 99, 'hash')).toThrow()
    manifest.files[0].url =
      'https://github.com/stablyai/orca/releases/latest/download/orca-windows-setup.exe'
    expect(() => assertForkManifest(manifest, manifest.version, 100, 'hash')).toThrow()
  })
})
