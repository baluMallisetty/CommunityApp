import { Platform } from 'react-native';
import * as Location from 'expo-location';

const DEFAULT_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

const NOMINATIM_ENDPOINT =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_NOMINATIM_ENDPOINT) ||
  DEFAULT_NOMINATIM_ENDPOINT;

const GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACES_DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_PLACES_API_KEY =
  typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY : null;

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

const getAddressComponentValue = (components = [], types, key = 'long_name') => {
  if (!Array.isArray(components)) return null;
  const typeList = Array.isArray(types) ? types : [types];
  const match = components.find((component) =>
    typeList.some((type) => component.types?.includes?.(type))
  );
  return match ? match[key] || null : null;
};

const toExpoLikeGoogleResult = (result, fallbackAddress) => {
  if (!result) return null;
  const location = result.geometry?.location || {};
  const components = result.address_components || [];

  const latitude = typeof location.lat === 'number' ? location.lat : null;
  const longitude = typeof location.lng === 'number' ? location.lng : null;
  if (latitude == null || longitude == null) return null;

  const streetNumber = getAddressComponentValue(components, 'street_number');
  const street = getAddressComponentValue(components, 'route');
  const district = getAddressComponentValue(
    components,
    ['sublocality_level_1', 'sublocality', 'neighborhood']
  );
  const city =
    getAddressComponentValue(components, ['locality', 'postal_town']) ||
    getAddressComponentValue(components, 'administrative_area_level_2');
  const region = getAddressComponentValue(components, 'administrative_area_level_1');
  const postalCode = getAddressComponentValue(components, 'postal_code');
  const country = getAddressComponentValue(components, 'country');
  const countryCode = getAddressComponentValue(components, 'country', 'short_name');

  const name = result.formatted_address || fallbackAddress || null;

  return {
    latitude,
    longitude,
    streetNumber,
    street,
    name,
    district,
    city,
    region,
    postalCode,
    country,
    countryCode,
  };
};

const fetchGooglePlaceDetails = async (placeId) => {
  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_PLACES_API_KEY,
    fields: 'geometry/location,formatted_address,address_component',
  });
  const response = await fetch(`${GOOGLE_PLACES_DETAILS_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google Places details request failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (payload.status !== 'OK') {
    throw new Error(payload.error_message || `Google Places details failed (${payload.status})`);
  }
  return payload.result;
};

const geocodeWithGooglePlaces = async (query, { countryCodes } = {}) => {
  const params = new URLSearchParams({
    input: query,
    key: GOOGLE_PLACES_API_KEY,
    types: 'address',
  });
  if (countryCodes?.length) {
    const components = countryCodes.map((code) => `country:${code.toLowerCase()}`).join('|');
    params.append('components', components);
  }
  const response = await fetch(`${GOOGLE_PLACES_AUTOCOMPLETE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google Places autocomplete failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (payload.status === 'ZERO_RESULTS') {
    return [];
  }
  if (payload.status !== 'OK') {
    throw new Error(payload.error_message || `Google Places autocomplete failed (${payload.status})`);
  }

  const predictions = (payload.predictions || []).slice(0, 5);
  const detailedResults = await Promise.all(
    predictions.map(async (prediction) => {
      try {
        const details = await fetchGooglePlaceDetails(prediction.place_id);
        return { prediction, details };
      } catch (err) {
        console.warn('Failed to load Google place details', err);
        return null;
      }
    })
  );

  return detailedResults
    .filter(Boolean)
    .map(({ prediction, details }) => toExpoLikeGoogleResult(details, prediction?.description))
    .filter(Boolean);
};

export async function geocodeAddress(query, { countryCodes } = {}) {
  if (GOOGLE_PLACES_API_KEY) {
    return geocodeWithGooglePlaces(query, { countryCodes });
  }

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
