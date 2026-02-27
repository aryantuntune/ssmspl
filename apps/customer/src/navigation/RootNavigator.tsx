import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

export default function RootNavigator() {
  const { isCheckingAuth, isAuthenticated } = useSelector((s: RootState) => s.auth);

  if (isCheckingAuth) {
    // AuthNavigator starts with Splash which triggers checkAuthStatus
    return <AuthNavigator />;
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
}
