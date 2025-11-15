# Community App Frontend

## Configuration

Create a `.env` file in this directory (next to `package.json`) to override runtime configuration for Expo. Copy the defaults and adjust as needed:

```
cp .env.example .env
```

### Geocoding endpoint

`EXPO_PUBLIC_NOMINATIM_ENDPOINT` controls which Nominatim-compatible endpoint is used when geocoding on the web. The value defaults to the public OpenStreetMap instance (`https://nominatim.openstreetmap.org/search`) when the variable is not set.
