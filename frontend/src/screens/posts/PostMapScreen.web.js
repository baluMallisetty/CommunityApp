import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { listPosts } from '../../api';
import { theme } from '../../theme';

const DEFAULT_REGION = {
  latitude: 37.773972,
  longitude: -122.431297,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const LEAFLET_JS_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

let leafletLoaderPromise = null;

function ensureLeafletLoaded() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Interactive maps require a browser environment.'));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletLoaderPromise) {
    return leafletLoaderPromise;
  }

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const handleLoad = () => {
      if (window.L) {
        resolve(window.L);
      } else {
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

function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function formatPriceCandidate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function getListingPrice(post) {
  const candidates = [
    post?.price,
    post?.priceText,
    post?.priceLabel,
    post?.listingPrice,
    post?.cost,
    post?.amount,
    post?.metadata?.price,
    post?.details?.price,
  ];

  for (const candidate of candidates) {
    const formatted = formatPriceCandidate(candidate);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function sanitizeId(value, fallback) {
  const base = typeof value === 'string' ? value : '';
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized) return sanitized;
  return fallback;
}

function createPopupHtml(post, category, color, buttonId) {
  const title = escapeHtml(post?.title || 'Untitled Post');
  const price = escapeHtml(getListingPrice(post) || 'Price unavailable');

  return `
    <div style="display:flex;flex-direction:column;gap:4px;min-width:200px;">
      <div style="font-weight:700;font-size:15px;color:#111827;">${title}</div>
      <div style="font-weight:600;font-size:14px;color:${color};">${price}</div>
      <button id="${buttonId}" style="align-self:flex-start;background-color:${theme.colors.primary};color:#fff;border:none;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">View details</button>
      <div style="font-size:11px;color:${theme.colors.primary};">Click to open listing</div>
    </div>
  `;
}

function computeLeafletZoom(region) {
  if (!region) return 10;
  const latitudeDelta = region.latitudeDelta || DEFAULT_REGION.latitudeDelta;
  const longitudeDelta = region.longitudeDelta || DEFAULT_REGION.longitudeDelta;
  const delta = Math.max(latitudeDelta, longitudeDelta, 0.01);
  const zoom = Math.round(8 - Math.log2(delta));
  return Math.max(2, Math.min(16, zoom));
}

const CATEGORY_PALETTE = [
  '#2563EB',
  '#16A34A',
  '#F59E0B',
  '#DB2777',
  '#7C3AED',
  '#0891B2',
  '#F97316',
  '#0F172A',
];

const RADIUS_OPTIONS = [2, 5, 10, 25, 50];

function extractCoordinate(post) {
  const lat = post?.location?.coordinates?.[1];
  const lng = post?.location?.coordinates?.[0];
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { latitude: lat, longitude: lng };
  }
  return null;
}

function computeRegion(points) {
  if (!points.length) return DEFAULT_REGION;
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  points.forEach(({ latitude, longitude }) => {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  });

  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.05);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.05);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

function normalizeCategory(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'General';
}

function buildCategoryColors(categories) {
  const map = new Map();
  categories.forEach((category, index) => {
    const paletteColor = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
    map.set(category, paletteColor);
  });
  return map;
}

function FilterChip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        selected && styles.chipSelected,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const isWeb = true;

export default function PostMapScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showNearby, setShowNearby] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);
  const [userLocation, setUserLocation] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [webMapContainer, setWebMapContainer] = useState(null);
  const [webMapLoading, setWebMapLoading] = useState(isWeb);
  const [webMapError, setWebMapError] = useState(null);
  const [webMapReady, setWebMapReady] = useState(false);
  const mapInstanceRef = useRef(null);
  const markerLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchText.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchText]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator?.geolocation) {
      setGeoError('Geolocation is not supported in this environment.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoLoading(false);
        setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(err?.message || 'Unable to determine your location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const toggleNearby = useCallback(() => {
    setShowNearby((prev) => {
      const next = !prev;
      if (next && !userLocation) {
        requestLocation();
      }
      if (!next) {
        setGeoError(null);
      }
      return next;
    });
  }, [requestLocation, userLocation]);

  useEffect(() => {
    let cancelled = false;
    const loadPosts = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          limit: 200,
        };
        if (searchQuery) params.q = searchQuery;
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (showNearby && userLocation) {
          params.lat = userLocation.latitude;
          params.lng = userLocation.longitude;
          params.radiusKm = radiusKm;
        }

        const data = await listPosts(params);
        if (cancelled) return;
        const mapped = (data?.posts ?? []).map((post) => ({
          ...post,
          distanceKm:
            typeof post.distanceMeters === 'number'
              ? Number((post.distanceMeters / 1000).toFixed(2))
              : post.distanceKm,
        }));
        setPosts(mapped);
      } catch (err) {
        if (cancelled) return;
        setPosts([]);
        setError(err?.message || 'Failed to load posts.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPosts();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedCategory, showNearby, radiusKm, userLocation]);

  const categories = useMemo(() => {
    const unique = new Set(posts.map((p) => normalizeCategory(p.category)));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const categoryColors = useMemo(() => buildCategoryColors(categories), [categories]);

  const points = useMemo(
    () =>
      posts
        .map((post) => {
          const coordinate = extractCoordinate(post);
          if (!coordinate) return null;
          const category = normalizeCategory(post.category);
          return {
            post,
            coordinate,
            category,
            color: categoryColors.get(category) || CATEGORY_PALETTE[0],
          };
        })
        .filter(Boolean),
    [posts, categoryColors]
  );

  const region = useMemo(
    () => computeRegion(points.map(({ coordinate }) => coordinate)),
    [points]
  );

  const mapKey = useMemo(
    () => `${region.latitude.toFixed(3)}-${region.longitude.toFixed(3)}-${region.latitudeDelta.toFixed(3)}`,
    [region]
  );

  const legendItems = useMemo(
    () =>
      categories.map((category) => ({
        category,
        color: categoryColors.get(category) || CATEGORY_PALETTE[0],
      })),
    [categories, categoryColors]
  );

  const activeRadiusLabel = `${radiusKm} km`;

  const navigateBack = useCallback(() => {
    if (navigation?.navigate) {
      navigation.navigate('List');
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  }, [navigation]);

  useEffect(() => {
    if (!isWeb) return undefined;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerLayerRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isWeb || !webMapContainer) return;

    if (mapInstanceRef.current) {
      setWebMapLoading(false);
      setWebMapError(null);
      setWebMapReady(true);
      return;
    }

    let cancelled = false;
    setWebMapLoading(true);
    setWebMapError(null);

    ensureLeafletLoaded()
      .then((L) => {
        if (cancelled || !webMapContainer) return;

        const map = L.map(webMapContainer, {
          zoomControl: true,
          preferCanvas: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        markerLayerRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;

        setWebMapLoading(false);
        setWebMapError(null);
        setWebMapReady(true);

        setTimeout(() => {
          map.invalidateSize();
        }, 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setWebMapLoading(false);
        setWebMapError(err?.message || 'Failed to load the map.');
        setWebMapReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [webMapContainer]);

  useEffect(() => {
    if (!isWeb || !webMapReady) return;
    const L = window?.L;
    const map = mapInstanceRef.current;
    const layerGroup = markerLayerRef.current;
    if (!L || !map || !layerGroup) return;

    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);

    points.forEach(({ post, coordinate, color, category }) => {
      const latLng = [coordinate.latitude, coordinate.longitude];
      const marker = L.circleMarker(latLng, {
        radius: 9,
        weight: 2,
        color: '#fff',
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(layerGroup);

      const rawId = `map-open-${post?._id ?? Math.random().toString(36).slice(2)}`;
      const buttonId = sanitizeId(rawId, `map-open-${Math.random().toString(36).slice(2)}`);
      marker.bindPopup(createPopupHtml(post, category, color, buttonId));
      marker.bindTooltip(post?.title || 'Untitled Post', {
        direction: 'top',
        offset: [0, -12],
        opacity: 0.85,
      });

      const handleNavigate = () =>
        navigation?.navigate?.('PostDetail', {
          id: post._id,
        });

      marker.on('popupopen', (event) => {
        const element = event?.popup?.getElement()?.querySelector(`#${buttonId}`);
        if (element) {
          element.addEventListener('click', handleNavigate);
        }
      });

      marker.on('popupclose', (event) => {
        const element = event?.popup?.getElement()?.querySelector(`#${buttonId}`);
        if (element) {
          element.removeEventListener('click', handleNavigate);
        }
      });

      bounds.extend(latLng);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userCircleRef.current) {
      userCircleRef.current.remove();
      userCircleRef.current = null;
    }

    if (showNearby && userLocation) {
      const userLatLng = [userLocation.latitude, userLocation.longitude];
      userMarkerRef.current = L.circleMarker(userLatLng, {
        radius: 7,
        weight: 3,
        color: '#fff',
        fillColor: theme.colors.primary,
        fillOpacity: 1,
      }).addTo(map);

      userCircleRef.current = L.circle(userLatLng, {
        radius: radiusKm * 1000,
        color: theme.colors.primary,
        fillColor: theme.colors.primary,
        fillOpacity: 0.08,
        weight: 1.5,
      }).addTo(map);

      bounds.extend(userLatLng);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (showNearby && userLocation) {
      const approxDelta = Math.max(radiusKm / 111, 0.05);
      map.setView(
        [userLocation.latitude, userLocation.longitude],
        computeLeafletZoom({
          latitudeDelta: approxDelta,
          longitudeDelta: approxDelta,
        })
      );
    } else {
      map.setView([region.latitude, region.longitude], computeLeafletZoom(region));
    }
  }, [points, region, showNearby, userLocation, radiusKm, webMapReady, navigation]);

  if (loading && !points.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const mapContent = (
    <View style={[StyleSheet.absoluteFill, styles.webMapContainer]}>
      <View ref={setWebMapContainer} style={styles.webMap} />
      {webMapLoading ? (
        <View style={styles.webMapStatusOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.webFallbackBody}>Loading map…</Text>
        </View>
      ) : null}
      {webMapError ? (
        <View style={styles.webMapStatusOverlay}>
          <Feather name="alert-triangle" size={32} color={theme.colors.primary} />
          <Text style={styles.webFallbackTitle}>Map unavailable</Text>
          <Text style={styles.webFallbackBody}>{webMapError}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
        <Feather name="chevron-left" size={18} color={theme.colors.text} />
        <Text style={styles.backButtonLabel}>Back</Text>
      </TouchableOpacity>
      {mapContent}

      <View style={styles.overlayTop}>
        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Discover posts on the map</Text>
            {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          </View>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color={theme.colors.sub} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search services, keywords, or titles"
              placeholderTextColor={theme.colors.sub}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip
              label="All"
              selected={selectedCategory === 'all'}
              onPress={() => setSelectedCategory('all')}
            />
            {legendItems.map(({ category }) => (
              <FilterChip
                key={category}
                label={category}
                selected={selectedCategory === category}
                onPress={() =>
                  setSelectedCategory((prev) => (prev === category ? 'all' : category))
                }
              />
            ))}
          </ScrollView>

          <View style={styles.nearbyRow}>
            <TouchableOpacity style={styles.nearbyToggle} onPress={toggleNearby}>
              <View style={[styles.nearbyIndicator, showNearby && styles.nearbyIndicatorActive]} />
              <Text style={styles.nearbyLabel}>Nearby</Text>
            </TouchableOpacity>
            <Text style={styles.nearbyHint}>
              {showNearby ? `Showing results within ${activeRadiusLabel}` : 'Show results around you'}
            </Text>
          </View>

          {showNearby ? (
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setRadiusKm(value)}
                  style={[
                    styles.radiusChip,
                    radiusKm === value && styles.radiusChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.radiusLabel,
                      radiusKm === value && styles.radiusLabelSelected,
                    ]}
                  >
                    {value} km
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.locateButton} onPress={requestLocation}>
                {geoLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.locateLabel}>Update location</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {geoError ? <Text style={styles.errorText}>{geoError}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </View>

      {points.length === 0 && !loading ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyTitle}>No posts match the current filters</Text>
          <Text style={styles.emptySubtitle}>Try broadening your search or disabling Nearby.</Text>
        </View>
      ) : null}

      {legendItems.length ? (
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Map legend</Text>
          {legendItems.map(({ category, color }) => (
            <View key={category} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>{category}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  overlayTop: {
    position: 'absolute',
    top: 24,
    left: 16,
    right: 16,
    paddingTop: 56,
  },
  backButton: {
    position: 'absolute',
    top: 24,
    left: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  backButtonLabel: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  filterCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    gap: 12,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    marginLeft: 8,
    flex: 1,
    color: theme.colors.text,
  },
  chipRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  chip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  chipLabel: {
    color: '#374151',
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: '#166534',
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nearbyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nearbyIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5F5',
    backgroundColor: '#fff',
  },
  nearbyIndicatorActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  nearbyLabel: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  nearbyHint: {
    flex: 1,
    color: theme.colors.sub,
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  radiusChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#DBEAFE',
  },
  radiusLabel: {
    color: '#4B5563',
    fontWeight: '600',
  },
  radiusLabelSelected: {
    color: theme.colors.primary,
  },
  locateButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  locateLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
  },
  callout: {
    maxWidth: 220,
    gap: 4,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  calloutPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  calloutCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  calloutHint: {
    fontSize: 12,
    color: theme.colors.primary,
  },
  emptyOverlay: {
    position: 'absolute',
    top: '50%',
    left: 16,
    right: 16,
    transform: [{ translateY: -40 }],
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    gap: 6,
    zIndex: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: theme.colors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    color: theme.colors.sub,
  },
  legendCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    minWidth: 160,
    gap: 8,
    zIndex: 12,
  },
  legendTitle: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendLabel: {
    color: theme.colors.sub,
    fontSize: 13,
  },
  webMapContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  webMap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 0,
  },
  webMapStatusOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    zIndex: 10,
  },
  webFallbackContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  webFallbackCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  webFallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  webFallbackBody: {
    fontSize: 14,
    color: theme.colors.sub,
    textAlign: 'center',
  },
  backButtonLarge: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  backButtonLargeLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});

