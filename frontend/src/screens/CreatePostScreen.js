import React, { useState } from 'react';
import {
  Image,
  Alert,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createPost } from '../api';
import Screen from '../ui/Screen';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { theme } from '../theme';

export default function CreatePostScreen({ navigation }) {
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
      await createPost('Untitled', content, undefined, undefined, image ? [image] : []);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card style={{ marginBottom: 16 }}>
        <Field
          label={null}
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind, neighbor?"
          multiline
        />
        {image ? (
          <Image
            source={{ uri: image.uri }}
            style={{ width: '100%', height: 200, marginBottom: 12, borderRadius: 8 }}
          />
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Button
            title="Add Photo"
            onPress={pickImage}
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button
            title="Post"
            onPress={submit}
            loading={loading}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      <Card>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Create something</Text>
        {[
          'Share an update',
          'Sell an item',
          'Request advice',
          'Post a missing pet',
          'Poll your neighbors',
        ].map((label) => (
          <Option key={label} label={label} />
        ))}
      </Card>
    </Screen>
  );
}

function Option({ label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ paddingVertical: theme.spacing(1) }}
    >
      <Text style={{ color: theme.colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
