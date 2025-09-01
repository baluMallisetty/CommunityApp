// src/screens/SignupScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch } from 'react-native';
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
    try {
      await doSignup(email, username, password);
      await saveRememberSignup({
        remember,
        email: remember ? email : '',
        username: remember ? username : '',
        password: remember ? password : '',
      });
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
});
