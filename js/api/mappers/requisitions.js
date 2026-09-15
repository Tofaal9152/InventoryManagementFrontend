import { toId, toNumber } from './library.js';

/** Requisition payloads -> the shape the requisition pages read. */

const STATUS_LABELS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  ORDERED: 'Ordered',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
});

export function statusLabel(code) {
  return STATUS_LABELS[code] || code || '';
}

/** The pages speak labels ("Pending"); the API speaks codes ("PENDING"). */
export function statusCode(label) {
  const match = Object.entries(STATUS_LABELS).find(([, value]) => value === label);
  return match ? match[0] : String(label || '').toUpperCase();
}

export function mapRequisition(dto) {
  if (!dto) return null;
  const component = dto.component || null;

  return {
    id: toId(dto.id),
    reference: dto.reference || toId(dto.id),
    componentId: toId(component?.id),
    component: component
      ? {
        id: toId(component.id),
        name: component.name || '',
        partNumber: component.part_number || '',
        unit: { symbol: component.unit_symbol || '' }
      }
      : null,
    freeTextPartName: dto.requested_part_name || '',
    partName: dto.part_name || dto.requested_part_name || component?.name || '',
    quantity: toNumber(dto.quantity),
    unitId: toId(dto.unit?.id),
    unit: dto.unit
      ? { id: toId(dto.unit.id), name: dto.unit.name || '', symbol: dto.unit.symbol || '', allowsFraction: dto.unit.allows_fraction === true }
      : null,
    projectId: toId(dto.project?.id),
    project: dto.project ? { id: toId(dto.project.id), name: dto.project.name || '', status: dto.project.status || '' } : null,
    neededBy: dto.needed_by || '',
    note: dto.reason || '',
    status: dto.status_display || statusLabel(dto.status),
    statusCode: dto.status || '',
    statusUpdatedOn: dto.status_changed_at || dto.updated_at || '',
    daysInStatus: toNumber(dto.days_in_current_status),
    requester: dto.requested_by ? { id: toId(dto.requested_by.id), name: dto.requested_by.username || '', role: dto.requested_by.role || '' } : null,
    createdOn: dto.created_at || '',
    // The server decides who may move this requisition where — including a
    // requester cancelling their own pending one.
    allowedTransitions: (dto.allowed_transitions || []).map(statusLabel),
    allowedTransitionCodes: dto.allowed_transitions || [],
    statusHistory: (dto.status_history || []).map((entry) => ({
      id: toId(entry.id),
      fromStatus: statusLabel(entry.from_status),
      toStatus: statusLabel(entry.to_status),
      actor: entry.changed_by?.username || '',
      note: entry.note || '',
      timestamp: entry.created_at || ''
    }))
  };
}
