// src/screens/LoginScreen.js
import React, { useContext, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Button from '../ui/Button';

export default function LoginScreen({ navigation }) {
  const { doLogin, googlePrompt, fbPrompt, doAppleLogin } = useContext(AuthContext);

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const onLogin = async () => {
    setErr('');
    try {
      await doLogin(emailOrUsername, password);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput style={styles.input} placeholder="Email or Username" value={emailOrUsername} onChangeText={setEmailOrUsername} />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      {err ? <Text style={{ color: 'red', marginBottom: 8 }}>{err}</Text> : null}

      <Button title="Log in" onPress={onLogin} />

      <Text style={{ marginVertical: 12, textAlign: 'center', color: '#6B7280' }}>or</Text>

      <Button title="Continue with Google" onPress={() => googlePrompt()} />
      <View style={{ height: 8 }} />
      <Button title="Continue with Facebook" onPress={() => fbPrompt()} />
      <View style={{ height: 8 }} />
      {Platform.OS === 'ios' ? <Button title="Continue with Apple" onPress={doAppleLogin} /> : null}

      <Text style={{ marginTop: 16, textAlign: 'center' }}>
        New here? <Text style={{ fontWeight: '700' }} onPress={() => navigation.navigate('Signup')}>Create an account</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 10 },
});
