// src/screens/SignupScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Button from '../ui/Button';
import { loadRememberSignup, saveRememberSignup } from '../api/credentials';

export default function SignupScreen({ navigation }) {
  const { doSignup } = useContext(AuthContext);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [debugLink, setDebugLink] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await loadRememberSignup();
      if (saved?.remember) {
        setRemember(true);
        setEmail(saved.email || '');
        setUsername(saved.username || '');
        setPassword(saved.password || '');
      }
    })();
  }, []);

  const onSignup = async () => {
    setErr('');
    setSuccess('');
    setDebugLink('');
    try {
      const resp = await doSignup(email, username, password);
      await saveRememberSignup({
        remember,
        email: remember ? email : '',
        username: remember ? username : '',
        password: remember ? password : '',
      });
      setSuccess(resp?.message || 'Account created! Check your email to verify the address.');
      if (resp?.debug?.verificationLink) {
        setDebugLink(resp.debug.verificationLink);
      }
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

      <View style={styles.row}>
        <Switch value={remember} onValueChange={setRemember} />
        <Text style={{ marginLeft: 8 }}>Remember me</Text>
      </View>

      {err ? <Text style={{ color: 'red', marginBottom: 8 }}>{err}</Text> : null}
      {success ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Verify your email</Text>
          <Text style={styles.noticeText}>{success}</Text>
          <Text style={styles.noticeText}>Open the verification link in your inbox before trying to log in.</Text>
          {debugLink ? (
            <>
              <Text style={[styles.noticeText, { fontWeight: '600', marginTop: 8 }]}>Dev shortcut:</Text>
              <Text selectable style={styles.tokenBox}>{debugLink}</Text>
            </>
          ) : null}
          <Text style={styles.noticeFooter}>Once verified, return here and sign in.</Text>
        </View>
      ) : null}
      <Button title="Sign up" onPress={onSignup} />

      <Text style={{ marginTop: 16, textAlign: 'center' }}>
        Already have an account? <Text style={{ fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>Log in</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  notice: { borderWidth: 1, borderColor: '#D1FAE5', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeTitle: { fontWeight: '700', marginBottom: 4, color: '#065F46' },
  noticeText: { color: '#065F46' },
  noticeFooter: { color: '#047857', marginTop: 8, fontSize: 12 },
  tokenBox: { fontFamily: Platform?.OS === 'web' ? 'monospace' : undefined, backgroundColor: '#fff', padding: 8, borderRadius: 8, marginTop: 4, color: '#065F46', borderWidth: 1, borderColor: '#A7F3D0' },
});
