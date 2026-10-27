import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { git } from './git'
import { settingsStore } from './store'
import { writeStarterVault } from './starter'
import { vault } from './vault'
import { DEFAULT_USER, REPO_PREFIX, repoNameFor, sanitizeUser } from '@shared/naming'

export { REPO_PREFIX, DEFAULT_USER, repoNameFor, sanitizeUser }

export function defaultVaultPath(name: string): string {
  return path.join(app.getPath('documents'), 'Slate Vaults', sanitizeUser(name) || 'User')
}

async function exists(target: string): Promise<boolean> {
  try {
    const stat = await fs.stat(target)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function isEmpty(target: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(target)
    return entries.filter((e) => e !== '.DS_Store').length === 0
  } catch {
    return true
  }
}

export interface ProvisionResult {
  ok: boolean
  status: 'opened' | 'cloned' | 'created' | 'error'
  message: string
  userName: string
  repoName: string
  path?: string
}

/**
 * Open, clone or create the private vault that belongs to `name`.
 * - existing local folder  → open it
 * - existing GitHub repo   → clone it
 * - otherwise              → create the folder, starter notes and a private repo
 */
export async function provisionUser(name: string, preferredPath?: string): Promise<ProvisionResult> {
  const safe = sanitizeUser(name)
  const userName = safe || DEFAULT_USER
  const repoName = repoNameFor(userName)
  if (!safe) {
    return { ok: false, status: 'error', message: 'Enter a valid user name.', userName, repoName }
  }

  const target = path.resolve(preferredPath?.trim() || defaultVaultPath(safe))
  const store = settingsStore()

  if (await exists(target)) {
    const gitDir = path.join(target, '.git')
    const hasGit = await fs
      .stat(gitDir)
      .then(() => true)
      .catch(() => false)

    if (hasGit || !(await isEmpty(target))) {
      if (!hasGit) {
        // Adopt an existing notes folder: give it a repository and remote if one exists.
        const g = git(target)
        await g.init()
      }
      vault().setRoot(target)
      store.addRecentVault(target)
      return {
        ok: true,
        status: 'opened',
        message: `Opened ${userName}’s vault.`,
        userName,
        repoName,
        path: target
      }
    }
  }

  await fs.mkdir(target, { recursive: true })
  const g = git(target)

  const owner = await g.ghLogin()
  if (!owner) {
    return {
      ok: false,
      status: 'error',
      message: 'GitHub CLI is not authenticated. Run "gh auth login" in Terminal, then try again.',
      userName,
      repoName
    }
  }

  const remote = await g.repoView(`${owner}/${repoName}`)
  if (remote.exists) {
    const clone = await g.clone(remote.url ?? `https://github.com/${owner}/${repoName}.git`, target)
    if (!clone.ok) {
      return { ok: false, status: 'error', message: clone.message, userName, repoName, path: target }
    }
    vault().setRoot(target)
    store.addRecentVault(target)
    return {
      ok: true,
      status: 'cloned',
      message: `Cloned ${userName}’s private vault from GitHub.`,
      userName,
      repoName,
      path: target
    }
  }

  await writeStarterVault(target)
  vault().setRoot(target)
  await g.init()
  const created = await g.createRepo(repoName)
  if (!created.ok) {
    vault().setRoot(target)
    store.addRecentVault(target)
    return {
      ok: false,
      status: 'error',
      message: created.message,
      userName,
      repoName,
      path: target
    }
  }
  store.addRecentVault(target)
  return {
    ok: true,
    status: 'created',
    message: `Created private repo ${repoName} for ${userName}.`,
    userName,
    repoName,
    path: target
  }
}
