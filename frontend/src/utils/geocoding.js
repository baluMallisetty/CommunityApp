import { Platform } from 'react-native';
import * as Location from 'expo-location';

const DEFAULT_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

const NOMINATIM_ENDPOINT =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_NOMINATIM_ENDPOINT) ||
  DEFAULT_NOMINATIM_ENDPOINT;

const pickFirst = (...values) => values.find((value) => !!value && String(value).trim().length);

const toExpoLikeResult = (entry) => ({
  latitude: parseFloat(entry.lat),
  longitude: parseFloat(entry.lon),
  streetNumber: entry.address?.house_number,
  street:
    entry.address?.road ||
    entry.address?.pedestrian ||
    entry.address?.footway ||
    entry.address?.path,
  name: entry.display_name,
  district: pickFirst(entry.address?.suburb, entry.address?.neighbourhood),
  city: pickFirst(
    entry.address?.city,
    entry.address?.town,
    entry.address?.village,
    entry.address?.municipality,
  ),
  region: pickFirst(entry.address?.state, entry.address?.county),
  postalCode: entry.address?.postcode,
  country: entry.address?.country,
  countryCode: entry.address?.country_code?.toUpperCase?.() || null,
});

export async function geocodeAddress(query, { countryCodes } = {}) {
  if (Platform.OS !== 'web') {
    return Location.geocodeAsync(query);
  }

  const params = new URLSearchParams({
    format: 'json',
    limit: '5',
    addressdetails: '1',
    q: query,
  });
  if (countryCodes?.length) {
    params.append('countrycodes', countryCodes.map((code) => code.toLowerCase()).join(','));
  }
  const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CommunityMicrohelp/1.0 (contact@communityapp.local)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Geocoding request failed with status ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(toExpoLikeResult) : [];
}
