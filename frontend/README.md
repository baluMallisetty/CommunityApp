# Community App Frontend

## Configuration

Create a `.env` file in this directory (next to `package.json`) to override runtime configuration for Expo. Copy the defaults and adjust as needed:

```
cp .env.example .env
```

### Geocoding

`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` enables the Google Places-powered address picker. Supply a client-side key with the Places API enabled to get higher quality autocomplete suggestions everywhere (web and native). When the key is missing, the app falls back to Expo's native geocoder on mobile and the OpenStreetMap-backed web implementation described below.

`EXPO_PUBLIC_NOMINATIM_ENDPOINT` controls which Nominatim-compatible endpoint is used when geocoding on the web if a Google Places key is not available. The value defaults to the public OpenStreetMap instance (`https://nominatim.openstreetmap.org/search`) when the variable is not set.
