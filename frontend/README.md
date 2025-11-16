# Community App Frontend

## Configuration

Create a `.env` file in this directory (next to `package.json`) to override runtime configuration for Expo. Copy the defaults and adjust as needed:

```
cp .env.example .env
```

### API & tenants

`EXPO_PUBLIC_API_BASE_URL` points the mobile/web bundle at your backend. It defaults to `http://localhost:3001` for local development (use `http://10.0.2.2:3001` on the Android emulator). `EXPO_PUBLIC_TENANT_ID` must match the backend's `DEFAULT_TENANT_ID` (see `backend/.env.example`).

### Social login

* `EXPO_PUBLIC_GOOGLE_CLIENT_ID` must be set to the OAuth client you created in the Google Cloud console. Use the same ID on the backend via `GOOGLE_CLIENT_ID`.
* `EXPO_PUBLIC_FACEBOOK_APP_ID` should match your Meta app's ID and line up with the backend `FACEBOOK_APP_ID/FACEBOOK_APP_SECRET` pair.

### Geocoding

`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` enables the Google Places-powered address picker. Supply a client-side key with the Places API enabled to get higher quality autocomplete suggestions everywhere (web and native). When the key is missing, the app falls back to Expo's native geocoder on mobile and the OpenStreetMap-backed web implementation described below.

`EXPO_PUBLIC_NOMINATIM_ENDPOINT` controls which Nominatim-compatible endpoint is used when geocoding on the web if a Google Places key is not available. The value defaults to the public OpenStreetMap instance (`https://nominatim.openstreetmap.org/search`) when the variable is not set.
