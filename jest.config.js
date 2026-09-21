module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|react-native-track-player|react-native-worklets|react-native-reanimated)',
  ],
  // Antes decía `setupFilesAfterSetup`, que Jest ignora en silencio:
  // los matchers de @testing-library nunca se registraban.
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@react-native-async-storage/async-storage$': '@react-native-async-storage/async-storage/jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/backend/'],
};
