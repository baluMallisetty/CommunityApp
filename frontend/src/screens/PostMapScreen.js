import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, Marker as NativeMarker } from 'react-native-maps';
import { Feather } from '@expo/vector-icons';
import { listPosts } from '../api';
import { theme } from '../theme';

const DEFAULT_REGION = {
  latitude: 37.773972,
  longitude: -122.431297,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

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

const isWeb = Platform.OS === 'web';

let leafletLoaderPromise = null;

function loadLeaflet() {
  if (!isWeb || typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet is only available on the web.'));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletLoaderPromise) {
    return leafletLoaderPromise;
  }

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.L) {
        resolve(window.L);
      } else {
        reject(new Error('Leaflet failed to initialize.'));
      }
    };

    if (!document.querySelector('link[data-web-map="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      link.dataset.webMap = 'leaflet';
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-web-map="leaflet"]');
    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.dataset.webMap = 'leaflet';
    script.onload = finish;
    script.onerror = () => reject(new Error('Leaflet script failed to load.'));
    document.body.appendChild(script);
  });

  return leafletLoaderPromise;
}

function regionToWebZoom(region) {
  if (!region) return 10;
  const delta = Math.max(region.latitudeDelta ?? 0.5, region.longitudeDelta ?? 0.5);
  const zoom = Math.round(Math.log2(360 / Math.max(delta, 0.0005)));
  return Math.max(2, Math.min(16, zoom));
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultiline(content) {
  return escapeHtml(content).replace(/\n/g, '<br />');
}

function buildPopupMarkup(post, category, color) {
  const safeTitle = escapeHtml(post?.title || 'Untitled Post');
  const safeCategory = escapeHtml(category);
  const hasContent = typeof post?.content === 'string' && post.content.trim();
  const safeContent = hasContent ? formatMultiline(post.content.trim()) : '';
  const hasDistance = post?.distanceKm !== undefined && post.distanceKm !== null;
  const distanceLabel = hasDistance ? escapeHtml(`${post.distanceKm} km away`) : '';
  const safeId = escapeHtml(String(post?._id ?? ''));

  return `
    <div style="display:flex;flex-direction:column;gap:6px;max-width:240px;">
      <div style="font-weight:700;font-size:16px;color:#0f172a;">${safeTitle}</div>
      <div style="font-size:12px;font-weight:600;color:${color};">${safeCategory}</div>
      ${hasContent ? `<p style="margin:0;color:#475569;font-size:14px;">${safeContent}</p>` : ''}
      ${hasDistance ? `<p style="margin:0;color:#475569;font-size:12px;">${distanceLabel}</p>` : ''}
      <button
        type="button"
        data-role="open-post"
        data-post-id="${safeId}"
        style="align-self:flex-start;background-color:#2563EB;color:#fff;border:none;border-radius:999px;padding:6px 12px;font-weight:600;cursor:pointer;"
      >Open post</button>
      <div style="font-size:12px;color:#2563EB;">Tap to open</div>
    </div>
  `;
}

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

  const openPostDetail = useCallback(
    (postId) => {
      if (!postId) return;
      navigation?.navigate?.('PostDetail', {
        id: postId,
      });
    },
    [navigation]
  );

  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [webMapError, setWebMapError] = useState(null);
  const [webMapLoading, setWebMapLoading] = useState(isWeb);

  useEffect(() => {
    if (!isWeb) {
      return undefined;
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isWeb) {
      return undefined;
    }

    let cancelled = false;

    const ensureMap = async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapContainerRef.current) return;

        if (!leafletMapRef.current) {
          leafletMapRef.current = L.map(mapContainerRef.current, {
            center: [region.latitude, region.longitude],
            zoom: regionToWebZoom(region),
            scrollWheelZoom: true,
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
          }).addTo(leafletMapRef.current);
        }

        const mapInstance = leafletMapRef.current;
        mapInstance.setView(
          [region.latitude, region.longitude],
          regionToWebZoom(region)
        );

        if (!markersLayerRef.current) {
          markersLayerRef.current = L.layerGroup().addTo(mapInstance);
        }

        markersLayerRef.current.clearLayers();

        points.forEach(({ post, coordinate, color, category }) => {
          const marker = L.circleMarker(
            [coordinate.latitude, coordinate.longitude],
            {
              radius: 9,
              weight: 2,
              color: '#FFFFFF',
              fillColor: color,
              fillOpacity: 1,
            }
          );

          marker.bindPopup(buildPopupMarkup(post, category, color));

          const handleOpen = () => openPostDetail(post._id);

          marker.on('popupopen', () => {
            const popupEl = marker.getPopup()?.getElement();
            const button = popupEl?.querySelector('button[data-role="open-post"]');
            if (button) {
              button.addEventListener('click', handleOpen);
            }
          });

          marker.on('popupclose', () => {
            const popupEl = marker.getPopup()?.getElement();
            const button = popupEl?.querySelector('button[data-role="open-post"]');
            if (button) {
              button.removeEventListener('click', handleOpen);
            }
          });

          marker.on('remove', () => {
            const popupEl = marker.getPopup()?.getElement();
            const button = popupEl?.querySelector('button[data-role="open-post"]');
            if (button) {
              button.removeEventListener('click', handleOpen);
            }
          });

          marker.addTo(markersLayerRef.current);
        });

        setWebMapError(null);
        setWebMapLoading(false);
      } catch (err) {
        if (cancelled) return;
        leafletLoaderPromise = null;
        setWebMapError(err?.message || 'Unable to load the map.');
        setWebMapLoading(false);
      }
    };

    if (!leafletMapRef.current) {
      setWebMapLoading(true);
    }

    ensureMap();

    return () => {
      cancelled = true;
    };
  }, [mapKey, points, region, openPostDetail]);

  if (loading && !points.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const mapContent = isWeb ? (
    <View style={styles.webMapContainer}>
      <View ref={mapContainerRef} style={styles.webMap} />
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
  ) : (
    <MapView key={mapKey} style={StyleSheet.absoluteFill} initialRegion={region}>
      {points.map(({ post, coordinate, color, category }) => (
        <NativeMarker key={post._id} coordinate={coordinate} pinColor={color}>
          <Callout
            onPress={() =>
              navigation?.navigate?.('PostDetail', {
                id: post._id,
              })
            }
          >
            <View style={styles.callout}>
              <Text style={styles.calloutTitle} numberOfLines={1}>
                {post.title || 'Untitled Post'}
              </Text>
              <Text style={styles.calloutCategory}>{category}</Text>
              {post.content ? (
                <Text style={styles.calloutBody} numberOfLines={2}>
                  {post.content}
                </Text>
              ) : null}
              {post.distanceKm !== undefined ? (
                <Text style={styles.calloutMeta}>{post.distanceKm} km away</Text>
              ) : null}
              <Text style={styles.calloutHint}>Tap to open</Text>
            </View>
          </Callout>
        </NativeMarker>
      ))}
    </MapView>
  );

  return (
    <View style={styles.container}>
      {mapContent}
      <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
        <Feather name="chevron-left" size={18} color={theme.colors.text} />
        <Text style={styles.backButtonLabel}>Back</Text>
      </TouchableOpacity>

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
    zIndex: 15,
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
  calloutTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  calloutCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  calloutBody: {
    fontSize: 14,
    color: theme.colors.sub,
  },
  calloutMeta: {
    fontSize: 12,
    color: theme.colors.sub,
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
  webMapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  webMap: {
    width: '100%',
    height: '100%',
  },
  webMapStatusOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
});

