import { toId, toNumber } from './library.js';

/** User and audit-log payloads -> the shapes the settings pages read. */

const ROLE_LABELS = Object.freeze({ ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff' });

export function roleLabel(code) {
  return ROLE_LABELS[code] || code || '';
}

export function roleCode(label) {
  const match = Object.entries(ROLE_LABELS).find(([, value]) => value === label);
  return match ? match[0] : String(label || '').toUpperCase();
}

export function mapUser(dto) {
  if (!dto) return null;
  const firstName = dto.first_name || '';
  const lastName = dto.last_name || '';
  const name = `${firstName} ${lastName}`.trim();

  return {
    id: toId(dto.id),
    username: dto.username || '',
    email: dto.email || '',
    firstName,
    lastName,
    name: name || dto.username || dto.email || '',
    role: dto.role_display || roleLabel(dto.role),
    roleCode: dto.role || '',
    isActive: dto.is_active !== false,
    status: dto.is_active === false ? 'Deactivated' : 'Active',
    joinedOn: dto.date_joined || '',
    lastLogin: dto.last_login || ''
  };
}

/** A one-line summary of what changed, for the audit table's Summary column. */
function changeSummary(dto) {
  const changes = dto?.changes || {};
  const after = changes.after || {};
  const before = changes.before || {};
  const fields = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  if (!fields.length) return dto?.object_repr || '';

  const described = fields.slice(0, 3).map((field) => {
    const from = before[field];
    const to = after[field];
    if (from !== undefined && to !== undefined) return `${field}: ${from} → ${to}`;
    if (to !== undefined) return `${field}: ${to}`;
    return `${field} removed`;
  }).join(', ');

  const extra = fields.length > 3 ? ` (+${fields.length - 3} more)` : '';
  return `${dto?.object_repr ? `${dto.object_repr} · ` : ''}${described}${extra}`;
}

export function mapAuditEvent(dto) {
  if (!dto) return null;
  return {
    id: toId(dto.id),
    entity: dto.entity_type_display || dto.entity_type || '',
    entityCode: dto.entity_type || '',
    action: dto.action_display || dto.action || '',
    actionCode: dto.action || '',
    objectId: toId(dto.object_id),
    objectLabel: dto.object_repr || '',
    summary: changeSummary(dto),
    changes: dto.changes || {},
    actor: dto.actor ? { id: toId(dto.actor.id), name: dto.actor.username || '', role: roleLabel(dto.actor.role) } : null,
    timestamp: dto.created_at || dto.timestamp || ''
  };
}

export function mapUserActivity(dto) {
  return {
    userId: toId(dto?.user_id),
    user: dto?.user || '',
    role: roleLabel(dto?.role),
    takes: toNumber(dto?.takes),
    returns: toNumber(dto?.returns),
    quantityTaken: toNumber(dto?.quantity_taken)
  };
}
