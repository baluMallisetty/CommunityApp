// frontend/src/components/CreatePostModal.web.js
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function CreatePostModal({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Create Post (web)</Text>
        <Text style={styles.body}>
          Map picker is not available on web yet. Please use the mobile app to select
          a map location, or extend this component with a web-friendly map.
        </Text>
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Text style={styles.buttonLabel}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
