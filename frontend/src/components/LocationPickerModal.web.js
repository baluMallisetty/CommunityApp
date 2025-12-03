// LocationPickerModal.web.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ExpoLocation from 'expo-location';

import Button from '../ui/Button';
import { geocodeAddress } from '../utils/geocoding';
import { describeLocation, formatAddress } from '../utils/location';

const defaultRegion = {
  latitude: 27.95,
  longitude: -82.46,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/** Leaflet loading */
const LEAFLET_JS_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletLoaderPromise = null;

function ensureLeafletLoaded() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Interactive maps require a browser environment.'));
  }

  if (window.L) return Promise.resolve(window.L);
  if (leafletLoaderPromise) return leafletLoaderPromise;

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const handleLoad = () => {
      if (window.L) resolve(window.L);
      else {
        leafletLoaderPromise = null;
        reject(new Error('Map library failed to initialize.'));
      }
    };

    const handleError = () => {
      leafletLoaderPromise = null;
      reject(new Error('Unable to load map library.'));
    };

    const scriptId = 'leaflet-js';
    const styleId = 'leaflet-css';

    if (!document.getElementById(styleId)) {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS_HREF;
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = LEAFLET_JS_SRC;
      script.async = true;
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.body.appendChild(script);
    }
  });

  return leafletLoaderPromise;
}

export default function LocationPickerModal({ visible, initialLocation, onSelect, onClose }) {
  const [selected, setSelected] = useState(initialLocation || null);
  const [selectedAddress, setSelectedAddress] = useState(initialLocation?.address || '');
  const [query, setQuery] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Leaflet map state
  const [webMapContainer, setWebMapContainer] = useState(null);
  const [webMapLoading, setWebMapLoading] = useState(false);
  const [webMapError, setWebMapError] = useState('');
  const [webMapReady, setWebMapReady] = useState(false);

  const mapRef = useRef(null);
  const markerRef = useRef(null);

  /** Reset when reopened */
  useEffect(() => {
    if (!visible) return;
    setSelected(initialLocation || null);
    setSelectedAddress(initialLocation?.address || '');
    setQuery('');
    setResults([]);
    setError('');
  }, [initialLocation, visible]);

  const region = selected
    ? {
        latitude: selected.latitude,
        longitude: selected.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : defaultRegion;

  /** Initialize Leaflet map */
  useEffect(() => {
    if (!visible || !webMapContainer) return;

    if (mapRef.current) {
      setWebMapReady(true);
      setWebMapLoading(false);
      setWebMapError('');
      return;
    }

    let cancelled = false;
    setWebMapLoading(true);
    setWebMapError('');

    ensureLeafletLoaded()
      .then((L) => {
        if (cancelled || !webMapContainer) return;

        const map = L.map(webMapContainer, {
          zoomControl: true,
          preferCanvas: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        map.on('click', async (event) => {
          const { lat, lng } = event.latlng;
          await handleMapClick({ latitude: lat, longitude: lng });
        });

        mapRef.current = map;
        setWebMapLoading(false);
        setWebMapReady(true);

        setTimeout(() => map.invalidateSize(), 0);
      })
      .catch((err) => {
        if (!cancelled) {
          setWebMapLoading(false);
          setWebMapError(err?.message || 'Failed to load the map.');
          setWebMapReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, webMapContainer]);

  /** Sync marker and view when location changes */
  useEffect(() => {
    if (!webMapReady || !mapRef.current) return;
    const L = window?.L;
    if (!L) return;

    const map = mapRef.current;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const coord = selected || region;
    if (!coord) return;

    const latLng = [coord.latitude, coord.longitude];
    markerRef.current = L.marker(latLng).addTo(map);
    map.setView(latLng, 14);
  }, [webMapReady, selected]);

  /** Search function — US → CA → MX priority */
  const runSearch = useCallback(
    async (text, { showEmptyError = false } = {}) => {
      const trimmed = text.trim();
      if (!trimmed.length) {
        setResults([]);
        setLoading(false);
        if (showEmptyError) setError('Enter an address to search.');
        else setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const raw = await geocodeAddress(trimmed, {
          countryCodes: ['us', 'ca', 'mx'],
        });

        const normalized = raw.map((item, index) => ({
          id: `${item.latitude}-${item.longitude}-${index}`,
          latitude: item.latitude,
          longitude: item.longitude,
          address: formatAddress(item) || trimmed,
          countryCode: item.countryCode,
        }));

        /** priority sorting */
        const PRIORITY = { us: 1, ca: 2, mx: 3 };
        normalized.sort((a, b) => {
          const pa = PRIORITY[a.countryCode?.toLowerCase()] || 999;
          const pb = PRIORITY[b.countryCode?.toLowerCase()] || 999;
          return pa - pb;
        });

        setResults(normalized);

        if (normalized.length) {
          const first = normalized[0];
          setSelected({ latitude: first.latitude, longitude: first.longitude });
          setSelectedAddress(first.address);
        } else {
          setSelected(null);
          setSelectedAddress('');
          setError('No matches found. Try another search.');
        }
      } catch (err) {
        console.warn('Failed to geocode query', err);
        setResults([]);
        setError('Unable to find that address.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /** Search when button pressed */
  const handleSearch = () => runSearch(query, { showEmptyError: true });

  /** 🔥 AUTO SEARCH WHILE TYPING (400ms debounce) */
  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (!trimmed.length) {
      setResults([]);
      setError('');
      return;
    }

    const timeout = setTimeout(() => {
      runSearch(query);
    }, 400);

    return () => clearTimeout(timeout);
  }, [query, runSearch, visible]);

  /** Map click → reverse geocode */
  const handleMapClick = async (coordinate) => {
    setSelected(coordinate);
    try {
      const geo = await ExpoLocation.reverseGeocodeAsync(coordinate);
      if (geo?.length) {
        const formatted = formatAddress(geo[0]);
        setSelectedAddress(formatted);
      } else setSelectedAddress('');
    } catch {
      setSelectedAddress('');
    }
  };

  const handleResultPress = (item) => {
    setSelected(item);
    setSelectedAddress(item.address);
  };

  const handleSelect = () => {
    if (!selected) {
      setError('Please pick a location.');
      return;
    }
    onSelect({ ...selected, address: selectedAddress });
    onClose();
  };

  const renderResult = ({ item }) => {
    const selectedMatch =
      selected &&
      selected.latitude === item.latitude &&
      selected.longitude === item.longitude;

    return (
      <TouchableOpacity
        onPress={() => handleResultPress(item)}
        style={[styles.resultItem, selectedMatch && styles.resultItemSelected]}
      >
        <Text style={[styles.resultText, selectedMatch && styles.resultTextSelected]}>
          {item.address}
        </Text>
        <Text style={styles.resultMeta}>
          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* SEARCH BOX */}
        <View style={styles.searchSection}>
          <Text style={styles.heading}>Find an address</Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by address, city, or ZIP"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />

          <Button title="Search" onPress={handleSearch} style={{ marginTop: 8 }} />

          {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {selected && (
            <View style={styles.selectedSummary}>
              <Text style={styles.selectedLabel}>Selected</Text>
              <Text style={styles.selectedValue}>
                {describeLocation({ ...selected, address: selectedAddress })}
              </Text>
            </View>
          )}
        </View>

        {/* MAP */}
        <View style={{ height: 220 }}>
          <View ref={setWebMapContainer} style={{ flex: 1 }} />

          {webMapLoading && (
            <View style={styles.mapOverlay}>
              <ActivityIndicator />
              <Text style={styles.overlayText}>Loading map…</Text>
            </View>
          )}

          {webMapError && (
            <View style={styles.mapOverlay}>
              <Text style={styles.overlayText}>{webMapError}</Text>
            </View>
          )}
        </View>

        {/* RESULTS */}
        <View style={styles.resultsSection}>
          <Text style={styles.resultsHeading}>Results</Text>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              !loading && <Text style={styles.emptyText}>Start typing to search…</Text>
            }
          />
        </View>

        {/* FOOTER BUTTONS */}
        <View style={styles.footer}>
          <Button title="Cancel" onPress={onClose} style={{ flex: 1, marginRight: 8 }} />
          <Button title="Use Location" onPress={handleSelect} style={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

/** Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  errorText: { color: '#DC2626', marginTop: 8 },
  selectedSummary: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9FAFB',
  },
  selectedLabel: { fontWeight: '600', marginBottom: 4 },
  selectedValue: { color: '#111827' },

  resultsSection: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  resultsHeading: { fontWeight: '600', marginBottom: 8 },

  resultItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  resultItemSelected: {
    borderColor: '#16A34A',
    backgroundColor: '#ECFDF5',
  },
  resultText: { color: '#111827', fontWeight: '600', marginBottom: 4 },
  resultTextSelected: { color: '#166534' },
  resultMeta: { color: '#6B7280', fontSize: 12 },

  emptyText: { color: '#6B7280', fontStyle: 'italic', marginTop: 16 },

  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },

  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  overlayText: { marginTop: 8, color: '#374151' },
});
