import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function Button({ title, onPress, loading = false, disabled = false, style, textStyle }) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, isDisabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.txt, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  txt: {
    color: '#fff',
    fontWeight: '700',
  },
});
