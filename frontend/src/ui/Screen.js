import React from 'react';
import { View, StatusBar } from 'react-native';
import { theme } from '../theme';

export default function Screen({ children, style }) {
  return (
    <View
      style={[{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.pad }, style]}
    >
      <StatusBar barStyle="dark-content" />
      {children}
    </View>
  );
}
