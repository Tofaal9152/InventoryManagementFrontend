import { toId, toNumber } from './library.js';

/**
 * Cabinet payloads -> the workspace shape the inventory page reads.
 *
 * The backend addresses stock per **chamber** (`A11`), inside a **drawer** (`A1`),
 * inside one cabinet. The grid stays a grid of drawers, because that is the
 * cabinet's physical shape; a drawer with several chambers reports the state of
 * its contents as a whole, and the side panel lists the chambers individually.
 */

const CHAMBER_STATES = Object.freeze({
  EMPTY: { id: 'empty', label: 'Empty' },
  OCCUPIED: { id: 'stocked', label: 'In stock' },
  LOW_STOCK: { id: 'low', label: 'Low stock' },
  OUT_OF_STOCK: { id: 'out', label: 'Out of stock' }
});

const STATE_PRIORITY = ['out', 'low', 'stocked', 'empty'];

function chamberState(dto) {
  return CHAMBER_STATES[dto?.state] || CHAMBER_STATES.EMPTY;
}

/** The most urgent chamber decides the drawer's colour: out > low > stocked > empty. */
function drawerState(chambers) {
  const states = new Set(chambers.map((chamber) => chamber.stockState));
  const worst = STATE_PRIORITY.find((state) => states.has(state)) || 'empty';
  const labels = { out: 'Out of stock', low: 'Low stock', stocked: 'In stock', empty: 'Empty' };
  return { id: worst, label: labels[worst] };
}

export function mapChamber(dto, drawerCode) {
  const state = chamberState(dto);
  const entry = dto?.stock_entry || null;
  const component = entry?.component || null;

  return {
    id: toId(dto?.id),
    code: dto?.code || drawerCode || '',
    number: toNumber(dto?.number, 1),
    stockState: state.id,
    stockLabel: state.label,
    highlighted: dto?.highlighted === true,
    stockEntryId: toId(entry?.id),
    quantity: toNumber(entry?.quantity),
    component: component
      ? {
        id: toId(component.id),
        name: component.name || '',
        partNumber: component.part_number || '',
        minimumQuantity: toNumber(component.minimum_quantity),
        totalQuantity: toNumber(component.total_quantity)
      }
      : null,
    unit: { symbol: component?.unit_symbol || '' },
    note: entry?.note || ''
  };
}

/**
 * One grid cell. A single-chamber drawer reads exactly like the demo model did,
 * so the cell, the table row and the detail panel need no special case.
 */
export function mapDrawer(dto) {
  const chambers = (dto?.chambers || []).map((chamber) => mapChamber(chamber, dto?.code));
  const occupied = chambers.filter((chamber) => chamber.component);
  const single = chambers.length === 1 ? chambers[0] : null;
  const state = single ? { id: single.stockState, label: single.stockLabel } : drawerState(chambers);

  return {
    id: toId(dto?.id),
    code: dto?.code || '',
    row: toNumber(dto?.row, 0),
    column: toNumber(dto?.column, 0),
    sectionCount: toNumber(dto?.chamber_count, chambers.length || 1),
    chambers,
    chamberCount: chambers.length,
    occupiedChamberCount: occupied.length,
    isMultiChamber: chambers.length > 1,
    highlighted: chambers.some((chamber) => chamber.highlighted),
    // Single-chamber drawers expose the chamber's stock directly.
    // `locationCode` is the chamber code the stock endpoints address (A11, not A1).
    locationCode: single?.code || '',
    chamberId: single?.id || '',
    stockEntryId: single?.stockEntryId || '',
    component: single?.component || null,
    quantity: single ? single.quantity : occupied.reduce((total, chamber) => total + chamber.quantity, 0),
    unit: single?.unit || { symbol: occupied[0]?.unit?.symbol || '' },
    note: single?.note || '',
    stockState: state.id,
    stockLabel: state.label,
    movements: []
  };
}

export function mapCabinetSummary(dto) {
  const summary = dto?.summary || {};
  return {
    totalChambers: toNumber(summary.total_chambers),
    inUse: toNumber(summary.in_use),
    empty: toNumber(summary.empty),
    occupied: toNumber(summary.occupied),
    lowStock: toNumber(summary.low_stock),
    outOfStock: toNumber(summary.out_of_stock),
    utilisationPercent: toNumber(summary.utilisation_percent)
  };
}

const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function columnLetters(count) {
  return COLUMN_LETTERS.slice(0, Math.max(0, Math.min(count, COLUMN_LETTERS.length))).split('');
}

/**
 * `inventory/drawer-map/` -> the single-cabinet workspace.
 * The list shape is kept (one entry) so the cabinet browser and the pages that
 * iterate `workspace.cabinets` keep working unchanged.
 */
export function mapDrawerMap(dto) {
  const cabinetDto = dto?.cabinet || {};
  const drawers = (dto?.rows || []).flatMap((row) => (row?.drawers || []).map(mapDrawer));

  const cabinet = {
    id: toId(cabinetDto.id),
    name: cabinetDto.name || 'Cabinet',
    rows: toNumber(cabinetDto.rows, 0),
    columns: columnLetters(toNumber(cabinetDto.columns, 0)),
    columnCount: toNumber(cabinetDto.columns, 0),
    drawers,
    drawerCount: drawers.length,
    summary: mapCabinetSummary(dto)
  };

  return {
    cabinets: [cabinet],
    groups: [{ id: 'cabinet', name: 'Cabinet', cabinets: [cabinet] }]
  };
}

export function mapCabinet(payload) {
  // Reads return the cabinet directly; writes wrap it in {success, message, data}.
  const dto = payload?.data ?? payload;
  return {
    id: toId(dto?.id),
    name: dto?.name || 'Cabinet',
    rows: toNumber(dto?.rows, 0),
    columns: columnLetters(toNumber(dto?.columns, 0)),
    columnCount: toNumber(dto?.columns, 0),
    summary: mapCabinetSummary(dto),
    createdOn: dto?.created_at || '',
    updatedOn: dto?.updated_at || ''
  };
}
