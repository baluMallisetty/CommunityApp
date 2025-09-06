// src/ui/FAB.js
import React from 'react';
import { TouchableOpacity, Text, View, Platform } from 'react-native';

export default function FAB({ title = 'Post', onPress }) {
  return (
    <View
      style={{
        position: Platform.OS === 'web' ? 'fixed' : 'absolute',
        right: 16,
        bottom: 24,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        style={{ backgroundColor: '#16A34A', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 22 }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>{title}</Text>
      </TouchableOpacity>
    </View>
  );
}
