// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // `web/` (Next.js) y `admin/` (Vite) son proyectos aparte, cada uno con
    // su propio linter — se corren desde ahí (`cd web && npm run lint`,
    // `cd admin && npm run lint`), no con las reglas de React Native de acá.
    //
    // OJO: `backend/` NO se ignora. No tiene config propia y usa ésta, así
    // que excluirlo aquí lo deja sin analizar en silencio: `eslint .` desde
    // backend sigue saliendo verde sin haber mirado un solo archivo.
    // Lo que sí se ignora es el JavaScript COMPILADO de cualquier proyecto
    // (`**/dist/**`), que aparece al construir y no lo escribió nadie.
    //
    // `.expo/` lo genera Metro en cada arranque (los tipos de las rutas de
    // Expo Router). Analizarlo sólo produce avisos sobre código que nadie
    // escribió y que se reescribe solo al siguiente `expo start`.
    ignores: ['**/dist/**', 'web/**', 'admin/**', '.expo/**'],
  },
  {
    // Scripts de build (p. ej. generate-assets.js) corren en Node, no en
    // el runtime de React Native — necesitan sus globals (Buffer, __dirname…).
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // `react-hooks/immutability` (the new React Compiler rule set) assumes
    // any `.value` write is a mutation of React state. Reanimated shared
    // values are the one deliberate exception: mutating `.value` outside of
    // React's render cycle is the documented, correct way to drive UI-thread
    // animations without a JS-thread round trip. Disabling this repo-wide
    // because the app uses Reanimated throughout for its core animations.
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
]);
