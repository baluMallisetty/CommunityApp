import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';
import { listPosts } from '../api';
import { theme } from '../theme';

const DEFAULT_REGION = {
  latitude: 37.773972,
  longitude: -122.431297,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

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

export default function PostMapScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadPosts = async () => {
      setLoading(true);
      try {
        const data = await listPosts({ limit: 100 });
        if (!mounted) return;
        setPosts(data?.posts ?? []);
      } catch (err) {
        if (!mounted) return;
        setPosts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadPosts();

    return () => {
      mounted = false;
    };
  }, []);

  const points = useMemo(
    () =>
      posts
        .map((post) => ({
          post,
          coordinate: extractCoordinate(post),
        }))
        .filter(({ coordinate }) => coordinate),
    [posts]
  );

  const region = useMemo(
    () => computeRegion(points.map(({ coordinate }) => coordinate)),
    [points]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!points.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No posts with locations yet</Text>
        <Text style={styles.emptySubtitle}>
          Create a post with a location to see it on the map.
        </Text>
      </View>
    );
  }

  return (
    <MapView style={StyleSheet.absoluteFill} initialRegion={region}>
      {points.map(({ post, coordinate }) => (
        <Marker key={post._id} coordinate={coordinate}>
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
              {post.content ? (
                <Text style={styles.calloutBody} numberOfLines={2}>
                  {post.content}
                </Text>
              ) : null}
              <Text style={styles.calloutHint}>Tap to open</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: theme.colors.bg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.sub,
    textAlign: 'center',
  },
  callout: {
    maxWidth: 200,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  calloutBody: {
    fontSize: 14,
    color: theme.colors.sub,
    marginBottom: 8,
  },
  calloutHint: {
    fontSize: 12,
    color: theme.colors.primary,
  },
});

