import { getDemoState, resetDemoState } from '../data/demo-store.js';

export async function initialiseDemoSession() {
  const state = getDemoState();
  return {
    componentCount: state.components.length,
    cabinetCount: state.cabinets.length,
    projectCount: state.projects.length
  };
}

export async function resetDemoSession() {
  return resetDemoState();
}
