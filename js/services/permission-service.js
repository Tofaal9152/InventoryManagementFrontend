import { APP_CONFIG } from '../config.js';
import { ROLES, getRole, isSignedIn } from '../api/tokens.js';

/**
 * The role the UI should obey.
 *
 * Signed in: whatever the server returned at login. Signed out in demo mode:
 * Admin, so the seeded data stays fully browsable without a backend. Signed out
 * against live data: nothing is permitted — the guard sends you to /login anyway.
 */
export function getEffectiveRole() {
  if (isSignedIn()) return getRole();
  return APP_CONFIG.mode === 'demo' ? ROLES.ADMIN : '';
}

function is(...roles) {
  return roles.includes(getEffectiveRole());
}

export function isAdminRole() {
  return is(ROLES.ADMIN);
}

export function isManagerRole() {
  return is(ROLES.MANAGER);
}

export function isStaffRole() {
  return is(ROLES.STAFF);
}

/* ---- capabilities, named after what the user does, not after the role ---- */

/** Categories, units, components: create, edit, archive, import and export. */
export function canManageLibrary() {
  return is(ROLES.ADMIN, ROLES.MANAGER);
}

/** Create, edit, close and reopen projects. */
export function canManageProjects() {
  return is(ROLES.ADMIN, ROLES.MANAGER);
}

/** Add stock, transfer stock, assign a component to a drawer, edit stock entries. */
export function canManageStock() {
  return is(ROLES.ADMIN, ROLES.MANAGER);
}

/** Take and return stock — every signed-in role. */
export function canMoveStock() {
  return is(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF);
}

/** Correct a counted quantity. Admin only. */
export function canAdjustStock() {
  return is(ROLES.ADMIN);
}

/** Resize the cabinet and change drawer chamber counts. Admin only. */
export function canConfigureCabinet() {
  return is(ROLES.ADMIN);
}

/** User administration and the audit log. Admin only. */
export function canAdministerUsers() {
  return is(ROLES.ADMIN);
}

/** Approve, reject, order or receive a requisition. Admin only. */
export function canDecideRequisitions() {
  return is(ROLES.ADMIN);
}

/** Every signed-in role may raise a requisition. */
export function canRaiseRequisitions() {
  return is(ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF);
}

/** Full reporting. Staff only get dashboard, movements and their own activity. */
export function canSeeAllReports() {
  return is(ROLES.ADMIN, ROLES.MANAGER);
}

/** One line for an empty state or a tooltip explaining why an action is missing. */
export function readOnlyNotice(subject = 'this') {
  return `Your role can view ${subject} but not change it.`;
}
