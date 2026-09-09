import { APP_CONFIG } from '../config.js';
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
  requireDemoMode();
  const state = getDemoState();
  return {
    components: state.components,
    units: state.units,
    projects: state.projects.filter((project) => project.status === 'Active')
  };
}

export async function listRequisitions({ status = 'all' } = {}) {
  requireDemoMode();
  const state = getDemoState();
  const references = getReferences(state);
  return state.requisitions
    .filter((requisition) => status === 'all' || requisition.status === status)
    .map((requisition) => decorateRequisition(requisition, references))
    .sort((first, second) => new Date(second.createdOn) - new Date(first.createdOn));
}

export async function getRequisition(requisitionId) {
  requireDemoMode();
  const state = getDemoState();
  const requisition = state.requisitions.find((item) => item.id === requisitionId);
  return requisition ? decorateRequisition(requisition, getReferences(state)) : null;
}

export async function createRequisition(input) {
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

export function getAllowedRequisitionStatuses(status) {
  return statusTransitions[status] || [];
}
