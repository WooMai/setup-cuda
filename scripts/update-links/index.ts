import { readFileSync, writeFileSync } from 'node:fs'
import { gte, rcompare } from 'semver'
import {
  CUDA_ARCHIVE_URL,
  LINUX_LINKS_PATH,
  NVIDIA_BASE_URL,
  WINDOWS_LINKS_PATH
} from './constants.js'

// Floor below which we never auto-add. Every version this old is already in the
// JSON and uses irregular legacy installer naming (e.g. `win10`), so attempting
// to scrape it would only produce noise or false failures. New CUDA releases are
// always well above this.
const MIN_VERSION = '12.0.0'

interface WindowsLinksData {
  local: Record<string, string>
  network: Record<string, string>
}

interface LinuxLinksData {
  local: Record<string, string>
}

interface ArchiveEntry {
  version: string
  pageUrl: string
}

interface VersionLinks {
  version: string
  linuxLocal: string
  windowsLocal: string
  windowsNetwork: string
}

// Anchors on the archive page, e.g. <a href="/cuda-13-2-0-download-archive">CUDA Toolkit 13.2.0</a>
const ARCHIVE_ANCHOR_REGEX =
  /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*CUDA Toolkit\s+(\d+\.\d+\.\d+)/gi
// Linux x86_64 runfile (the `_linux.run` suffix excludes the `_linux_sbsa.run` ARM64 variant).
const LINUX_LOCAL_RUN_REGEX =
  /https:\/\/developer\.download\.nvidia\.com\/compute\/cuda\/[0-9.]+\/local_installers\/cuda_[0-9.]+_[0-9.]+_linux\.run/i
// Windows local installer. Kept loose so format drift (e.g. an added `_x86_64`) still matches.
const WINDOWS_LOCAL_EXE_REGEX =
  /https:\/\/developer\.download\.nvidia\.com\/compute\/cuda\/[0-9.]+\/local_installers\/cuda_[^"'\\<> ]*windows[^"'\\<> ]*\.exe/i
// Windows network installer. Matches both `_windows_network.exe` and the newer `_windows_x86_64_network.exe`.
const WINDOWS_NETWORK_EXE_REGEX =
  /https:\/\/developer\.download\.nvidia\.com\/compute\/cuda\/[0-9.]+\/network_installers\/cuda_[^"'\\<> ]*windows[^"'\\<> ]*network\.exe/i
const VERSION_FROM_URL_REGEX = /\/compute\/cuda\/(\d+\.\d+\.\d+)\//

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    )
  }
  return response.text()
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function parseArchive(html: string): ArchiveEntry[] {
  const entries = new Map<string, ArchiveEntry>()
  for (const match of html.matchAll(ARCHIVE_ANCHOR_REGEX)) {
    const href = match[1]
    const version = match[2]
    if (!entries.has(version)) {
      const pageUrl = href.startsWith('http')
        ? href
        : `${NVIDIA_BASE_URL}${href}`
      entries.set(version, { version, pageUrl })
    }
  }
  return [...entries.values()]
}

function extractUrl(
  html: string,
  regex: RegExp,
  label: string,
  pageUrl: string
): string {
  const match = regex.exec(html)
  if (match === null) {
    throw new Error(`Could not find ${label} installer URL on ${pageUrl}`)
  }
  return match[0]
}

async function fetchVersionLinks(pageUrl: string): Promise<VersionLinks> {
  const html = await fetchText(pageUrl)
  const linuxLocal = extractUrl(
    html,
    LINUX_LOCAL_RUN_REGEX,
    'Linux x86_64 runfile',
    pageUrl
  )
  const windowsLocal = extractUrl(
    html,
    WINDOWS_LOCAL_EXE_REGEX,
    'Windows local',
    pageUrl
  )
  const windowsNetwork = extractUrl(
    html,
    WINDOWS_NETWORK_EXE_REGEX,
    'Windows network',
    pageUrl
  )
  const versionMatch = VERSION_FROM_URL_REGEX.exec(linuxLocal)
  if (versionMatch === null) {
    throw new Error(`Could not derive version from URL ${linuxLocal}`)
  }
  return { version: versionMatch[1], linuxLocal, windowsLocal, windowsNetwork }
}

function sortDescending(map: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(map).sort(rcompare)) {
    sorted[key] = map[key]
  }
  return sorted
}

function writeIfChanged(path: string, data: unknown): boolean {
  const next = `${JSON.stringify(data, null, 2)}\n`
  if (next === readFileSync(path, 'utf8')) {
    return false
  }
  writeFileSync(path, next)
  return true
}

async function main(): Promise<void> {
  const windows = readJson<WindowsLinksData>(WINDOWS_LINKS_PATH)
  const linux = readJson<LinuxLinksData>(LINUX_LINKS_PATH)

  const archiveHtml = await fetchText(CUDA_ARCHIVE_URL)
  const archiveEntries = parseArchive(archiveHtml)
  console.log(`Archive lists ${archiveEntries.length} CUDA versions.`)

  // A version is "complete" only when present in every map we maintain.
  const isComplete = (version: string): boolean =>
    version in linux.local &&
    version in windows.local &&
    version in windows.network

  const missing = archiveEntries.filter(
    (entry) => gte(entry.version, MIN_VERSION) && !isComplete(entry.version)
  )
  if (missing.length === 0) {
    console.log('No new CUDA versions. Everything is up to date.')
    return
  }
  console.log(
    `New versions to add: ${missing.map((e) => e.version).join(', ')}`
  )

  for (const entry of missing) {
    const links = await fetchVersionLinks(entry.pageUrl)
    linux.local[links.version] = links.linuxLocal
    windows.local[links.version] = links.windowsLocal
    windows.network[links.version] = links.windowsNetwork
    console.log(`  + CUDA ${links.version}`)
  }

  linux.local = sortDescending(linux.local)
  windows.local = sortDescending(windows.local)
  windows.network = sortDescending(windows.network)

  const linuxChanged = writeIfChanged(LINUX_LINKS_PATH, linux)
  const windowsChanged = writeIfChanged(WINDOWS_LINKS_PATH, windows)
  console.log(`Updated linux-links.json: ${linuxChanged}`)
  console.log(`Updated windows-links.json: ${windowsChanged}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
