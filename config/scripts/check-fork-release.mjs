import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractFile } from '@electron/asar'
import { parse } from 'yaml'
import { describeProcessFailure, runProcessSync } from './script-child-process.mjs'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
const fork = require('../../src/shared/fork-release-config.json')
const expectedRepo = `${fork.owner}/${fork.repo}`

export const FORK_SOUND_TESTS = [
  'src/main/ipc/notifications-custom-sound.test.ts',
  'src/main/persistence/applying-settings/notification-settings-normalization.test.ts',
  'src/preload/api/notification-sound-playback.test.ts',
  'src/renderer/src/attention/agent-attention-notification-delivery.test.ts',
  'src/renderer/src/components/settings/NotificationsPane.test.tsx',
  'src/renderer/src/components/settings/AgentNotificationSoundSection.test.tsx',
  'src/renderer/src/components/native-chat/structured-attention-dispatch.test.ts'
]

export function assertForkPackageIdentity(config, expectedVersion) {
  if (
    config.owner !== fork.owner ||
    config.repo !== fork.repo ||
    config.provider !== 'github' ||
    (fork.unsignedWindowsUpdates && config.publisherName != null)
  ) {
    throw new Error(`Packaged updater must use ${expectedRepo} with the fork signing policy.`)
  }
  if (!expectedVersion.endsWith(`+fork.${fork.revision}`)) {
    throw new Error('Package version must identify this fork revision.')
  }
}

export function assertForkManifest(manifest, version, installerSize, installerHash) {
  const file = manifest.files?.[0]
  if (
    manifest.version !== version ||
    manifest.files?.length !== 1 ||
    file?.url !== 'orca-windows-setup.exe' ||
    manifest.path !== 'orca-windows-setup.exe' ||
    file.size !== installerSize ||
    file.sha512 !== installerHash ||
    manifest.sha512 !== installerHash
  ) {
    throw new Error('Update manifest must reference this tested fork installer and its SHA-512.')
  }
}

export function assertForkMainBundle(source) {
  if (
    source.includes('https://github.com/stablyai/orca/releases/latest/download') ||
    !source.includes(fork.owner) ||
    !source.includes(fork.repo) ||
    !source.includes('agentSoundPaths')
  ) {
    throw new Error('Packaged main process must include the fork feed and per-agent sound feature.')
  }
}

export async function verifyForkPackage() {
  const resources = resolve(root, 'dist/win-unpacked/resources')
  const packageJson = JSON.parse(
    extractFile(resolve(resources, 'app.asar'), 'package.json').toString()
  )
  const configuration = parse(readFileSync(resolve(resources, 'app-update.yml'), 'utf8'))
  assertForkPackageIdentity(configuration, packageJson.version)
  assertForkMainBundle(
    extractFile(resolve(resources, 'app.asar'), normalize(packageJson.main)).toString()
  )
  if (process.env.FORK_VERSION && packageJson.version !== process.env.FORK_VERSION) {
    throw new Error(`Expected ${process.env.FORK_VERSION}, packaged ${packageJson.version}.`)
  }
  const installer = resolve(root, 'dist/orca-windows-setup.exe')
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(installer)) {
    hash.update(chunk)
  }
  const manifest = parse(readFileSync(resolve(root, 'dist/latest.yml'), 'utf8'))
  assertForkManifest(manifest, packageJson.version, statSync(installer).size, hash.digest('base64'))
  if (statSync(`${installer}.blockmap`).size === 0) {
    throw new Error('Installer blockmap is empty.')
  }
  console.log(`Verified ${expectedRepo} ${packageJson.version} and its Windows update manifest.`)
}

function verifyForkSource() {
  const config = require('../electron-builder.config.cjs')
  assertForkPackageIdentity(config.publish, config.extraMetadata.version)
  if (fork.unsignedWindowsUpdates && config.win.verifyUpdateCodeSignature !== false) {
    throw new Error('Unsigned fork updates must use the existing unsigned packaging policy.')
  }
  for (const file of FORK_SOUND_TESTS) {
    if (!existsSync(resolve(root, file))) {
      throw new Error(`Required sound-feature regression test is missing: ${file}`)
    }
  }
  const result = runProcessSync({
    program: process.execPath,
    args: [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'config/vitest.config.ts',
      '--maxWorkers=1',
      '--no-file-parallelism',
      ...FORK_SOUND_TESTS,
      'src/main/updater',
      'src/shared/release-channel.test.ts',
      'config/scripts/fork-update-plan.test.mjs',
      'config/scripts/check-fork-release.test.mjs',
      'config/scripts/publish-fork-release.test.mjs',
      'config/scripts/verify-dev-channel-packaging.test.mjs'
    ],
    cwd: root,
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 10 * 60_000,
    maxOutputBytes: 256 * 1024
  })
  console.log(result.stdout)
  if (result.code !== 0 || result.outputTruncated) {
    throw new Error(`Fork release checks failed: ${describeProcessFailure(result)}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve()
    .then(async () => {
      if (process.argv.includes('--source')) {
        verifyForkSource()
      } else if (process.argv.includes('--package')) {
        await verifyForkPackage()
      } else {
        throw new Error('Choose --source or --package.')
      }
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
