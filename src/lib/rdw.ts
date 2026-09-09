export function parseProbeEndpoint(endpoint: string) {
  const [path, requestUrl] = endpoint.split('\n');
  return {
    path: path || endpoint,
    requestUrl: requestUrl || '',
  };
}

export function rdwDateToInputDate(value?: string) {
  if (!value) return '';
  if (value.includes('T')) return value.slice(0, 10);
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}
