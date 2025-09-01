// src/screens/HomeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { request } from '../api/client';

export default function HomeScreen() {
  const [posts, setPosts] = useState([]);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      setErr('');
      const data = await request('/posts');
      setPosts(data.posts || []);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 8 }}>Feed</Text>
      {err ? <Text style={{ color: 'red' }}>{err}</Text> : null}
      <FlatList
        data={posts}
        keyExtractor={(i) => i._id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <Text style={{ fontWeight: '700' }}>{item.title}</Text>
            <Text>{item.content}</Text>
          </View>
        )}
      />
    </View>
  );
}
