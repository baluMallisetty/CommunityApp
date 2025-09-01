// src/context/AuthContext.js
import React, { createContext, useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';

import { GOOGLE_CLIENT_ID, FACEBOOK_APP_ID } from '../config';
import { getTokens, clearTokens } from '../api/tokenStore';
import {
  getMe,
  login as apiLogin,
  signup as apiSignup,
  loginWithGoogle,
  loginWithFacebook,
  loginWithApple,
} from '../api/auth';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // On boot: restore session if token exists
  useEffect(() => {
    (async () => {
      try {
        const tokens = await getTokens();
        if (tokens?.accessToken) {
          const me = await getMe();
          setUser(me.user);
        }
      } catch {
        /* ignore */
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // ---- Custom auth (tenant hidden from users) ----
  const doLogin = async (emailOrUsername, password) => {
    await apiLogin({ tenantId: 't123', emailOrUsername, password });
    const me = await getMe();
    setUser(me.user);
  };

  const doSignup = async (email, username, password) => {
    // backend expects name; use username as default display name
    await apiSignup({ tenantId: 't123', email, username, password, name: username });
    const me = await getMe();
    setUser(me.user);
  };

  // ---- Google ----
  const [googleReq, googleRes, googlePrompt] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
  });
  useEffect(() => {
    (async () => {
      if (googleRes?.type === 'success') {
        const { authentication, params } = googleRes;
        const idToken = params?.id_token || authentication?.idToken;
        const accessToken = authentication?.accessToken;
        await loginWithGoogle({ idToken, accessToken });
        const me = await getMe();
        setUser(me.user);
      }
    })();
  }, [googleRes]);

  // ---- Facebook ----
  const [fbReq, fbRes, fbPrompt] = Facebook.useAuthRequest({
    clientId: FACEBOOK_APP_ID,
    responseType: AuthSession.ResponseType.Token,
  });
  useEffect(() => {
    (async () => {
      if (fbRes?.type === 'success') {
        const accessToken = fbRes?.authentication?.accessToken || fbRes?.params?.access_token;
        await loginWithFacebook({ accessToken });
        const me = await getMe();
        setUser(me.user);
      }
    })();
  }, [fbRes]);

  // ---- Apple (iOS only) ----
  const doAppleLogin = async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    await loginWithApple({ idToken: credential.identityToken });
    const me = await getMe();
    setUser(me.user);
  };

  const doLogout = async () => {
    await clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        booting,
        // make sure these names exist for consumers:
        doLogin,
        doSignup,
        googlePrompt,
        fbPrompt,
        doAppleLogin,
        doLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
