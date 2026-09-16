import { toId, toNumber } from './library.js';

/** Project payloads -> the shape the project pages read. */

const STATUS_LABELS = Object.freeze({ ACTIVE: 'Active', CLOSED: 'Closed' });

export function mapProject(dto) {
  if (!dto) return null;
  return {
    id: toId(dto.id),
    name: dto.name || '',
    description: dto.description || '',
    status: dto.status_display || STATUS_LABELS[dto.status] || 'Active',
    statusCode: dto.status || 'ACTIVE',
    isClosed: dto.status === 'CLOSED',
    createdBy: dto.created_by?.username || '',
    createdOn: dto.created_at || '',
    updatedOn: dto.updated_at || ''
  };
}

function mapConsumptionRow(dto) {
  return {
    component: {
      id: toId(dto.component?.id),
      name: dto.component?.name || '',
      partNumber: dto.component?.part_number || '',
      unit: { symbol: dto.component?.unit_symbol || '' }
    },
    quantityTaken: toNumber(dto.quantity_taken),
    quantityReturned: toNumber(dto.quantity_returned),
    quantity: toNumber(dto.quantity),
    lastBuyingPrice: toNumber(dto.last_buying_price),
    estimatedValue: toNumber(dto.estimated_value)
  };
}

/** The list rows the Projects cards render: take count and estimated spend. */
export function mapProjectSummary(dto) {
  const consumption = (dto?.consumption || []).map(mapConsumptionRow);
  return {
    ...mapProject(dto),
    takeCount: consumption.length,
    estimatedValue: toNumber(dto?.total_estimated_value)
  };
}

export function mapProjectDetails(dto) {
  const consumption = (dto?.consumption || []).map(mapConsumptionRow);
  return {
    ...mapProject(dto),
    consumption,
    estimatedValue: toNumber(dto?.total_estimated_value),
    requisitions: (dto?.requisitions || []).map((item) => ({
      id: toId(item.id),
      reference: item.reference || '',
      component: {
        id: toId(item.component?.id),
        name: item.component?.name || item.part_name || item.requested_part_name || 'Requested part',
        partNumber: item.component?.part_number || '',
        unit: { symbol: item.component?.unit_symbol || item.unit?.symbol || '' }
      },
      partName: item.part_name || item.requested_part_name || '',
      status: item.status_display || item.status || '',
      quantity: toNumber(item.quantity),
      neededBy: item.needed_by || '',
      reason: item.reason || '',
      requestedBy: {
        id: toId(item.requested_by?.id),
        name: item.requested_by?.username || '',
        email: item.requested_by?.email || ''
      },
      createdOn: item.created_at || '',
      statusChangedAt: item.status_changed_at || ''
    })),
    movements: []
  };
}
