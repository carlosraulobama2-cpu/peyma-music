/**
 * Peyma Music (panel) — Reglas de análisis estático
 *
 * El panel usaba oxlint mientras la raíz, `web/` y `backend/` usaban eslint.
 * No era una cuestión de gusto: son reglas distintas, así que un fallo que
 * en la web saltaba, aquí pasaba. El caso concreto que lo decidió fue un
 * `setState` síncrono dentro de un efecto en la web, que `eslint` marcó y
 * `oxlint` no tiene — y ese patrón también está en el panel.
 *
 * Se elige eslint y no al revés porque las reglas de hooks de React son las
 * que encuentran fallos de verdad en este código. Es más lento; a cambio
 * mira más.
 */
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
]);
