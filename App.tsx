import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import WebViewScreen from './src/screens/WebViewScreen';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <WebViewScreen />
    </SafeAreaProvider>
  );
}

export default App;
