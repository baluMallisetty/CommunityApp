import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { getPost, imageSource } from '../../api';
import { theme } from '../../theme';
import { Video } from 'expo-av';

export default function PostDetailScreen({ route }) {
  const id = route?.params?.id;
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [media, setMedia] = useState([]); // [{type, source}]
  const [viewer, setViewer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const data = await getPost(id);
        setPost(data.post);
        const attachments = Array.isArray(data.post?.attachments) ? data.post.attachments : [];
        const list = await Promise.all(
          attachments.map(async (a) => ({
            type: a.mimetype?.startsWith('video') ? 'video' : 'image',
            source: await imageSource(a.path || a.url || a.absoluteUrl),
          }))
        );
        setMedia(list.filter((item) => item?.source));
      } catch (err) {
        console.warn('Failed to load post', err?.message || err);
        setError(err?.message || 'Unable to load post');
        setMedia([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ marginBottom: 8, fontWeight: '600' }}>Something went wrong</Text>
        <Text style={{ textAlign: 'center', color: theme.colors.sub }}>{error}</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Post not found</Text>
      </View>
    );
  }

  const width = Dimensions.get('window').width;
  const lat = post.location?.coordinates?.[1];
  const lng = post.location?.coordinates?.[0];
  const mapUrl =
    lat != null && lng != null
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x300&markers=${lat},${lng},lightblue1`
      : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ padding: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 6 }}>{post.title}</Text>
      {post.content ? <Text style={{ marginBottom: 12 }}>{post.content}</Text> : null}

      {media.length > 0 && (
        <FlatList
          data={media}
          horizontal
          pagingEnabled
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => setViewer(index)}>
              {item.type === 'video' ? (
                <Video
                  source={item.source}
                  style={{ width: width - 28, height: 250, borderRadius: 10 }}
                  useNativeControls
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={item.source}
                  style={{ width: width - 28, height: 250, borderRadius: 10 }}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
        />
      )}

      {mapUrl && (
        <Image
          source={{ uri: mapUrl }}
          style={{ width: width - 28, height: 200, borderRadius: 10, marginBottom: 12 }}
        />
      )}

      <Text style={{ color: theme.colors.sub, fontSize: 12 }}>
        Posted {new Date(post.createdAt).toLocaleString()} · {post.community || 'Nearby'}
      </Text>

      <MediaViewer media={media} index={viewer} onClose={() => setViewer(null)} />
    </ScrollView>
  );
}

function MediaViewer({ media, index, onClose }) {
  const width = Dimensions.get('window').width;
  if (index === null) return null;
  return (
    <Modal visible transparent onRequestClose={onClose}>
      <ScrollView
        horizontal
        pagingEnabled
        contentOffset={{ x: width * index, y: 0 }}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' }}
      >
        {media.map((m, i) => (
          <TouchableOpacity
            key={i}
            style={{ width, justifyContent: 'center', alignItems: 'center' }}
            onPress={onClose}
            activeOpacity={1}
          >
            {m.type === 'video' ? (
              <Video source={m.source} style={{ width, height: '100%' }} useNativeControls resizeMode="contain" />
            ) : (
              <Image source={m.source} style={{ width, height: '100%' }} resizeMode="contain" />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Modal>
  );
}
