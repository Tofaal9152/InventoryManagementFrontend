import { toId, toNumber } from './library.js';

/**
 * Report payloads -> the rows the dashboard and reports pages already render.
 * The report endpoints return flat rows (`component`, `category` as strings),
 * not nested objects, so each row is rebuilt into the nested shape the tables read.
 */

const STOCK_LABELS = Object.freeze({
  IN_STOCK: { id: 'stocked', label: 'In stock' },
  LOW_STOCK: { id: 'low', label: 'Low stock' },
  OUT_OF_STOCK: { id: 'out', label: 'Out of stock' }
});

export function mapCurrentStockRow(dto) {
  const state = STOCK_LABELS[dto?.stock_status] || STOCK_LABELS.IN_STOCK;
  const totalQuantity = toNumber(dto?.total_quantity);
  const lastBuyingPrice = toNumber(dto?.last_buying_price);
  const locations = dto?.locations || [];

  return {
    id: toId(dto?.component_id),
    name: dto?.component || '',
    partNumber: dto?.part_number || '',
    category: { name: dto?.category || '—' },
    unit: { symbol: dto?.unit_symbol || '' },
    totalQuantity,
    lastBuyingPrice,
    deliveryCharge: toNumber(dto?.delivery_charge),
    estimatedValue: toNumber(dto?.estimated_stock_value, totalQuantity * lastBuyingPrice),
    locations,
    locationCount: toNumber(dto?.chambers_held, locations.length),
    stockState: state.id,
    stockLabel: state.label,
    minimumQuantity: toNumber(dto?.minimum_quantity)
  };
}

export function mapLowStockRow(dto) {
  return {
    ...mapCurrentStockRow({ ...dto, stock_status: toNumber(dto?.total_quantity) > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK' }),
    minimumQuantity: toNumber(dto?.minimum_quantity),
    shortfall: toNumber(dto?.shortfall)
  };
}

/** The report lists one row per component; the page shows one row per project. */
export function mapProjectConsumption(rows = []) {
  const byProject = new Map();

  rows.forEach((row) => {
    const id = toId(row.project_id);
    const current = byProject.get(id) || {
      id,
      name: row.project || '',
      takeCount: 0,
      estimatedValue: 0,
      components: []
    };
    current.takeCount += 1;
    current.estimatedValue += toNumber(row.estimated_value);
    current.components.push({
      id: toId(row.component_id),
      name: row.component || '',
      partNumber: row.part_number || '',
      unit: { symbol: row.unit_symbol || '' },
      quantity: toNumber(row.quantity),
      estimatedValue: toNumber(row.estimated_value)
    });
    byProject.set(id, current);
  });

  return [...byProject.values()];
}

export function mapDrawerUtilisation(rows = [], summary = null) {
  const totals = rows.reduce((acc, row) => ({
    total: acc.total + toNumber(row.total_chambers),
    occupied: acc.occupied + toNumber(row.in_use),
    empty: acc.empty + toNumber(row.empty)
  }), { total: 0, occupied: 0, empty: 0 });

  return {
    total: summary ? toNumber(summary.total_chambers, totals.total) : totals.total,
    occupied: summary ? toNumber(summary.in_use, totals.occupied) : totals.occupied,
    empty: summary ? toNumber(summary.empty, totals.empty) : totals.empty,
    drawers: rows.map((row) => ({
      code: row.drawer || '',
      totalChambers: toNumber(row.total_chambers),
      inUse: toNumber(row.in_use),
      empty: toNumber(row.empty),
      freeLocations: row.free_locations || []
    }))
  };
}

export function mapDashboard(dto) {
  const utilisation = dto?.drawer_utilisation || {};
  return {
    componentCount: toNumber(dto?.total_components),
    totalValue: toNumber(dto?.total_stock_value),
    lowStockCount: toNumber(dto?.low_stock_count),
    outOfStockCount: toNumber(dto?.out_of_stock_count),
    pendingRequisitionCount: toNumber(dto?.pending_requisitions),
    drawerUtilisation: toNumber(utilisation.utilisation_percent),
    chamberSummary: {
      total: toNumber(utilisation.total_chambers),
      inUse: toNumber(utilisation.in_use),
      empty: toNumber(utilisation.empty)
    }
  };
}
