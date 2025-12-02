import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useContext } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import { AuthProvider, AuthContext } from './src/context/AuthContext';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignupScreen from './src/screens/auth/SignupScreen';
import PasswordResetScreen from './src/screens/auth/PasswordResetScreen';
import { FeedScreen, PostDetailScreen, PostMapScreen } from './src/screens/posts';
import { theme } from './src/theme';

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
const Tab = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.sub,
        tabBarIcon: ({ color, size }) => {
          const icon = route.name === 'List' ? 'list' : 'map';
          return <Feather name={icon} color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="List" component={FeedScreen} options={{ title: 'List' }} />
      <Tab.Screen name="Map" component={PostMapScreen} options={{ title: 'Map' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, booting } = useContext(AuthContext);
  if (booting) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeTabs} options={{ headerShown: false }} />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="PasswordReset" component={PasswordResetScreen} options={{ title: 'Reset password' }} />
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
