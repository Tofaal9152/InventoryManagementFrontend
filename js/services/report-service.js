import { getDemoState } from '../data/demo-store.js';
import { listComponents } from './component-service.js';
import { getInventoryWorkspace } from './inventory-service.js';
import { listProjectSummaries } from './project-service.js';

export async function getDashboardData() {
  const [components, workspace] = await Promise.all([listComponents(), getInventoryWorkspace()]);
  const state = getDemoState();
  const totalStock = components.reduce((total, component) => total + component.totalQuantity, 0);
  const totalValue = components.reduce((total, component) => total + component.totalQuantity * component.lastBuyingPrice, 0);
  const drawers = workspace.cabinets.flatMap((cabinet) => cabinet.drawers);
  const recentMovements = state.movements.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
  const componentsById = new Map(components.map((component) => [component.id, component]));
  return {
    componentCount: components.length,
    totalStock,
    totalValue,
    lowStockCount: components.filter((component) => component.stockState === 'low').length,
    outOfStockCount: components.filter((component) => component.stockState === 'out').length,
    pendingRequisitionCount: state.requisitions.filter((requisition) => requisition.status === 'Pending').length,
    drawerUtilisation: drawers.length ? Math.round(drawers.filter((drawer) => drawer.componentId).length / drawers.length * 100) : 0,
    recentMovements: recentMovements.map((movement) => ({ ...movement, component: componentsById.get(movement.componentId) }))
  };
}

export async function getReportsData() {
  const [components, workspace, projects] = await Promise.all([listComponents(), getInventoryWorkspace(), listProjectSummaries()]);
  const state = getDemoState();
  const drawers = workspace.cabinets.flatMap((cabinet) => cabinet.drawers.map((drawer) => ({ ...drawer, cabinetName: cabinet.name })));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const drawerLabels = new Map(drawers.map((drawer) => [drawer.id, `${drawer.cabinetName} · ${drawer.code}`]));
  return {
    currentStock: components,
    lowStock: components.filter((component) => component.stockState === 'low' || component.stockState === 'out'),
    projectConsumption: projects.filter((project) => project.takeCount),
    movements: state.movements.slice().sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp)).map((movement) => ({
      ...movement,
      component: componentsById.get(movement.componentId),
      location: movement.type === 'Transfer'
        ? `${drawerLabels.get(movement.sourceDrawerId) || 'Unknown drawer'} to ${drawerLabels.get(movement.destinationDrawerId) || 'Unknown drawer'}`
        : drawerLabels.get(movement.destinationDrawerId || movement.sourceDrawerId) || 'Unknown drawer'
    })),
    drawerUtilisation: { occupied: drawers.filter((drawer) => drawer.componentId).length, empty: drawers.filter((drawer) => !drawer.componentId).length, total: drawers.length }
  };
}
