import { createDemoState } from './demo-data.js';

const STORAGE_KEY = 'inventory-demo-state-v1';
const memoryStorage = new Map();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return {
    getItem: (key) => memoryStorage.get(key) || null,
    setItem: (key, value) => memoryStorage.set(key, value),
    removeItem: (key) => memoryStorage.delete(key)
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidState(value) {
  return value && Array.isArray(value.components) && Array.isArray(value.cabinets) && Array.isArray(value.projects);
}

function upgradeState(value) {
  const upgraded = clone(value);
  const seed = createDemoState();
  if (!Array.isArray(upgraded.requisitions)) upgraded.requisitions = seed.requisitions;
  if (!Array.isArray(upgraded.auditLog)) upgraded.auditLog = seed.auditLog;
  upgraded.components = upgraded.components.map((component) => ({
    ...component,
    image: component.image || null,
    createdOn: component.createdOn || seed.metadata.seededAt,
    updatedOn: component.updatedOn || component.createdOn || seed.metadata.seededAt
  }));
  upgraded.metadata = { ...upgraded.metadata, schemaVersion: seed.metadata.schemaVersion };
  return upgraded;
}

function notifyStoreChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('inventory:demo-store-change'));
  }
}

function readState() {
  const storedValue = getStorage().getItem(STORAGE_KEY);

  if (storedValue) {
    try {
      const parsedValue = JSON.parse(storedValue);
      if (isValidState(parsedValue)) {
        const upgradedState = upgradeState(parsedValue);
        getStorage().setItem(STORAGE_KEY, JSON.stringify(upgradedState));
        return upgradedState;
      }
    } catch {
      // A damaged demo record is safely replaced with a new seed below.
    }
  }

  const freshState = createDemoState();
  getStorage().setItem(STORAGE_KEY, JSON.stringify(freshState));
  return freshState;
}

function writeState(nextState) {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(nextState));
  notifyStoreChange();
  return clone(nextState);
}

export function getDemoState() {
  return clone(readState());
}

export function resetDemoState() {
  return writeState(createDemoState());
}

export function updateDemoState(updater) {
  const nextState = clone(readState());
  const updatedState = updater(nextState) || nextState;

  if (!isValidState(updatedState)) {
    throw new Error('The demo store received an invalid state update.');
  }

  return writeState(updatedState);
}

export function subscribeToDemoStore(listener) {
  const eventName = 'inventory:demo-store-change';
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
