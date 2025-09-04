import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  editable = true,
}) {
  return (
    <View style={{ marginBottom: theme.spacing(1.5) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        style={[
          styles.input,
          multiline ? { height: 96, textAlignVertical: 'top' } : null,
          !editable ? { backgroundColor: theme.colors.border } : null,
        ]}
      />
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
