import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useContext } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { AuthProvider, AuthContext } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import FeedScreen from './src/screens/FeedScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';

const isWeb = Platform.OS === 'web';
const createStack = isWeb
  ? require('@react-navigation/stack').createStackNavigator   // v6
  : require('@react-navigation/native-stack').createNativeStackNavigator; // v6

if (!isWeb) {
  try {
    const { enableScreens } = require('react-native-screens');
    enableScreens(true);
  } catch {}
}

const Stack = createStack();

function Root() {
  const { user, booting } = useContext(AuthContext);
  if (booting) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={FeedScreen} />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
