import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Platform } from 'react-native';

import { DEFAULT_TENANT_ID } from '../../config';
import { requestPasswordReset, confirmPasswordReset } from '../../api/auth';
import Button from '../../ui/Button';

export default function PasswordResetScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [resetUrl, setResetUrl] = useState('');

  const handleRequest = async () => {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Please enter the email tied to your account.');
      return;
    }
    setRequesting(true);
    setResetUrl('');
    setCanConfirm(false);
    setToken('');
    try {
      const resp = await requestPasswordReset({ tenantId: DEFAULT_TENANT_ID, email });
      const baseMessage = resp?.message || 'If an account exists for that email, check your inbox for the reset link.';
      setMessage(`${baseMessage} Follow the link from the email to finish in your browser.`);
      const hasToken = Boolean(resp?.token);
      setCanConfirm(hasToken);
      if (hasToken) {
        setToken(resp.token);
      }
      if (resp?.resetUrl) {
        setResetUrl(resp.resetUrl);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRequesting(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    setMessage('');
    if (!token.trim() || !password.trim()) {
      setError('Both the reset token and a new password are required.');
      return;
    }
    setConfirming(true);
    try {
      await confirmPasswordReset({ tenantId: DEFAULT_TENANT_ID, token, password });
      setMessage('Password updated! You can now log in with your new password.');
      setTimeout(() => navigation.navigate('Login'), 500);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.description}>
        Enter the email tied to your account. We'll create a reset token so you can choose a new password.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <Button title="Send reset link" onPress={handleRequest} loading={requesting} />

      {resetUrl ? (
        <Text selectable style={styles.tokenBox}>Reset URL (dev only): {resetUrl}</Text>
      ) : null}

      {canConfirm ? (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.subtitle}>Have a reset token?</Text>
          <Text style={styles.description}>Enter it below along with your new password.</Text>
          {token ? <Text selectable style={styles.tokenBox}>{token}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Reset token"
            autoCapitalize="none"
            value={token}
            onChangeText={setToken}
          />
          <TextInput
            style={styles.input}
            placeholder="New password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button title="Update password" onPress={handleConfirm} loading={confirming} />
        </View>
      ) : null}

      {message ? <Text style={[styles.feedback, { color: '#047857' }]}>{message}</Text> : null}
      {error ? <Text style={[styles.feedback, { color: '#dc2626' }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#6B7280',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  tokenBox: {
    fontFamily: Platform?.OS === 'web' ? 'monospace' : undefined,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    color: '#111827',
  },
  feedback: {
    marginTop: 16,
    textAlign: 'center',
  },
});
