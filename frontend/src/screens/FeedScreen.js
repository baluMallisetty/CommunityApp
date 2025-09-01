// src/screens/FeedScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { listPosts, likePost, unlikePost } from '../api';
import PostCard from '../components/PostCard';
import FAB from '../ui/FAB';
import { theme } from '../theme';

export default function FeedScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState('Nearby');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = { limit: 10, q: q || undefined };
      const cat = category === 'Nearby' ? undefined : category;
      if (cat) params.category = cat;
      if (!refresh && cursor) params.after = cursor;
      const data = await listPosts(params);
      const list = data.posts || [];
      setItems(prev => (refresh ? list : [...prev, ...list]));
      setCursor(data.nextCursor || null);
    } finally {
      setLoading(false);
      if (refresh) setRefreshing(false);
    }
  }, [q, category, cursor, loading]);

  useEffect(() => {
    load({ refresh: true });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load({ refresh: true }), 300);
    return () => clearTimeout(t);
  }, [q, category]);

  const onRefresh = () => {
    setRefreshing(true);
    load({ refresh: true });
  };

  const onEndReached = () => {
    if (cursor && !loading) load({});
  };

  const toggleLike = async (post) => {
    const liked = !!post.liked;
    setItems(prev =>
      prev.map(p =>
        p._id === post._id
          ? { ...p, liked: !liked, likes: (p.likes || 0) + (liked ? -1 : 1) }
          : p
      )
    );
    try {
      liked ? await unlikePost(post._id) : await likePost(post._id);
    } catch {
      setItems(prev =>
        prev.map(p =>
          p._id === post._id
            ? { ...p, liked, likes: (p.likes || 0) + (liked ? 1 : -1) }
            : p
        )
      );
    }
  };

  const header = (
    <View style={{ paddingVertical: 8 }}>
      {/* Search bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'white',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Feather name="search" size={18} color={theme.colors.sub} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search for plumber, handyman..."
          style={{ marginLeft: 8, flex: 1 }}
        />
        <TouchableOpacity onPress={() => setFilterOpen((v) => !v)}>
          <Feather name="sliders" size={18} color={theme.colors.sub} />
        </TouchableOpacity>
      </View>

      {/* Filter chip row */}
      {filterOpen && (
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            marginTop: 10,
            flexWrap: 'wrap',
          }}
        >
          {['Nearby', 'Lost & Found', 'General', 'For Sale & Free'].map((c) => (
            <Chip
              key={c}
              label={c}
              selected={category === c}
              onPress={() => setCategory((prev) => (prev === c ? 'Nearby' : c))}
            />
          ))}
        </View>
      )}

      <Text style={{ fontSize: 20, fontWeight: '800', marginTop: 14 }}>
        Feed
      </Text>
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        paddingHorizontal: 14,
      }}
    >
      <FlatList
        data={items}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onLike={toggleLike}
            onComment={(p) =>
              navigation?.navigate?.('PostDetail', { id: p._id })
            }
            onShare={() => {}}
            onPress={(p) => navigation?.navigate?.('PostDetail', { id: p._id })}
          />
        )}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReachedThreshold={0.25}
        onEndReached={onEndReached}
        ListFooterComponent={
          loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
        }
        contentContainerStyle={{ paddingBottom: 90 }}
      />

      <FAB title="Post" onPress={() => navigation?.navigate?.('CreatePost')} />
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: selected ? '#DCFCE7' : '#F3F4F6',
        borderColor: selected ? '#16A34A' : '#E5E7EB',
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          color: selected ? '#166534' : '#374151',
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
