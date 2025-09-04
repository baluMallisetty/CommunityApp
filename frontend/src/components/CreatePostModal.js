import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import DraggableFlatList from 'react-native-draggable-flatlist';

import { createPost } from '../api';
import Screen from '../ui/Screen';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Card from '../ui/Card';
import LocationPickerModal from './LocationPickerModal';

export default function CreatePostModal({ visible, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [category, setCategory] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);

  const prepareAsset = async (a) => {
    let thumbnail = a.type === 'image' ? a.uri : null;
    if (a.type === 'video') {
      try {
        const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(a.uri);
        thumbnail = thumb;
      } catch {
        thumbnail = null;
      }
    }
    return {
      uri: a.uri,
      name: a.fileName || `media.${a.type === 'video' ? 'mp4' : 'jpg'}`,
      type: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      thumbnail,
    };
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const assets = await Promise.all(result.assets.map(prepareAsset));
      setMedia((prev) => [...prev, ...assets]);
    }
  };

  const removeMedia = (index) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const replaceMedia = async (index) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (!result.canceled) {
      const asset = await prepareAsset(result.assets[0]);
      setMedia((prev) => prev.map((m, i) => (i === index ? asset : m)));
    }
  };

  const useCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location permission is required.');
      return;
    }
    const { coords } = await Location.getCurrentPositionAsync({});
    setLocation({ latitude: coords.latitude, longitude: coords.longitude });
  };

  const submit = async () => {
    try {
      setLoading(true);
      await createPost(
        title || 'Untitled',
        description,
        location?.latitude,
        location?.longitude,
        media
      );
      onCreated?.();
      setTitle('');
      setDescription('');
      setMedia([]);
      setCategory(null);
      setLocation(null);
    } catch (e) {
      Alert.alert('Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // capture the item index so media can be removed or replaced
  const renderMediaItem = ({ item, drag, getIndex }) => {
    const index = getIndex();
    return (
      <View style={{ marginRight: 8, alignItems: 'center' }}>
        <View style={{ position: 'relative' }}>
          <TouchableOpacity onLongPress={drag} onPress={() => setPreview(index)}>
            {item.type.startsWith('video') && !item.thumbnail ? (
              <Video
                source={{ uri: item.uri }}
                style={{ width: 80, height: 80, borderRadius: 6 }}
                resizeMode="cover"
              />
            ) : (
              <Image
                source={{ uri: item.thumbnail || item.uri }}
                style={{ width: 80, height: 80, borderRadius: 6 }}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => {
              e?.stopPropagation?.();
              removeMedia(index);
            }}
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 12,
              padding: 2,
              zIndex: 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12 }}>✕</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e?.stopPropagation?.();
            replaceMedia(index);
          }}
          style={{ marginTop: 4 }}
        >
          <Text style={{ color: '#3B82F6', fontWeight: '600' }}>Modify</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
          <Field
            label="Location"
            value=
              {location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : ''}
            placeholder="No location selected"
            editable={false}
            onPress={() => setLocationPickerVisible(true)}
          />
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <Button
              title="Use Current Location"
              onPress={useCurrentLocation}
              style={{ flex: 1, marginRight: location ? 8 : 0 }}
            />
            {location && (
              <Button
                title="Clear Location"
                onPress={() => setLocation(null)}
                style={{ flex: 1 }}
              />
            )}
          </View>
          {media.length > 0 && (
            <DraggableFlatList
              data={media}
              horizontal
              keyExtractor={(_, idx) => String(idx)}
              onDragEnd={({ data }) => setMedia(data)}
              renderItem={renderMediaItem}
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
      <LocationPickerModal
        visible={locationPickerVisible}
        initialLocation={location}
        onSelect={setLocation}
        onClose={() => setLocationPickerVisible(false)}
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
            shouldPlay
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

