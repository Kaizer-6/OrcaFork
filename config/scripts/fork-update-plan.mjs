import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseDesktopStableTag } from './latest-stable-release.mjs'

const forkRelease = JSON.parse(
  readFileSync(new URL('../../src/shared/fork-release-config.json', import.meta.url), 'utf8')
)
const currentPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
)
const UPSTREAM_REPO = 'stablyai/orca'
export const FORK_REPO = `${forkRelease.owner}/${forkRelease.repo}`

function compareStableTags(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}

export function planForkUpdate(upstream, existing, minimumVersion = currentPackage.version) {
  const stable = parseDesktopStableTag(upstream?.tag_name ?? '')
  if (!stable || upstream.draft || upstream.prerelease) {
    throw new Error('Upstream latest release must be a published desktop stable release.')
  }
  const minimum = parseDesktopStableTag(`v${minimumVersion.split('+')[0]}`)
  if (!minimum || compareStableTags(stable, minimum) < 0) {
    return { needed: false, reason: 'Upstream release is older than the fork source.' }
  }
  const assets = new Set((upstream.assets ?? []).map((asset) => asset.name))
  if (!assets.has('latest.yml') || !assets.has('orca-windows-setup.exe')) {
    return { needed: false, reason: 'Upstream Windows release is still publishing.' }
  }
  const version = `${stable.tag.slice(1)}+fork.${forkRelease.revision}`
  const tag = `v${version}`
  const published =
    existing?.draft === false ? parseDesktopStableTag(existing.tag_name.split('+')[0]) : null
  if (published && compareStableTags(stable, published) < 0) {
    return { needed: false, reason: 'Refusing to publish an older fork release.' }
  }
  if (existing?.draft === false && existing.tag_name === tag) {
    return { needed: false, reason: 'This fork release is already published.' }
  }
  return { needed: true, upstreamTag: stable.tag, version, tag }
}

async function githubRelease(path, token, fetchImpl, allowMissing = false) {
  const response = await fetchImpl(`https://api.github.com/repos/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(15_000)
  })
  if (response.status === 404 && allowMissing) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Release lookup failed (${response.status}) for ${path}.`)
  }
  return response.json()
}

export async function fetchForkUpdatePlan(token, fetchImpl = fetch) {
  if (!token) {
    throw new Error('GH_TOKEN is required.')
  }
  const upstream = await githubRelease(`${UPSTREAM_REPO}/releases/latest`, token, fetchImpl)
  const candidate = planForkUpdate(upstream, null)
  if (!candidate.needed) {
    return candidate
  }
  const latest = await githubRelease(`${FORK_REPO}/releases/latest`, token, fetchImpl, true)
  const latestPlan = planForkUpdate(upstream, latest)
  if (!latestPlan.needed) {
    return latestPlan
  }
  const existing = await githubRelease(
    `${FORK_REPO}/releases/tags/${encodeURIComponent(candidate.tag)}`,
    token,
    fetchImpl,
    true
  )
  return planForkUpdate(upstream, existing)
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== FORK_REPO) {
    throw new Error(`This workflow only runs in ${FORK_REPO}.`)
  }
  const plan = await fetchForkUpdatePlan(process.env.GH_TOKEN)
  console.log(JSON.stringify(plan))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(plan)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('')
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
