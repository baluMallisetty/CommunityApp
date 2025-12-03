// src/components/PostCard.js
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, Modal, Dimensions, ScrollView } from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { imageSource } from '../api';
import { theme } from '../theme';

export default function PostCard({ post, onLike, onComment, onShare, onPress }) {
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  const [media, setMedia] = useState([]); // [{ type, source }]
  const [viewer, setViewer] = useState(null); // index

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await Promise.all(
          attachments.map(async (a) => ({
            type: a.mimetype?.startsWith('video') ? 'video' : 'image',
            source: await imageSource(a.path || a.url || a.absoluteUrl),
          }))
        );
        const safeList = list.filter((item) => item?.source);
        if (!cancel) setMedia(safeList);
      } catch (err) {
        console.warn('Failed to load post media', err?.message || err);
        if (!cancel) setMedia([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [attachments]);

  return (
    <TouchableOpacity onPress={() => onPress?.(post)} activeOpacity={0.9}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius,
        padding: theme.pad,
        borderWidth: 1, borderColor: theme.colors.border,
        marginBottom: 12
      }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18, backgroundColor: '#DCFCE7',
          alignItems: 'center', justifyContent: 'center', marginRight: 10
        }}>
          <Text style={{ fontWeight: '700', color: theme.colors.primary }}>
            {(post.user?.name || post.user?.username || 'U').slice(0,1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: theme.colors.text }}>
            {post.user?.name || post.user?.username || 'Member'}
          </Text>
          <Text style={{ color: theme.colors.sub, fontSize: 12 }}>
            {timeAgo(post.createdAt)} · {post.community || 'Nearby'}
          </Text>
        </View>
        <Feather name="more-horizontal" size={20} color={theme.colors.sub} />
      </View>

      {/* Body */}
      <Text style={{ fontWeight: '800', marginBottom: 4 }}>{post.title}</Text>
      {post.content ? <ExpandableText text={post.content} /> : null}

      {/* Media */}
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
                  style={{ width: Dimensions.get('window').width - 28, height: 200, borderRadius: 10 }}
                  useNativeControls
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={item.source}
                  style={{ width: Dimensions.get('window').width - 28, height: 200, borderRadius: 10 }}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }}
        />
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', marginTop: 10, gap: 14 }}>
        <IconText icon={<AntDesign name={post.liked ? 'heart' : 'hearto'} size={18} color={post.liked ? theme.colors.primary : theme.colors.sub} />} text={`${post.likes || 0}`} onPress={() => onLike?.(post)} />
        <IconText icon={<Feather name="message-circle" size={18} color={theme.colors.sub} />} text={`${post.commentsCount || 0}`} onPress={() => onComment?.(post)} />
        <IconText icon={<Feather name="send" size={18} color={theme.colors.sub} />} text="Share" onPress={() => onShare?.(post)} />
      </View>
      {media.length > 0 && (
        <MediaViewer media={media} index={viewer} onClose={() => setViewer(null)} />
      )}
    </TouchableOpacity>
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

function IconText({ icon, text, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon}
      <Text style={{ marginLeft: 6, color: theme.colors.sub }}>{text}</Text>
    </TouchableOpacity>
  );
}

function timeAgo(iso) {
  if (!iso) return 'now';
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function ExpandableText({ text, clamp = 140 }) {
  const [expanded, setExpanded] = React.useState(false);
  if (text.length <= clamp) return <Text style={{ color: '#374151' }}>{text}</Text>;
  return (
    <Text style={{ color: '#374151' }}>
      {expanded ? text : `${text.slice(0, clamp)}... `}
      <Text onPress={() => setExpanded(!expanded)} style={{ color: theme.colors.primary, fontWeight: '700' }}>
        {expanded ? 'see less' : 'see more'}
      </Text>
    </Text>
  );
}
