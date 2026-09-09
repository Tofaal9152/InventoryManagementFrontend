export function formatQuantity(value, unitSymbol = '') {
  const formattedValue = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3
  }).format(Number(value) || 0);

  return unitSymbol ? `${formattedValue} ${unitSymbol}` : formattedValue;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka'
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka'
  }).format(new Date(value));
}
