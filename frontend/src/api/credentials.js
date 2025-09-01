// src/api/credentials.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  LOGIN: 'cmh_remember_login',     // {remember, emailOrUsername, password}
  SIGNUP: 'cmh_remember_signup',   // {remember, email, username, password}
};

export async function saveRememberLogin(data) {
  await AsyncStorage.setItem(K.LOGIN, JSON.stringify(data));
}

export async function loadRememberLogin() {
  const v = await AsyncStorage.getItem(K.LOGIN);
  return v ? JSON.parse(v) : { remember: false, emailOrUsername: '', password: '' };
}

export async function saveRememberSignup(data) {
  await AsyncStorage.setItem(K.SIGNUP, JSON.stringify(data));
}

export async function loadRememberSignup() {
  const v = await AsyncStorage.getItem(K.SIGNUP);
  return v ? JSON.parse(v) : { remember: false, email: '', username: '', password: '' };
}
