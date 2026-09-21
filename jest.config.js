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
    // Apunta al ARCHIVO del mock, no a la carpeta: en async-storage 2.x el
    // directorio `jest/` no tiene index, así que mapearlo a secas dejaba a
    // Jest sin resolver el módulo y todas las suites que tocan un store
    // fallaban al arrancar.
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
  // `.kilo/worktrees` son copias completas del repositorio que crea otra
  // herramienta: sin excluirlas, Jest encuentra y ejecuta cada test dos
  // veces. `dist` lo genera `expo export`.
  testPathIgnorePatterns: ['/node_modules/', '/backend/', '/\\.kilo/', '/dist/'],
  modulePathIgnorePatterns: ['/\\.kilo/', '/dist/'],
};
