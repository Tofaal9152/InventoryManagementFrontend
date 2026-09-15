/** Backend user payloads (snake_case) -> the shape the UI reads. */

export function mapUser(dto) {
  if (!dto || typeof dto !== 'object') return null;
  const firstName = dto.first_name || '';
  const lastName = dto.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: dto.pk ?? dto.id ?? null,
    username: dto.username || '',
    email: dto.email || '',
    firstName,
    lastName,
    fullName: fullName || dto.username || dto.email || 'Signed in user',
    isActive: dto.is_active !== false
  };
}

export function mapSignIn(dto) {
  return {
    access: dto?.access || '',
    refresh: dto?.refresh || '',
    role: dto?.role || '',
    user: mapUser(dto?.user)
  };
}

const ROLE_LABELS = Object.freeze({
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff'
});

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Signed out';
}
