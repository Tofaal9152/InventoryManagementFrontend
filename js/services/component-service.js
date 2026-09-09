import { APP_CONFIG } from '../config.js';
import { getDemoState, updateDemoState } from '../data/demo-store.js';
import { hasValidationErrors, validateComponent } from '../utils/validation.js';

export class ComponentValidationError extends Error {
  constructor(errors) {
    super('Component validation failed.');
    this.name = 'ComponentValidationError';
    this.errors = errors;
  }
}

function getComponentStockState(component, locations) {
  const totalQuantity = locations.reduce((total, location) => total + location.quantity, 0);

  if (totalQuantity === 0 && locations.length) {
    return { id: 'out', label: 'Out of stock' };
  }
  if (totalQuantity <= component.minimumQuantity) {
    return { id: 'low', label: 'Low stock' };
  }
  return { id: 'stocked', label: 'In stock' };
}

function createDemoComponents() {
  const state = getDemoState();
  const categoriesById = new Map(state.categories.map((category) => [category.id, category]));
  const unitsById = new Map(state.units.map((unit) => [unit.id, unit]));

  return state.components.map((component) => {
    const locations = state.cabinets.flatMap((cabinet) => cabinet.drawers
      .filter((drawer) => drawer.componentId === component.id)
      .map((drawer) => ({
        cabinetId: cabinet.id,
        cabinetName: cabinet.name,
        drawerId: drawer.id,
        drawerCode: drawer.code,
        quantity: drawer.quantity,
        sectionCount: drawer.sectionCount
      })));
    const totalQuantity = locations.reduce((total, location) => total + location.quantity, 0);
    const stockState = getComponentStockState(component, locations);

    return {
      ...component,
      category: categoriesById.get(component.categoryId),
      unit: unitsById.get(component.unitId),
      locations,
      totalQuantity,
      locationCount: locations.length,
      stockState: stockState.id,
      stockLabel: stockState.label
    };
  });
}

function filterComponents(components, filters) {
  const query = String(filters.query || '').trim().toLowerCase();
  const stockStatus = filters.stockStatus || 'all';

  return components.filter((component) => {
    const matchesQuery = !query || [
      component.name,
      component.partNumber,
      component.description,
      ...component.locations.map((location) => location.drawerCode)
    ].join(' ').toLowerCase().includes(query);

    return matchesQuery
      && (!filters.categoryId || component.categoryId === filters.categoryId)
      && (!filters.unitId || component.unitId === filters.unitId)
      && (stockStatus === 'all' || component.stockState === stockStatus);
  });
}

export async function listComponents(filters = {}) {
  if (APP_CONFIG.mode === 'demo') {
    return filterComponents(createDemoComponents(), filters)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  throw new Error('Component API integration is not configured yet.');
}

export async function getComponent(componentId) {
  const components = await listComponents();
  return components.find((component) => component.id === componentId) || null;
}

export async function getComponentDetails(componentId) {
  const component = await getComponent(componentId);
  if (!component) {
    return null;
  }

  const state = getDemoState();
  const drawerLocations = new Map(state.cabinets.flatMap((cabinet) => cabinet.drawers.map((drawer) => [
    drawer.id,
    `${cabinet.name} · ${drawer.code}`
  ])));
  const movements = state.movements
    .filter((movement) => movement.componentId === componentId)
    .sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp));

  return {
    ...component,
    movements: movements.map((movement) => ({
      ...movement,
      locationLabel: drawerLocations.get(movement.destinationDrawerId || movement.sourceDrawerId) || '—'
    }))
  };
}

export async function getComponentReferenceData() {
  if (APP_CONFIG.mode === 'demo') {
    const state = getDemoState();
    return { categories: state.categories, units: state.units };
  }

  throw new Error('Component API integration is not configured yet.');
}

function makeComponentId() {
  return `component-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normaliseImage(image) {
  if (!image || typeof image !== 'object' || !String(image.dataUrl || '').startsWith('data:image/')) {
    return null;
  }

  return {
    dataUrl: String(image.dataUrl),
    name: String(image.name || 'component-image'),
    type: String(image.type || ''),
    size: Number(image.size) || 0
  };
}

export async function saveComponent(input) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Component API integration is not configured yet.');
  }

  const state = getDemoState();
  const references = { categories: state.categories, units: state.units, existingComponents: state.components };
  const candidate = {
    ...input,
    name: String(input.name || '').trim(),
    partNumber: String(input.partNumber || '').trim(),
    description: String(input.description || '').trim(),
    manufacturer: String(input.manufacturer || '').trim(),
    datasheetUrl: String(input.datasheetUrl || '').trim(),
    image: normaliseImage(input.image),
    lastBuyingPrice: Number(input.lastBuyingPrice || 0),
    deliveryCharge: Number(input.deliveryCharge || 0),
    minimumQuantity: Number(input.minimumQuantity || 0)
  };
  const errors = validateComponent(candidate, references);

  if (hasValidationErrors(errors)) {
    throw new ComponentValidationError(errors);
  }

  const componentId = candidate.id || makeComponentId();
  updateDemoState((nextState) => {
    const existingIndex = nextState.components.findIndex((component) => component.id === componentId);
    const now = new Date().toISOString();
    const nextComponent = {
      ...candidate,
      id: componentId,
      createdOn: existingIndex >= 0 ? nextState.components[existingIndex].createdOn : now,
      updatedOn: now
    };

    if (existingIndex >= 0) {
      nextState.components[existingIndex] = nextComponent;
    } else {
      nextState.components.push(nextComponent);
    }
    return nextState;
  });

  return getComponent(componentId);
}
