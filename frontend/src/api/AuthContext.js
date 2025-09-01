// src/context/AuthContext.js
import React, { createContext, useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';

import { GOOGLE_CLIENT_ID, FACEBOOK_APP_ID } from '../config';
import { getTokens, saveTokens, clearTokens } from '../api/tokenStore';
import { getMe, login, signup, loginWithGoogle, loginWithFacebook, loginWithApple } from '../api/auth';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Boot: restore session if possible
  useEffect(() => {
    (async () => {
      try {
        const tokens = await getTokens();
        if (tokens?.accessToken) {
          const me = await getMe();
          setUser(me.user);
        }
      } catch {
        // ignore; user will see login
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // --- Custom ---
// src/context/AuthContext.js (only relevant part shown)
const doLogin = async (emailOrUsername, password) => {
    const data = await login({ tenantId: 't123', emailOrUsername, password });
    const me = await getMe();
    setUser(me.user);
    return data;
  };
  
// src/context/AuthContext.js
const doSignup = async (email, username, password) => {
    // pass a fallback name so backend isn't broken
    const data = await signup({ tenantId: 't123', email, username, password, name: username });
    const me = await getMe();
    setUser(me.user);
    return data;
  };
  

  // --- Google ---
  const [googleReq, googleRes, googlePrompt] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    (async () => {
      if (googleRes?.type === 'success') {
        const { authentication, params } = googleRes;
        // Some flows return id_token on params, some on authentication
        const idToken = params?.id_token || authentication?.idToken;
        const accessToken = authentication?.accessToken;
        const data = await loginWithGoogle({ idToken, accessToken });
        const me = await getMe();
        setUser(me.user);
      }
    })();
  }, [googleRes]);

  // --- Facebook ---
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

  // --- Apple (iOS only) ---
  const doAppleLogin = async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    // identityToken is the important one
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
        user, booting,
        // custom
        doLogin, doSignup,
        // google
        googlePrompt, googleReq,
        // facebook
        fbPrompt, fbReq,
        // apple
        doAppleLogin,
        // session
        doLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
