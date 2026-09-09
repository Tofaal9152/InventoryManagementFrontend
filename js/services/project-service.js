import { APP_CONFIG } from '../config.js';
import { getDemoState, updateDemoState } from '../data/demo-store.js';

export class ProjectValidationError extends Error {
  constructor(errors) {
    super('Project validation failed.');
    this.name = 'ProjectValidationError';
    this.errors = errors;
  }
}

function createProjectId() {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

export async function listProjects({ activeOnly = false } = {}) {
  if (APP_CONFIG.mode === 'demo') {
    const projects = getDemoState().projects;
    return activeOnly ? projects.filter((project) => project.status === 'Active') : projects;
  }

  throw new Error('Project API integration is not configured yet.');
}

export async function createProject({ name, description = '', status = 'Active' }) {
  if (APP_CONFIG.mode !== 'demo') {
    throw new Error('Project API integration is not configured yet.');
  }

  const state = getDemoState();
  const normalizedName = String(name || '').trim();
  const normalizedDescription = String(description || '').trim();
  const errors = {};

  if (!normalizedName) {
    errors.name = 'Project name is required.';
  } else if (normalizedName.length > 100) {
    errors.name = 'Project name must be 100 characters or fewer.';
  } else if (state.projects.some((project) => project.name.toLowerCase() === normalizedName.toLowerCase())) {
    errors.name = 'A project with this name already exists.';
  }
  if (normalizedDescription.length > 1000) {
    errors.description = 'Description must be 1000 characters or fewer.';
  }
  if (!['Active', 'Closed'].includes(status)) {
    errors.status = 'Choose a valid project status.';
  }
  if (Object.keys(errors).length) {
    throw new ProjectValidationError(errors);
  }

  const id = createProjectId();
  updateDemoState((nextState) => {
    const now = new Date().toISOString();
    nextState.projects.push({
      id,
      name: normalizedName,
      description: normalizedDescription,
      status,
      createdBy: 'user-admin',
      createdOn: now,
      updatedOn: now
    });
    addAuditEvent(nextState, {
      entity: 'Project',
      action: 'Created',
      summary: `${normalizedName} project was created.`
    });
    return nextState;
  });

  return getProjectDetails(id);
}

export async function listProjectSummaries() {
  if (APP_CONFIG.mode !== 'demo') throw new Error('Project API integration is not configured yet.');

  const state = getDemoState();
  const componentsById = new Map(state.components.map((component) => [component.id, component]));
  return state.projects.map((project) => {
    const takes = state.movements.filter((movement) => movement.type === 'Take' && movement.projectId === project.id);
    const estimatedValue = takes.reduce((total, movement) => total + (componentsById.get(movement.componentId)?.lastBuyingPrice || 0) * movement.quantity, 0);
    return { ...project, takeCount: takes.length, estimatedValue };
  });
}

export async function getProjectDetails(projectId) {
  if (APP_CONFIG.mode !== 'demo') throw new Error('Project API integration is not configured yet.');

  const state = getDemoState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const componentsById = new Map(state.components.map((component) => [component.id, component]));
  const takes = state.movements.filter((movement) => movement.type === 'Take' && movement.projectId === projectId);
  const consumption = new Map();
  takes.forEach((movement) => {
    const component = componentsById.get(movement.componentId);
    const current = consumption.get(movement.componentId) || { component, quantity: 0, estimatedValue: 0 };
    current.quantity += movement.quantity;
    current.estimatedValue += movement.quantity * (component?.lastBuyingPrice || 0);
    consumption.set(movement.componentId, current);
  });

  return {
    ...project,
    consumption: [...consumption.values()],
    movements: takes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  };
}
