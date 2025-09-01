import React, { createContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMe, login as apiLogin, signup as apiSignup } from '../api';
export const AuthContext = createContext();
export function AuthProvider({ children }){
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{(async()=>{ const token=await AsyncStorage.getItem('token'); if(token){ try{ const me=await getMe(); setUser(me.user);}catch{await AsyncStorage.removeItem('token');}} setLoading(false);})()},[]);
  const login = async (tenantId, emailOrUsername, password) => { const { token, user } = await apiLogin({ tenantId, emailOrUsername, password }); await AsyncStorage.setItem('token', token); setUser(user); };
  const signup = async (tenantId, email, username, password, name) => { const { token, user } = await apiSignup({ tenantId, email, username, password, name }); await AsyncStorage.setItem('token', token); setUser(user); };
  const logout = async () => { await AsyncStorage.removeItem('token'); setUser(null); };
  return <AuthContext.Provider value={{ user, login, signup, logout, loading }}>{children}</AuthContext.Provider>;
}