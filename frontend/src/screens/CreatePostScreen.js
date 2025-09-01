import React, { useState } from 'react';
import { Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createPost } from '../api';
import Screen from '../ui/Screen';
import Field from '../ui/Field';
import Button from '../ui/Button';

export default function CreatePostScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setImage({
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const submit = async () => {
    try {
      setLoading(true);
      await createPost(title, content, undefined, undefined, image ? [image] : []);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="What's happening?" />
      <Field label="Content" value={content} onChangeText={setContent} placeholder="Add more details" multiline />
      {image ? (
        <Image source={{ uri: image.uri }} style={{ width: '100%', height: 200, marginBottom: 12, borderRadius: 8 }} />
      ) : null}
      <Button title="Add Photo" onPress={pickImage} style={{ marginBottom: 12 }} />
      <Button title="Post" onPress={submit} loading={loading} />
    </Screen>
  );
}
