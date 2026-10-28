import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CreateRepoResult, GitCommit, GitFileStatus, GitStatus, SyncResult } from '@shared/types'

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

const SEP = '\u0001'

function run(
  cmd: string,
  args: string[],
  cwd: string,
  opts: { timeout?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env }
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL')
        settled = true
        resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${opts.timeout ?? 120000}ms` })
      }
    }, opts.timeout ?? 120000)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: `${stderr}\n${err.message}` })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

class GitService {
  root: string

  constructor(root: string) {
    this.root = root
  }

  private git(args: string[], timeout?: number): Promise<RunResult> {
    return run('git', args, this.root, { timeout })
  }

  isRepo(): boolean {
    return fs.existsSync(path.join(this.root, '.git'))
  }

  private async ensureRepo(): Promise<void> {
    if (this.isRepo()) return
    await this.git(['init', '-b', 'main'])
    await this.git(['config', 'user.name', 'Slate'])
    await this.git(['config', 'user.email', 'slate@localhost'])
    const ignore = path.join(this.root, '.gitignore')
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '.DS_Store\n', 'utf8')
  }

  private async remote(): Promise<string | null> {
    const res = await this.git(['remote', 'get-url', 'origin'])
    return res.code === 0 ? res.stdout.trim() : null
  }

  private async branch(): Promise<string> {
    const res = await this.git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (res.code !== 0) return 'main'
    const branch = res.stdout.trim()
    return branch === 'HEAD' ? 'main' : branch
  }

  async status(): Promise<GitStatus> {
    const ghAvailable = (await run('gh', ['--version'], this.root, { timeout: 5000 })).code === 0
    if (!this.isRepo()) {
      return {
        isRepo: false,
        branch: 'main',
        remote: null,
        hasRemote: false,
        ahead: 0,
        behind: 0,
        changed: [],
        lastCommit: null,
        ghAvailable
      }
    }
    const branch = await this.branch()
    const remote = await this.remote()
    const statusRes = await this.git(['status', '--porcelain=v1'])
    const changed: GitFileStatus[] = []
    for (const line of statusRes.stdout.split('\n')) {
      if (!line.trim()) continue
      const code = line.slice(0, 2)
      const file = line.slice(3).trim()
      const clean = file.includes(' -> ') ? file.split(' -> ').pop()!.replace(/^"|"$/g, '') : file.replace(/^"|"$/g, '')
      changed.push({ path: clean, code, staged: code[0] !== ' ' && code[0] !== '?' })
    }
    let ahead = 0
    let behind = 0
    if (remote) {
      await this.git(['fetch', '--quiet', 'origin', branch], 30000)
      const counts = await this.git(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`])
      if (counts.code === 0) {
        const [b, a] = counts.stdout.trim().split(/\s+/)
        behind = Number(b) || 0
        ahead = Number(a) || 0
      }
    }
    const logRes = await this.git(['log', '-1', `--pretty=format:%H${SEP}%h${SEP}%aI${SEP}%s${SEP}%an`])
    let lastCommit: GitCommit | null = null
    if (logRes.code === 0 && logRes.stdout.trim()) {
      const [hash, shortHash, date, message, author] = logRes.stdout.split(SEP)
      lastCommit = { hash, shortHash, date, message, author }
    }
    return { isRepo: true, branch, remote, hasRemote: Boolean(remote), ahead, behind, changed, lastCommit, ghAvailable }
  }

  async init(): Promise<{ ok: boolean; message: string }> {
    if (this.isRepo()) return { ok: true, message: 'Vault is already a git repository.' }
    await this.ensureRepo()
    await this.git(['add', '-A'])
    await this.git(['commit', '-m', 'Initial vault commit', '--allow-empty'])
    return { ok: true, message: 'Initialised a git repository in this vault.' }
  }

  async setRemote(url: string): Promise<{ ok: boolean; message: string }> {
    await this.ensureRepo()
    if (!url.trim()) return { ok: false, message: 'Enter a repository URL.' }
    const existing = await this.remote()
    const res = existing
      ? await this.git(['remote', 'set-url', 'origin', url])
      : await this.git(['remote', 'add', 'origin', url])
    if (res.code !== 0) return { ok: false, message: res.stderr.trim() || 'Could not set remote.' }
    return { ok: true, message: 'Remote configured.' }
  }

  async ghLogin(): Promise<string | null> {
    const res = await run('gh', ['api', 'user', '--jq', '.login'], this.root, { timeout: 20000 })
    if (res.code !== 0) return null
    return res.stdout.trim() || null
  }

  async repoView(fullName: string): Promise<{ exists: boolean; url?: string; visibility?: string }> {
    const res = await run('gh', ['repo', 'view', fullName, '--json', 'url,visibility'], this.root, {
      timeout: 20000
    })
    if (res.code !== 0) return { exists: false }
    try {
      const data = JSON.parse(res.stdout) as { url?: string; visibility?: string }
      return { exists: true, url: data.url, visibility: data.visibility }
    } catch {
      return { exists: false }
    }
  }

  async createRepo(name: string): Promise<CreateRepoResult> {
    const ghCheck = await run('gh', ['--version'], this.root, { timeout: 8000 })
    if (ghCheck.code !== 0) {
      return { ok: false, message: 'GitHub CLI (gh) is not installed. Install it with "brew install gh" or set a remote manually.' }
    }
    const auth = await run('gh', ['auth', 'status'], this.root, { timeout: 15000 })
    if (auth.code !== 0) {
      return { ok: false, message: 'GitHub CLI is not authenticated. Run "gh auth login" in Terminal first.' }
    }
    await this.ensureRepo()
    await this.git(['add', '-A'])
    await this.git(['commit', '-m', 'Initial vault commit', '--allow-empty'])
    await run('gh', ['auth', 'setup-git'], this.root, { timeout: 20000 })
    const res = await run(
      'gh',
      ['repo', 'create', name, '--private', '--source', '.', '--remote', 'origin', '--push'],
      this.root,
      { timeout: 180000 }
    )
    if (res.code !== 0) {
      const detail = (res.stderr || res.stdout).trim()
      return { ok: false, message: detail || 'Failed to create repository.' }
    }
    const remote = await this.remote()
    await this.git(['push', '-u', 'origin', 'HEAD'])
    return { ok: true, message: 'Private repository created and the vault was pushed.', remote: remote ?? undefined }
  }

  async clone(url: string, dir: string): Promise<{ ok: boolean; message: string }> {
    const parent = path.dirname(dir)
    fs.mkdirSync(parent, { recursive: true })
    await run('gh', ['auth', 'setup-git'], parent, { timeout: 20000 })
    const res = await run('git', ['clone', url, dir], parent, { timeout: 300000 })
    if (res.code !== 0) return { ok: false, message: res.stderr.trim() || 'Clone failed.' }
    return { ok: true, message: 'Cloned vault.' }
  }

  async sync(message?: string): Promise<SyncResult> {
    const result: SyncResult = { ok: true, message: '', committed: 0, pulled: false, pushed: false, conflicts: [] }
    if (!this.isRepo()) {
      await this.ensureRepo()
    }
    const branch = await this.branch()
    const remote = await this.remote()

    if (remote) {
      await run('gh', ['auth', 'setup-git'], this.root, { timeout: 15000 })
      const fetch = await this.git(['fetch', 'origin', branch], 60000)
      if (fetch.code === 0) {
        const counts = await this.git(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`])
        const behind = Number(counts.stdout.trim().split(/\s+/)[0]) || 0
        if (behind > 0) {
          const pull = await this.git(['pull', '--rebase', '--autostash', 'origin', branch], 180000)
          if (pull.code !== 0) {
            const conflicts = (await this.git(['diff', '--name-only', '--diff-filter=U'])).stdout
              .split('\n')
              .filter(Boolean)
            await this.git(['rebase', '--abort'])
            return {
              ok: false,
              message: 'Remote changes conflict with local edits. Your local files were left untouched.',
              committed: 0,
              pulled: false,
              pushed: false,
              conflicts
            }
          }
          result.pulled = true
        }
      }
    }

    await this.git(['add', '-A'])
    const staged = await this.git(['diff', '--cached', '--name-only'])
    const files = staged.stdout.split('\n').filter(Boolean)
    if (files.length > 0) {
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
      const msg = message || `Slate sync ${stamp}`
      const commit = await this.git(['commit', '-m', msg])
      if (commit.code !== 0) {
        const detail = commit.stderr.trim()
        if (!/nothing to commit/i.test(detail)) {
          return { ...result, ok: false, message: detail || 'Commit failed.' }
        }
      } else {
        result.committed = files.length
      }
    }

    if (remote) {
      const push = await this.git(['push', 'origin', `HEAD:${branch}`], 180000)
      if (push.code !== 0) {
        return { ...result, ok: false, message: push.stderr.trim() || 'Push failed.' }
      }
      result.pushed = true
    }

    const parts: string[] = []
    if (result.pulled) parts.push('pulled remote changes')
    if (result.committed) parts.push(`committed ${result.committed} file${result.committed === 1 ? '' : 's'}`)
    if (result.pushed) parts.push('pushed to GitHub')
    result.message = parts.length ? `Sync complete — ${parts.join(', ')}.` : 'Everything is up to date.'
    return result
  }

  async log(limit = 50): Promise<GitCommit[]> {
    if (!this.isRepo()) return []
    const res = await this.git(['log', `-${limit}`, `--pretty=format:%H${SEP}%h${SEP}%aI${SEP}%s${SEP}%an`])
    if (res.code !== 0) return []
    return res.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, date, message, author] = line.split(SEP)
        return { hash, shortHash, date, message, author }
      })
  }

  async fileHistory(relative: string): Promise<GitCommit[]> {
    if (!this.isRepo()) return []
    const res = await this.git([
      'log',
      '-50',
      `--pretty=format:%H${SEP}%h${SEP}%aI${SEP}%s${SEP}%an`,
      '--',
      relative
    ])
    if (res.code !== 0) return []
    return res.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, date, message, author] = line.split(SEP)
        return { hash, shortHash, date, message, author }
      })
  }

  async show(rev: string, relative: string): Promise<string> {
    if (!/^[a-zA-Z0-9._^~/-]+$/.test(rev)) throw new Error('Invalid revision')
    const res = await this.git(['show', `${rev}:${relative}`])
    if (res.code !== 0) return ''
    return res.stdout
  }

  async restore(rev: string, relative: string): Promise<void> {
    if (!/^[a-zA-Z0-9._^~/-]+$/.test(rev)) throw new Error('Invalid revision')
    const res = await this.git(['checkout', rev, '--', relative])
    if (res.code !== 0) throw new Error(res.stderr.trim() || 'Could not restore version')
  }

  async diff(relative: string): Promise<string> {
    const res = await this.git(['diff', '--', relative])
    if (res.code !== 0) return ''
    const untracked = await this.git(['diff', '--no-index', '/dev/null', relative])
    return res.stdout || untracked.stdout
  }
}

export function git(root: string): GitService {
  return new GitService(root)
}
