import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  editable = true,
  onPress,
}) {
  const input = (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      editable={editable && !onPress}
      pointerEvents={onPress ? 'none' : 'auto'}
      style={[
        styles.input,
        multiline ? { height: 96, textAlignVertical: 'top' } : null,
        !editable ? { backgroundColor: theme.colors.border } : null,
      ]}
    />
  );

  return (
    <View style={{ marginBottom: theme.spacing(1.5) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {onPress ? <TouchableOpacity onPress={onPress}>{input}</TouchableOpacity> : input}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: theme.colors.muted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
  },
});
