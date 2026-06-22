/**
 * Role-Based Access Control (RBAC) helpers.
 *
 * Three roles, ordered by escalating privilege:
 *   1. analyst — day-to-day investigation work (own data only)
 *   2. editor  — analyst + manage any investigation, tags, all export formats
 *   3. admin   — editor + manage users, full audit log, settings, playbooks
 *
 * `isSuperuser` is kept for backward compatibility and is treated as a
 * synonym of role === 'admin'. New code should always go through `can()`
 * and the dedicated role-check helpers below.
 */

export type Role = 'analyst' | 'editor' | 'admin'

export const ROLES: Role[] = ['analyst', 'editor', 'admin']

/** Numeric privilege rank — higher = more privileged. */
const ROLE_RANK: Record<Role, number> = {
  analyst: 0,
  editor: 1,
  admin: 2,
}

/**
 * Permission catalog. Each permission maps to the minimum role rank required
 * to exercise it. Add new permissions here and the helpers below will pick
 * them up automatically.
 */
const PERMISSION_MIN_RANK: Record<string, number> = {
  // Investigation actions
  'investigation.view': ROLE_RANK.analyst,
  'investigation.create': ROLE_RANK.analyst,
  'investigation.update.own': ROLE_RANK.analyst,
  'investigation.delete.own': ROLE_RANK.analyst,
  'investigation.update.any': ROLE_RANK.editor,
  'investigation.delete.any': ROLE_RANK.editor,
  'investigation.run_pipeline': ROLE_RANK.analyst,

  // Copilot / chat
  'copilot.use': ROLE_RANK.analyst,

  // Tags
  'tag.manage': ROLE_RANK.editor,

  // Export
  'export.json': ROLE_RANK.analyst,
  'export.stix': ROLE_RANK.analyst,
  'export.pdf': ROLE_RANK.analyst,
  'export.all_formats': ROLE_RANK.editor,

  // Audit
  'audit.view.own': ROLE_RANK.analyst,
  'audit.view.full': ROLE_RANK.editor,
  'audit.verify_chain': ROLE_RANK.admin,

  // Users & settings
  'user.manage': ROLE_RANK.admin,
  'user.list': ROLE_RANK.admin,
  'user.create': ROLE_RANK.admin,
  'user.change_role': ROLE_RANK.admin,
  'user.change_status': ROLE_RANK.admin,
  'settings.manage': ROLE_RANK.admin,
  'settings.view': ROLE_RANK.analyst,
  'playbook.manage': ROLE_RANK.admin,
}

/**
 * Normalise whatever the caller passed in (a Prisma User row, a serialised
 * AuthUser, a partial object) into a known Role value.
 *
 * - If `user.role` is one of the three known roles → use it.
 * - Else if `user.isSuperuser` is true → 'admin' (backward compat).
 * - Else 'analyst'.
 */
export function getUserRole(user: { role?: string | null; isSuperuser?: boolean } | null | undefined): Role {
  if (!user) return 'analyst'
  const r = user.role
  if (r === 'analyst' || r === 'editor' || r === 'admin') return r
  // Backward compatibility: legacy `isSuperuser === true` implies admin.
  if (user.isSuperuser === true) return 'admin'
  return 'analyst'
}

/** Return the numeric privilege rank (0..2). Higher = more privileged. */
export function roleRank(user: { role?: string | null; isSuperuser?: boolean } | null | undefined): number {
  return ROLE_RANK[getUserRole(user)]
}

/**
 * Generic permission check.
 *
 *     can(user, 'investigation.delete.any')
 *
 * Returns true if the user's role rank is at least the minimum required
 * for the given permission. Unknown permissions default to admin-only.
 */
export function can(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined,
  permission: string
): boolean {
  const min = PERMISSION_MIN_RANK[permission]
  if (min === undefined) {
    // Unknown permission — fail closed to admin only.
    return roleRank(user) >= ROLE_RANK.admin
  }
  return roleRank(user) >= min
}

/* ----------------------------------------------------------- specific helpers */

/** True if the user may manage other users (create/deactivate/change role). */
export function canManageUsers(user: { role?: string | null; isSuperuser?: boolean } | null | undefined): boolean {
  return can(user, 'user.manage')
}

/** True if the user may list all users in the workspace. */
export function canListUsers(user: { role?: string | null; isSuperuser?: boolean } | null | undefined): boolean {
  return can(user, 'user.list')
}

/** True if the user may delete any investigation (not just their own). */
export function canDeleteAnyInvestigation(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'investigation.delete.any')
}

/** True if the user may edit any investigation (not just their own). */
export function canEditAnyInvestigation(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'investigation.update.any')
}

/** True if the user may view the full cross-user audit log. */
export function canViewFullAuditLog(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'audit.view.full')
}

/** True if the user may modify workspace/global settings. */
export function canManageSettings(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'settings.manage')
}

/** True if the user may manage playbooks. */
export function canManagePlaybooks(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'playbook.manage')
}

/** True if the user may change another user's role. */
export function canChangeUserRole(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'user.change_role')
}

/** True if the user may create new users directly. */
export function canCreateUsers(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'user.create')
}

/** True if the user may activate/deactivate users. */
export function canChangeUserStatus(
  user: { role?: string | null; isSuperuser?: boolean } | null | undefined
): boolean {
  return can(user, 'user.change_status')
}

/**
 * Validate that a string is a known role. Returns the normalised Role or
 * null if invalid.
 */
export function normalizeRole(value: unknown): Role | null {
  if (value === 'analyst' || value === 'editor' || value === 'admin') return value
  return null
}

/**
 * Human-readable description of each role — used in the UI.
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  analyst: 'View and create investigations, run pipelines, use copilot, view own audit history.',
  editor: 'Everything an analyst can do, plus edit/delete any investigation, manage tags, export all formats.',
  admin: 'Everything an editor can do, plus manage users, view full audit log, manage settings and playbooks.',
}

/** Display colour per role for the UI. */
export const ROLE_COLORS: Record<Role, { fg: string; bg: string; border: string; dot: string }> = {
  analyst: { fg: 'text-teal-300', bg: 'bg-teal-500/10', border: 'border-teal-500/30', dot: 'bg-teal-400' },
  editor: { fg: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  admin: { fg: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/30', dot: 'bg-rose-400' },
}
