function normaliseText(value) {
  return String(value || '').trim();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function validateComponent(component, { existingComponents = [], categories = [], units = [] } = {}) {
  const errors = {};
  const name = normaliseText(component.name);
  const partNumber = normaliseText(component.partNumber);
  const minimumQuantity = component.minimumQuantity ?? 0;
  const lastBuyingPrice = component.lastBuyingPrice ?? 0;
  const deliveryCharge = component.deliveryCharge ?? 0;

  if (!name) {
    errors.name = 'Component name is required.';
  }
  if (!component.categoryId || (categories.length && !categories.some((category) => category.id === component.categoryId))) {
    errors.categoryId = 'Choose a valid category.';
  }
  if (!component.unitId || !units.some((unit) => unit.id === component.unitId)) {
    errors.unitId = 'Choose a valid unit.';
  }
  if (partNumber && existingComponents.some((item) => String(item.partNumber || '').toLowerCase() === partNumber.toLowerCase() && item.id !== component.id)) {
    errors.partNumber = 'This part number is already used by another component.';
  }
  if (!isFiniteNumber(minimumQuantity) || Number(minimumQuantity) < 0) {
    errors.minimumQuantity = 'Minimum quantity must be zero or greater.';
  }
  if (!isFiniteNumber(lastBuyingPrice) || Number(lastBuyingPrice) < 0) {
    errors.lastBuyingPrice = 'Buying price must be zero or greater.';
  }
  if (!isFiniteNumber(deliveryCharge) || Number(deliveryCharge) < 0) {
    errors.deliveryCharge = 'Delivery charge must be zero or greater.';
  }
  if (component.datasheetUrl) {
    try {
      new URL(component.datasheetUrl);
    } catch {
      errors.datasheetUrl = 'Enter a valid datasheet URL.';
    }
  }

  return errors;
}

export function validateQuantity(value, { allowFraction = false, availableQuantity = null } = {}) {
  const quantity = Number(value);

  if (!isFiniteNumber(value) || quantity <= 0) {
    return 'Quantity must be greater than zero.';
  }
  if (!allowFraction && !Number.isInteger(quantity)) {
    return 'This unit accepts whole quantities only.';
  }
  if (availableQuantity !== null && quantity > Number(availableQuantity)) {
    return `Quantity cannot exceed the available ${availableQuantity}.`;
  }

  return '';
}

export function validateDrawerAssignment({ componentId, drawer, quantity, allowFraction = false }) {
  const errors = {};

  if (!componentId) {
    errors.componentId = 'Choose a Library component.';
  }
  if (!drawer) {
    errors.drawer = 'Choose a valid drawer.';
  } else if (drawer.componentId && drawer.componentId !== componentId) {
    errors.drawer = 'This drawer already contains a different component.';
  }

  const quantityError = validateQuantity(quantity, { allowFraction });
  if (quantityError) {
    errors.quantity = quantityError;
  }

  return errors;
}

export function hasValidationErrors(errors) {
  return Object.keys(errors).length > 0;
}
