import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { uploadFile } from './file-service.js';
import {
  mapComponent,
  mapComponentFieldErrors,
  mapComponentProjects,
  mapMovement,
  mapCategory,
  mapUnit,
  toComponentPayload
} from '../api/mappers/library.js';
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

const STOCK_STATUS_PARAM = Object.freeze({
  stocked: 'in_stock',
  low: 'below_minimum',
  out: 'out_of_stock'
});

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

/**
 * The library table paginates in the browser, so a live read collects every
 * matching page first. Capped so a runaway dataset cannot spin forever.
 */
async function listAllComponents(params) {
  const collected = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { items, next } = await apiList('library/components/', {
      params: { ...params, p: page, page_size: PAGE_SIZE }
    });
    collected.push(...items);
    if (!next || !items.length) break;
  }
  return collected;
}

export async function listComponents(filters = {}) {
  if (APP_CONFIG.mode === 'demo') {
    return filterComponents(createDemoComponents(), filters)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  const dtos = await listAllComponents({
    ordering: 'name',
    search: String(filters.query || '').trim(),
    category: filters.categoryId || '',
    unit: filters.unitId || '',
    stock_status: STOCK_STATUS_PARAM[filters.stockStatus] || ''
  });
  return dtos.map(mapComponent);
}

export async function getComponent(componentId) {
  if (APP_CONFIG.mode !== 'demo') {
    const dto = await apiRequest(`library/components/${encodeURIComponent(componentId)}/`);
    return mapComponent(dto);
  }

  const components = await listComponents();
  return components.find((component) => component.id === componentId) || null;
}

export async function getComponentDetails(componentId) {
  if (APP_CONFIG.mode !== 'demo') {
    let dto;
    try {
      dto = await apiRequest(`library/components/${encodeURIComponent(componentId)}/`);
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }

    // Movements live on the inventory side; a failure there must not hide the component.
    let movements = [];
    try {
      const page = await apiList('inventory/movements/', {
        params: { component: componentId, page_size: 10 }
      });
      movements = page.items.map(mapMovement);
    } catch {
      movements = [];
    }

    return { ...mapComponent(dto), projects: mapComponentProjects(dto), movements };
  }

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

  const [categories, units] = await Promise.all([
    apiList('library/categories/', { params: { page_size: PAGE_SIZE } }),
    apiList('library/units/', { params: { page_size: PAGE_SIZE } })
  ]);

  return {
    categories: categories.items.map(mapCategory),
    units: units.items.map(mapUnit)
  };
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

async function saveComponentLive(input) {
  const references = await getComponentReferenceData();
  const candidate = {
    ...input,
    name: String(input.name || '').trim(),
    partNumber: String(input.partNumber || '').trim(),
    description: String(input.description || '').trim(),
    manufacturer: String(input.manufacturer || '').trim(),
    datasheetUrl: String(input.datasheetUrl || '').trim(),
    lastBuyingPrice: Number(input.lastBuyingPrice || 0),
    deliveryCharge: Number(input.deliveryCharge || 0),
    minimumQuantity: Number(input.minimumQuantity || 0)
  };

  // A datasheet file replaces the typed URL, so the typed one is not validated.
  if (input.datasheetFile) candidate.datasheetUrl = '';

  // Client-side checks stay for instant feedback; uniqueness is the server's call.
  const errors = validateComponent(candidate, { ...references, existingComponents: [] });
  if (hasValidationErrors(errors)) throw new ComponentValidationError(errors);

  const payload = toComponentPayload(candidate);

  // The datasheet can be a link the user typed or a file they picked. A file is
  // uploaded to the storage proxy first, and only its URL is stored.
  if (input.datasheetFile) {
    try {
      payload.datasheet_url = await uploadFile(input.datasheetFile);
    } catch (error) {
      throw new ComponentValidationError({ datasheetFile: error?.message || 'The datasheet could not be uploaded.' });
    }
  }

  // A freshly picked file goes to the storage proxy first; the component stores its URL.
  if (input.imageFile) {
    try {
      payload.image_url = await uploadFile(input.imageFile);
    } catch (error) {
      throw new ComponentValidationError({ imageFile: error?.message || 'The image could not be uploaded.' });
    }
  } else if (input.image === null) {
    payload.image_url = '';
  } else if (input.image?.url) {
    payload.image_url = input.image.url;
  }

  try {
    const dto = input.id
      ? await apiRequest(`library/components/${encodeURIComponent(input.id)}/`, { method: 'PATCH', body: payload })
      : await apiRequest('library/components/', { method: 'POST', body: payload });
    return mapComponent(dto);
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) {
      throw new ComponentValidationError(
        mapComponentFieldErrors(error.fields, error.message, { usedDatasheetFile: Boolean(input.datasheetFile) })
      );
    }
    throw error;
  }
}

/** Archive hides a component from the catalog; restore brings it back. FR-1.2. */
export async function setComponentArchived(componentId, archived) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Archiving demo components is not supported.');
  }

  const action = archived ? 'archive' : 'restore';
  const dto = await apiRequest(`library/components/${encodeURIComponent(componentId)}/${action}/`, { method: 'POST' });
  return mapComponent(dto?.data || dto);
}

export async function saveComponent(input) {
  if (APP_CONFIG.mode !== 'demo') {
    return saveComponentLive(input);
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
