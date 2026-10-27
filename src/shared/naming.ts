/** Shared user/repository naming rules (main, preload and renderer). */

export const REPO_PREFIX = 'slate-vault-user-'
export const DEFAULT_USER = 'Peter'

/** User names become part of folder and repository names. */
export function sanitizeUser(name: string): string {
  return name
    .trim()
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48)
}

export function repoNameFor(name: string): string {
  return `${REPO_PREFIX}${sanitizeUser(name)}`
}
