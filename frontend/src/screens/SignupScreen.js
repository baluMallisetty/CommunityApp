// src/screens/SignupScreen.js
import React, { useContext, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Button from '../ui/Button';

export default function SignupScreen({ navigation }) {
  const { doSignup } = useContext(AuthContext);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const onSignup = async () => {
    setErr('');
    try {
      await doSignup(email, username, password);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Create your account</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Username" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      {err ? <Text style={{ color: 'red', marginBottom: 8 }}>{err}</Text> : null}

      <Button title="Sign up" onPress={onSignup} />
      <Text style={{ marginTop: 16, textAlign: 'center' }}>
        Already have an account? <Text style={{ fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>Log in</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, marginBottom: 10 },
});
