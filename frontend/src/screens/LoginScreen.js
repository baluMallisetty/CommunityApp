// src/screens/LoginScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Switch } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Button from '../ui/Button';
import { loadRememberLogin, saveRememberLogin } from '../api/credentials';

export default function LoginScreen({ navigation }) {
  const { doLogin, googlePrompt, fbPrompt, doAppleLogin } = useContext(AuthContext);

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await loadRememberLogin();
      if (saved?.remember) {
        setRemember(true);
        setEmailOrUsername(saved.emailOrUsername || '');
        setPassword(saved.password || '');
      }
    })();
  }, []);

  const onLogin = async () => {
    setErr('');
    try {
      await doLogin(emailOrUsername, password);
      await saveRememberLogin({
        remember,
        emailOrUsername: remember ? emailOrUsername : '',
        password: remember ? password : '',
      });
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput style={styles.input} placeholder="Email or Username"
        autoCapitalize="none" value={emailOrUsername} onChangeText={setEmailOrUsername} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry
        value={password} onChangeText={setPassword} />

      <View style={styles.row}>
        <Switch value={remember} onValueChange={setRemember} />
        <Text style={{ marginLeft: 8 }}>Remember me</Text>
      </View>

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
  wrap: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
