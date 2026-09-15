/**
 * Library payloads (snake_case, decimal strings) -> the shape the pages read.
 * Nothing raw from DRF may leave a service; this file is that boundary.
 */

/** DRF sends decimals as strings ("36.000") and nulls for "not set". */
export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toId(value) {
  return value === null || value === undefined ? '' : String(value);
}

const STOCK_STATES = Object.freeze({
  IN_STOCK: { id: 'stocked', label: 'In stock' },
  LOW_STOCK: { id: 'low', label: 'Low stock' },
  OUT_OF_STOCK: { id: 'out', label: 'Out of stock' }
});

const EMPTY_STATE = Object.freeze({ id: 'empty', label: 'Empty' });

function stockState(dto) {
  if (STOCK_STATES[dto?.stock_status]) return STOCK_STATES[dto.stock_status];
  if (!dto?.locations?.length) return EMPTY_STATE;
  return dto?.is_low_stock ? STOCK_STATES.LOW_STOCK : STOCK_STATES.IN_STOCK;
}

export function mapCategory(dto) {
  if (!dto) return null;
  return {
    id: toId(dto.id),
    name: dto.name || '',
    componentCount: toNumber(dto.component_count, 0)
  };
}

export function mapUnit(dto) {
  if (!dto) return null;
  return {
    id: toId(dto.id),
    name: dto.name || '',
    symbol: dto.symbol || '',
    allowsFraction: dto.allows_fraction === true,
    componentCount: toNumber(dto.component_count, 0)
  };
}

/**
 * The list endpoint sends location codes; the detail endpoint sends entries.
 * The cabinet name is filled in once the inventory service knows it (Step 6);
 * until then the location code is the whole address, which is how the backend
 * addresses stock anyway.
 */
function mapLocations(dto) {
  if (Array.isArray(dto?.stock_by_location)) {
    return dto.stock_by_location.map((entry) => ({
      stockEntryId: toId(entry.stock_entry_id),
      cabinetName: 'Cabinet',
      drawerCode: entry.location || '',
      quantity: toNumber(entry.quantity),
      note: entry.note || '',
      updatedOn: entry.updated_at || '',
      sectionCount: 1
    }));
  }
  if (Array.isArray(dto?.locations)) {
    return dto.locations.map((code) => ({
      stockEntryId: '',
      cabinetName: 'Cabinet',
      drawerCode: code,
      quantity: 0,
      note: '',
      updatedOn: '',
      sectionCount: 1
    }));
  }
  return [];
}

function mapImage(dto) {
  const url = dto?.image_url || '';
  if (!url) return null;
  // `dataUrl` is what the pages render into `<img src>`; a hosted URL works there too.
  return { dataUrl: url, url, name: dto.name || 'Component image', type: '', size: 0 };
}

export function mapComponent(dto) {
  if (!dto) return null;
  const state = stockState(dto);
  const locations = mapLocations(dto);

  return {
    id: toId(dto.id),
    name: dto.name || '',
    partNumber: dto.part_number || '',
    description: dto.description || '',
    manufacturer: dto.manufacturer || '',
    datasheetUrl: dto.datasheet_url || '',
    categoryId: toId(dto.category?.id),
    category: mapCategory(dto.category),
    unitId: toId(dto.unit?.id),
    unit: mapUnit(dto.unit),
    totalQuantity: toNumber(dto.total_quantity),
    minimumQuantity: toNumber(dto.minimum_quantity),
    lastBuyingPrice: toNumber(dto.last_buying_price),
    deliveryCharge: toNumber(dto.delivery_charge),
    stockState: state.id,
    stockLabel: state.label,
    isLowStock: dto.is_low_stock === true,
    isArchived: dto.is_archived === true,
    locations,
    locationCount: locations.length,
    image: mapImage(dto),
    updatedOn: dto.updated_at || '',
    createdOn: dto.created_at || ''
  };
}

/** Project consumption shown on the component detail page. */
export function mapComponentProjects(dto) {
  const projects = dto?.projects;
  if (!projects) return { totalEstimatedValue: 0, consumption: [] };
  return {
    totalEstimatedValue: toNumber(projects.total_estimated_value),
    consumption: (projects.consumption || []).map((entry) => ({
      projectId: toId(entry.project?.id),
      projectName: entry.project?.name || '',
      quantityTaken: toNumber(entry.quantity_taken),
      quantityReturned: toNumber(entry.quantity_returned),
      quantity: toNumber(entry.quantity),
      lastBuyingPrice: toNumber(entry.last_buying_price),
      estimatedValue: toNumber(entry.estimated_value)
    }))
  };
}

const MOVEMENT_LABELS = Object.freeze({
  ADD: 'Add',
  TAKE: 'Take',
  RETURN: 'Return',
  TRANSFER: 'Transfer',
  ADJUST: 'Adjust'
});

export function mapMovement(dto) {
  if (!dto) return null;
  const type = dto.movement_type || '';
  const location = dto.destination_location || dto.source_location || '';
  return {
    id: toId(dto.id),
    type: dto.movement_type_display || MOVEMENT_LABELS[type] || type,
    typeCode: type,
    componentId: toId(dto.component?.id),
    componentName: dto.component?.name || '',
    unitSymbol: dto.component?.unit_symbol || '',
    quantity: toNumber(dto.quantity),
    sourceLocation: dto.source_location || '',
    destinationLocation: dto.destination_location || '',
    locationLabel: location || 'No drawer',
    unitPrice: toNumber(dto.unit_price),
    deliveryCharge: toNumber(dto.delivery_charge),
    performedBy: dto.performed_by?.username || '',
    projectId: toId(dto.project?.id),
    projectName: dto.project?.name || '',
    note: dto.note || '',
    timestamp: dto.created_at || ''
  };
}

/** Form values -> the create/update body the backend expects. */
export function toComponentPayload(candidate) {
  return {
    name: candidate.name,
    part_number: candidate.partNumber || null,
    category: candidate.categoryId,
    unit: candidate.unitId,
    description: candidate.description || '',
    manufacturer: candidate.manufacturer || '',
    datasheet_url: candidate.datasheetUrl || '',
    last_buying_price: String(candidate.lastBuyingPrice ?? 0),
    delivery_charge: String(candidate.deliveryCharge ?? 0),
    minimum_quantity: String(candidate.minimumQuantity ?? 0)
  };
}

/** DRF field names -> form control names, so an error lands under the right input. */
const FIELD_BY_API_NAME = Object.freeze({
  name: 'name',
  part_number: 'partNumber',
  category: 'categoryId',
  unit: 'unitId',
  description: 'description',
  manufacturer: 'manufacturer',
  datasheet_url: 'datasheetUrl',
  image_url: 'imageFile',
  last_buying_price: 'lastBuyingPrice',
  delivery_charge: 'deliveryCharge',
  minimum_quantity: 'minimumQuantity'
});

export function mapComponentFieldErrors(fields = {}, fallbackMessage = 'The component could not be saved.', { usedDatasheetFile = false } = {}) {
  const errors = {};
  Object.entries(fields).forEach(([apiName, message]) => {
    const field = FIELD_BY_API_NAME[apiName];
    if (!field) return;
    // The datasheet can come from either control; blame the one that was used.
    errors[field === 'datasheetUrl' && usedDatasheetFile ? 'datasheetFile' : field] = message;
  });
  if (!Object.keys(errors).length) errors.name = fallbackMessage;
  return errors;
}
