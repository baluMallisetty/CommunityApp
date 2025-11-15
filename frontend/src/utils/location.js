export const formatAddress = (details = {}) => {
  if (!details) return '';
  const streetLine = [details.streetNumber, details.street].filter(Boolean).join(' ').trim();
  const name = details.name && details.name !== streetLine ? details.name : null;
  const parts = [
    name,
    streetLine || (!name && details.name ? details.name : null),
    details.district,
    details.city,
    details.region,
    details.postalCode,
    details.country,
  ].filter((part) => part && String(part).trim().length);
  return parts.join(', ');
};

export const describeLocation = (location) => {
  if (!location) return '';
  if (location.address) return location.address;
  if (
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
  ) {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
  return '';
};
