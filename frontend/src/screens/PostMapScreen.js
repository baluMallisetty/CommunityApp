import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import MapView, { Callout, Marker } from 'react-native-maps';
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

  if (isWeb) {
    return (
      <View style={styles.webFallbackContainer}>
        <View style={styles.webFallbackCard}>
          <Feather name="map" size={32} color={theme.colors.primary} />
          <Text style={styles.webFallbackTitle}>Map preview unavailable</Text>
          <Text style={styles.webFallbackBody}>
            The interactive map is not supported in the web preview. Use the mobile app to see
            nearby posts on the map.
          </Text>
          <TouchableOpacity style={styles.backButtonLarge} onPress={navigateBack}>
            <Feather name="chevron-left" size={18} color="#fff" />
            <Text style={styles.backButtonLargeLabel}>Back to feed</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && !points.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
        <Feather name="chevron-left" size={18} color={theme.colors.text} />
        <Text style={styles.backButtonLabel}>Back</Text>
      </TouchableOpacity>
      <MapView key={mapKey} style={StyleSheet.absoluteFill} initialRegion={region}>
        {points.map(({ post, coordinate, color, category }) => (
          <Marker key={post._id} coordinate={coordinate} pinColor={color}>
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
          </Marker>
        ))}
      </MapView>

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

