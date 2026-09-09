import { APP_CONFIG } from '../config.js';
import { getDemoState } from '../data/demo-store.js';

export async function listProjects({ activeOnly = false } = {}) {
  if (APP_CONFIG.mode === 'demo') {
    const projects = getDemoState().projects;
    return activeOnly ? projects.filter((project) => project.status === 'Active') : projects;
  }

  throw new Error('Project API integration is not configured yet.');
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
