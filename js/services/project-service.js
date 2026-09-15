import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { mapMovement } from '../api/mappers/library.js';
import { mapProject, mapProjectDetails, mapProjectSummary } from '../api/mappers/projects.js';
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

  const { items } = await apiList('projects/', {
    params: { status: activeOnly ? 'ACTIVE' : '', ordering: 'name', page_size: 100 }
  });
  return items.map(mapProject);
}

export async function createProject({ name, description = '', status = 'Active' }) {
  if (APP_CONFIG.mode !== 'demo') {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new ProjectValidationError({ name: 'Project name is required.' });

    try {
      const dto = await apiRequest('projects/', {
        method: 'POST',
        body: { name: trimmed, description: String(description || '').trim() }
      });
      return mapProject(dto);
    } catch (error) {
      if (error?.name === 'ApiRequestError' && error.isValidationError) {
        throw new ProjectValidationError({
          name: error.fields.name || error.message,
          description: error.fields.description || ''
        });
      }
      throw error;
    }
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
  if (APP_CONFIG.mode !== 'demo') {
    // The list rows carry no consumption, so each card's spend comes from its detail.
    const { items } = await apiList('projects/', { params: { ordering: 'name', page_size: 100 } });
    return Promise.all(items.map(async (item) => {
      try {
        return mapProjectSummary(await apiRequest(`projects/${encodeURIComponent(item.id)}/`));
      } catch {
        return { ...mapProject(item), takeCount: 0, estimatedValue: 0 };
      }
    }));
  }

  const state = getDemoState();
  const componentsById = new Map(state.components.map((component) => [component.id, component]));
  return state.projects.map((project) => {
    const takes = state.movements.filter((movement) => movement.type === 'Take' && movement.projectId === project.id);
    const estimatedValue = takes.reduce((total, movement) => total + (componentsById.get(movement.componentId)?.lastBuyingPrice || 0) * movement.quantity, 0);
    return { ...project, takeCount: takes.length, estimatedValue };
  });
}

export async function getProjectDetails(projectId) {
  if (APP_CONFIG.mode !== 'demo') {
    let dto;
    try {
      dto = await apiRequest(`projects/${encodeURIComponent(projectId)}/`);
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }

    // Project activity is the movements taken against it.
    let movements = [];
    try {
      const page = await apiList('inventory/movements/', { params: { project: projectId, page_size: 25 } });
      movements = page.items.map(mapMovement);
    } catch {
      movements = [];
    }

    return { ...mapProjectDetails(dto), movements };
  }

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

/** Closing a project keeps its history but stops new Takes against it. */
export async function setProjectClosed(projectId, closed) {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Closing demo projects is not supported.');
  }

  const action = closed ? 'close' : 'reopen';
  const dto = await apiRequest(`projects/${encodeURIComponent(projectId)}/${action}/`, { method: 'POST' });
  return mapProject(dto?.data || dto);
}
