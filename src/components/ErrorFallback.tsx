import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';

interface ErrorFallbackProps {
  onRetry: () => void;
}

// 네트워크 에러 시 표시할 폴백 화면
const ErrorFallback = ({onRetry}: ErrorFallbackProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>연결 오류</Text>
      <Text style={styles.message}>인터넷 연결을 확인해주세요</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>다시 시도</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#636E72',
    marginBottom: 32,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#6C5CE7',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorFallback;
