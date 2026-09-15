import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { mapRequisition, statusCode } from '../api/mappers/requisitions.js';
import { mapComponent, mapUnit } from '../api/mappers/library.js';
import { mapProject } from '../api/mappers/projects.js';
import { getCurrentUser } from '../api/tokens.js';
import { canDecideRequisitions } from './permission-service.js';
import { getDemoState, updateDemoState } from '../data/demo-store.js';
import { hasValidationErrors, validateQuantity } from '../utils/validation.js';

const statusTransitions = Object.freeze({
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Ordered', 'Cancelled'],
  Ordered: ['Received', 'Cancelled'],
  Received: [],
  Rejected: [],
  Cancelled: []
});

export class RequisitionValidationError extends Error {
  constructor(errors) {
    super('Requisition validation failed.');
    this.name = 'RequisitionValidationError';
    this.errors = errors;
  }
}

function requireDemoMode() {
  if (APP_CONFIG.mode !== 'demo') throw new Error('Requisition API integration is not configured yet.');
}

function addAuditEvent(state, { entity, action, summary }) {
  state.auditLog.push({
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    entity,
    action,
    summary,
    actorId: 'user-admin',
    timestamp: new Date().toISOString()
  });
}

function getReferences(state) {
  return {
    componentsById: new Map(state.components.map((component) => [component.id, component])),
    unitsById: new Map(state.units.map((unit) => [unit.id, unit])),
    projectsById: new Map(state.projects.map((project) => [project.id, project])),
    usersById: new Map(state.users.map((user) => [user.id, user]))
  };
}

function decorateRequisition(requisition, references) {
  const statusUpdatedOn = requisition.statusHistory[requisition.statusHistory.length - 1]?.timestamp || requisition.createdOn;
  const daysInStatus = Math.max(0, Math.floor((Date.now() - new Date(statusUpdatedOn).getTime()) / 86400000));
  return {
    ...requisition,
    component: requisition.componentId ? references.componentsById.get(requisition.componentId) : null,
    unit: references.unitsById.get(requisition.unitId),
    project: requisition.projectId ? references.projectsById.get(requisition.projectId) : null,
    requester: references.usersById.get(requisition.requesterId),
    daysInStatus,
    statusUpdatedOn
  };
}

export async function getRequisitionReferenceData() {
  if (APP_CONFIG.mode !== 'demo') {
    const [components, units, projects] = await Promise.all([
      apiList('library/components/', { params: { ordering: 'name', page_size: 100 } }),
      apiList('library/units/', { params: { page_size: 100 } }),
      apiList('projects/', { params: { status: 'ACTIVE', ordering: 'name', page_size: 100 } })
    ]);
    return {
      components: components.items.map(mapComponent),
      units: units.items.map(mapUnit),
      projects: projects.items.map(mapProject)
    };
  }

  requireDemoMode();
  const state = getDemoState();
  return {
    components: state.components,
    units: state.units,
    projects: state.projects.filter((project) => project.status === 'Active')
  };
}

export async function listRequisitions({ status = 'all' } = {}) {
  if (APP_CONFIG.mode !== 'demo') {
    const { items } = await apiList('requisitions/', {
      params: { status: status === 'all' ? '' : statusCode(status), ordering: '-created_at', page_size: 100 }
    });
    return items.map(mapRequisition);
  }

  requireDemoMode();
  const state = getDemoState();
  const references = getReferences(state);
  return state.requisitions
    .filter((requisition) => status === 'all' || requisition.status === status)
    .map((requisition) => decorateRequisition(requisition, references))
    .sort((first, second) => new Date(second.createdOn) - new Date(first.createdOn));
}

export async function getRequisition(requisitionId) {
  if (APP_CONFIG.mode !== 'demo') {
    try {
      return mapRequisition(await apiRequest(`requisitions/${encodeURIComponent(requisitionId)}/`));
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  requireDemoMode();
  const state = getDemoState();
  const requisition = state.requisitions.find((item) => item.id === requisitionId);
  return requisition ? decorateRequisition(requisition, getReferences(state)) : null;
}

export async function createRequisition(input) {
  if (APP_CONFIG.mode !== 'demo') return createRequisitionLive(input);

  requireDemoMode();
  const state = getDemoState();
  const references = getReferences(state);
  const component = input.componentId ? references.componentsById.get(input.componentId) : null;
  const unit = references.unitsById.get(input.unitId);
  const project = input.projectId ? references.projectsById.get(input.projectId) : null;
  const errors = {};
  const freeTextPartName = String(input.freeTextPartName || '').trim();

  if (!component && !freeTextPartName) errors.componentId = 'Choose a Library component or enter the requested part name.';
  if (input.componentId && !component) errors.componentId = 'Choose a valid Library component.';
  if (!unit) errors.unitId = 'Choose a valid unit.';
  if (component && unit && component.unitId !== unit.id) errors.unitId = 'Use the Library component’s configured unit.';
  const quantityError = validateQuantity(input.quantity, { allowFraction: Boolean(unit?.allowFraction) });
  if (quantityError) errors.quantity = quantityError;
  if (input.projectId && (!project || project.status !== 'Active')) errors.projectId = 'Choose an active Project or leave this blank.';
  if (input.neededBy && Number.isNaN(new Date(input.neededBy).getTime())) errors.neededBy = 'Enter a valid needed-by date.';
  if (hasValidationErrors(errors)) throw new RequisitionValidationError(errors);

  let createdId;
  updateDemoState((nextState) => {
    const now = new Date().toISOString();
    const nextNumber = nextState.requisitions.reduce((highest, requisition) => Math.max(highest, Number(requisition.id.replace('REQ-', '')) || 0), 0) + 1;
    createdId = `REQ-${String(nextNumber).padStart(4, '0')}`;
    nextState.requisitions.push({
      id: createdId,
      componentId: component?.id || null,
      freeTextPartName: component ? '' : freeTextPartName,
      quantity: Number(input.quantity),
      unitId: input.unitId,
      projectId: input.projectId || null,
      neededBy: input.neededBy || '',
      note: String(input.note || '').trim(),
      requesterId: 'user-admin',
      createdOn: now,
      status: 'Pending',
      statusHistory: [{ fromStatus: null, toStatus: 'Pending', note: 'Requisition raised.', actorId: 'user-admin', timestamp: now }]
    });
    addAuditEvent(nextState, { entity: 'Requisition', action: 'Created', summary: `${createdId} was raised.` });
    return nextState;
  });
  return getRequisition(createdId);
}

export async function updateRequisitionStatus({ requisitionId, status, note = '' }) {
  if (APP_CONFIG.mode !== 'demo') {
    const target = statusCode(status);
    // Receiving adds stock, so it has its own endpoint and its own screen.
    if (target === 'RECEIVED') {
      throw new RequisitionValidationError({ status: 'Use Receive to add the delivered stock.' });
    }

    try {
      const payload = await apiRequest(`requisitions/${encodeURIComponent(requisitionId)}/transition/`, {
        method: 'POST',
        body: { status: target, note: String(note || '').trim() }
      });
      return mapRequisition(payload?.data || payload);
    } catch (error) {
      if (error?.name === 'ApiRequestError' && (error.isValidationError || error.isPermissionError)) {
        throw new RequisitionValidationError({ status: error.fields.status || error.message });
      }
      throw error;
    }
  }

  requireDemoMode();
  const state = getDemoState();
  const requisition = state.requisitions.find((item) => item.id === requisitionId);
  const errors = {};
  if (!requisition) errors.requisitionId = 'Requisition was not found.';
  if (requisition && !statusTransitions[requisition.status].includes(status)) errors.status = `Cannot change ${requisition.status} to ${status}.`;
  if (hasValidationErrors(errors)) throw new RequisitionValidationError(errors);

  updateDemoState((nextState) => {
    const target = nextState.requisitions.find((item) => item.id === requisitionId);
    const previousStatus = target.status;
    const now = new Date().toISOString();
    target.status = status;
    target.statusHistory.push({ fromStatus: previousStatus, toStatus: status, note: String(note || '').trim(), actorId: 'user-admin', timestamp: now });
    addAuditEvent(nextState, { entity: 'Requisition', action: 'Status changed', summary: `${requisitionId}: ${previousStatus} changed to ${status}.` });
    return nextState;
  });
  return getRequisition(requisitionId);
}

/**
 * Which statuses this requisition may move to next, for the signed-in user.
 *
 * The server's `allowed_transitions` answers "what can happen to this
 * requisition from its current status" — it is not scoped to the reader. The
 * rule the transition endpoint actually enforces (FR-4.x) is: Admins may make
 * any of those moves; anyone else may only cancel their **own pending**
 * requisition. Offering more than that would only earn a 403, so the list is
 * narrowed here to match. The server stays the authority either way.
 */
export function getAllowedRequisitionStatuses(statusOrRequisition) {
  if (!statusOrRequisition || typeof statusOrRequisition !== 'object') {
    return statusTransitions[statusOrRequisition] || [];
  }

  const allowed = statusOrRequisition.allowedTransitions || [];
  if (canDecideRequisitions()) return allowed;

  const signedIn = getCurrentUser();
  const signedInId = String(signedIn?.id ?? signedIn?.pk ?? '');
  const isOwnPending = Boolean(signedInId)
    && String(statusOrRequisition.requester?.id ?? '') === signedInId
    && statusOrRequisition.status === 'Pending';

  return isOwnPending ? allowed.filter((status) => status === 'Cancelled') : [];
}

async function createRequisitionLive(input) {
  const errors = {};
  const freeTextPartName = String(input.freeTextPartName || '').trim();
  const quantity = Number(input.quantity);

  if (!input.componentId && !freeTextPartName) {
    errors.componentId = 'Choose a Library component or enter the requested part name.';
  }
  if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'Enter a quantity greater than zero.';
  if (!input.componentId && !input.unitId) errors.unitId = 'Choose a unit for the requested part.';
  if (hasValidationErrors(errors)) throw new RequisitionValidationError(errors);

  const body = {
    quantity: String(input.quantity),
    reason: String(input.note || '').trim()
  };
  if (input.componentId) body.component = input.componentId;
  else body.requested_part_name = freeTextPartName;
  if (input.unitId) body.unit = input.unitId;
  if (input.projectId) body.project = input.projectId;
  if (input.neededBy) body.needed_by = input.neededBy;

  try {
    const payload = await apiRequest('requisitions/', { method: 'POST', body });
    return mapRequisition(payload?.data || payload);
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) {
      const fields = error.fields || {};
      throw new RequisitionValidationError({
        componentId: fields.component || fields.requested_part_name || '',
        quantity: fields.quantity || '',
        unitId: fields.unit || '',
        projectId: fields.project || '',
        neededBy: fields.needed_by || '',
        note: fields.reason || '',
        status: Object.keys(fields).length ? '' : error.message
      });
    }
    throw error;
  }
}

/**
 * Receiving is the only transition that changes stock: the delivered quantity
 * lands in a chamber, so it needs a location and, for a free-text request, the
 * category that the new Library component will be created under.
 */
export async function receiveRequisition({ requisitionId, locationCode, quantity, unitPrice = '', deliveryCharge = '', note = '', categoryId = '' }) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Receiving requisitions is only available against the backend.');
  }

  const errors = {};
  if (!locationCode) errors.locationCode = 'Choose the chamber the stock goes into.';
  if (!(Number(quantity) > 0)) errors.quantity = 'Enter the delivered quantity.';
  if (hasValidationErrors(errors)) throw new RequisitionValidationError(errors);

  const body = { location: locationCode, quantity: String(quantity), note: String(note || '').trim() };
  if (unitPrice !== '') body.unit_price = String(unitPrice);
  if (deliveryCharge !== '') body.delivery_charge = String(deliveryCharge);
  if (categoryId) body.category = categoryId;

  try {
    const payload = await apiRequest(`requisitions/${encodeURIComponent(requisitionId)}/receive/`, { method: 'POST', body });
    return mapRequisition(payload?.data || payload);
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) {
      const fields = error.fields || {};
      throw new RequisitionValidationError({
        locationCode: fields.location || '',
        quantity: fields.quantity || '',
        categoryId: fields.category || '',
        status: Object.keys(fields).length ? '' : error.message
      });
    }
    throw error;
  }
}
