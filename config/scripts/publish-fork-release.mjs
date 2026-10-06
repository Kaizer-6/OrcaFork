import { openAsBlob, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyForkPackage } from './check-fork-release.mjs'
import { FORK_REPO } from './fork-update-plan.mjs'
import { describeProcessFailure, runProcessSync } from './script-child-process.mjs'

const ASSETS = ['orca-windows-setup.exe', 'orca-windows-setup.exe.blockmap', 'latest.yml']

export async function publishForkAssets({
  tag,
  token,
  body,
  fetchImpl = fetch,
  loadAsset = openAsBlob
}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  }
  const api = `https://api.github.com/repos/${FORK_REPO}/releases`
  async function request(url, init = {}, allowMissing = false) {
    const result = await fetchImpl(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(10 * 60_000)
    })
    if (allowMissing && result.status === 404) {
      return null
    }
    if (!result.ok) {
      throw new Error(
        `Fork release request failed (${result.status}). The release remains unpublished.`
      )
    }
    return result.status === 204 ? null : result.json()
  }
  let release = await request(`${api}/tags/${encodeURIComponent(tag)}`, {}, true)
  if (release && !release.draft) {
    throw new Error('Refusing to replace an already-published fork release.')
  }
  if (!release) {
    release = await request(api, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: `OrcaFork ${tag}`,
        body,
        draft: true,
        prerelease: false
      })
    })
  }
  const upload = new URL(release.upload_url.split('{')[0])
  if (upload.origin !== 'https://uploads.github.com') {
    throw new Error('Unexpected GitHub upload URL.')
  }
  for (const name of ASSETS) {
    const existing = release.assets?.find((asset) => asset.name === name)
    if (existing) {
      await request(`${api}/assets/${existing.id}`, { method: 'DELETE' })
    }
    const file = await loadAsset(join('dist', name))
    upload.searchParams.set('name', name)
    await request(upload.href, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size) }
    })
  }
  const verified = await request(`${api}/${release.id}`)
  if (
    !ASSETS.every((name) => verified.assets?.some((asset) => asset.name === name && asset.size > 0))
  ) {
    throw new Error('Release assets are incomplete. The release remains a draft.')
  }
  return request(`${api}/${release.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ draft: false, prerelease: false, body, make_latest: 'true' })
  })
}

function command(program, args, env = process.env) {
  const result = runProcessSync({
    program,
    args,
    env,
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 128 * 1024
  })
  if (result.code !== 0 || result.outputTruncated) {
    throw new Error(`${program} failed: ${describeProcessFailure(result)}`)
  }
  return result.stdout.trim()
}

async function main() {
  const { GITHUB_REPOSITORY, FORK_TAG, FORK_VERSION, UPSTREAM_TAG, GH_TOKEN } = process.env
  if (GITHUB_REPOSITORY !== FORK_REPO || !GH_TOKEN || FORK_TAG !== `v${FORK_VERSION}`) {
    throw new Error('Invalid fork release environment.')
  }
  if (!/^v\d+\.\d+\.\d+\+fork\.\d+$/.test(FORK_TAG) || !/^v\d+\.\d+\.\d+$/.test(UPSTREAM_TAG)) {
    throw new Error('Invalid fork or upstream release tag.')
  }
  await verifyForkPackage()
  if (command('git', ['status', '--porcelain', '--untracked-files=no'])) {
    throw new Error('Tracked source changed after the tested build commit.')
  }
  const existing = command('git', ['ls-remote', '--tags', 'origin', `refs/tags/${FORK_TAG}`])
  if (existing) {
    const target = existing.split(/\s+/)[0]
    command('git', ['fetch', '--no-tags', 'origin', `refs/tags/${FORK_TAG}`])
    if (command('git', ['diff', '--name-only', target, 'HEAD'])) {
      throw new Error(
        'An existing fork tag points to different source. Increase the fork revision.'
      )
    }
  } else {
    command('git', ['tag', FORK_TAG])
    command('gh', ['auth', 'setup-git'])
    command('git', ['push', 'origin', `refs/tags/${FORK_TAG}`])
  }
  const body = [
    `Built from Orca ${UPSTREAM_TAG}, with per-agent completion sounds.`,
    '',
    'Merge, sound-feature tests, updater tests, typechecks and packaging checks passed.',
    'This Windows fork build is unsigned.',
    `Source commit: ${command('git', ['rev-parse', 'HEAD'])}`
  ].join('\n')
  writeFileSync(join('dist', 'fork-release-notes.md'), body)
  await publishForkAssets({ tag: FORK_TAG, token: GH_TOKEN, body })
  console.log(`Published https://github.com/${FORK_REPO}/releases/tag/${FORK_TAG}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
