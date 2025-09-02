import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import DraggableFlatList from 'react-native-draggable-flatlist';

import { createPost } from '../api';
import Screen from '../ui/Screen';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Card from '../ui/Card';

export default function CreatePostModal({ visible, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState(null);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const assets = result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || `media.${a.type === 'video' ? 'mp4' : 'jpg'}`,
        type: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      }));
      setMedia((prev) => [...prev, ...assets]);
    }
  };

  const submit = async () => {
    try {
      setLoading(true);
      await createPost(title || 'Untitled', description, undefined, undefined, media);
      onCreated?.();
      setTitle('');
      setDescription('');
      setMedia([]);
      setCategory(null);
    } catch (e) {
      Alert.alert('Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, drag, index }) => (
    <TouchableOpacity
      onLongPress={drag}
      onPress={() => setPreview(index)}
      style={{ marginRight: 8 }}
    >
      {item.type.startsWith('video') ? (
        <Video
          source={{ uri: item.uri }}
          style={{ width: 80, height: 80, borderRadius: 6 }}
          useNativeControls={false}
          resizeMode="cover"
        />
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={{ width: 80, height: 80, borderRadius: 6 }}
        />
      )}
    </TouchableOpacity>
  );

  const categories = [
    'Share an update',
    'Sell an item',
    'Request advice',
    'Post a missing pet',
    'Poll your neighbors',
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Title" />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What's on your mind, neighbor?"
            multiline
          />
          {media.length > 0 && (
            <DraggableFlatList
              data={media}
              horizontal
              keyExtractor={(_, idx) => String(idx)}
              onDragEnd={({ data }) => setMedia(data)}
              renderItem={renderItem}
              contentContainerStyle={{ marginBottom: 12 }}
            />
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button
              title="Add Media"
              onPress={pickMedia}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Post"
              onPress={submit}
              loading={loading}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <CategoryChip
                  key={c}
                  label={c}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Button title="Cancel" onPress={onClose} />
          </View>
        </Card>
      </Screen>
      <PreviewModal
        item={preview !== null ? media[preview] : null}
        onClose={() => setPreview(null)}
      />
    </Modal>
  );
}

function CategoryChip({ label, selected, onPress }) {
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
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: selected ? '#166534' : '#374151', fontWeight: '600' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PreviewModal({ item, onClose }) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        {item.type.startsWith('video') ? (
          <Video
            source={{ uri: item.uri }}
            style={{ width: '90%', height: '70%' }}
            useNativeControls
            resizeMode="contain"
          />
        ) : (
          <Image
            source={{ uri: item.uri }}
            style={{ width: '90%', height: '70%' }}
            resizeMode="contain"
          />
        )}
      </TouchableOpacity>
    </Modal>
  );
}

