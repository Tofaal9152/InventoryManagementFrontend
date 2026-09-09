const statusClassByType = {
  empty: 'neutral',
  stocked: 'success',
  low: 'warning',
  out: 'danger'
};

export function createStatusBadge(label, type = 'empty') {
  const badge = document.createElement('span');
  const statusClass = statusClassByType[type] || 'neutral';

  badge.className = `status-badge status-badge--${statusClass}`;
  badge.textContent = label;
  return badge;
}
