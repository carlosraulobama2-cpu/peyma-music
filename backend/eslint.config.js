/**
 * ESLint del backend.
 *
 * Existe por una razón concreta: antes no había ninguno aquí y `npm run lint`
 * caía en la configuración de la raíz, que está hecha para la app de React
 * Native y que además ignoraba `backend/**`. El resultado era el peor
 * posible: el comando salía verde sin haber analizado un solo archivo.
 *
 * Aplicar aquí las reglas de Expo tampoco serviría — esto es Node, no React
 * Native: no hay componentes, ni hooks, ni JSX, y sus reglas o no aplican o
 * dan falsos positivos. Lo que sí aplica son las reglas base de ESLint sobre
 * código ya parseado como TypeScript.
 *
 * Se usa sólo el parser de `@typescript-eslint` y no su conjunto de reglas
 * con información de tipos: ese necesitaría el plugin, que no está instalado,
 * y `tsc --noEmit` (que sí corre en cada control) ya cubre todo lo que el
 * sistema de tipos puede decir. Aquí se busca lo que el compilador NO ve:
 * variables sin usar, `case` sin `break`, comparaciones siempre ciertas.
 */
const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      /**
       * Las desactivadas de abajo son ruido conocido del parser de TypeScript
       * sobre reglas pensadas para JavaScript plano, no hallazgos reales:
       *
       * `no-unused-vars` de ESLint no entiende los tipos ni los parámetros
       * marcados con `_`, así que marca como muerto código que sí se usa. De
       * eso se encarga `noUnusedLocals` de TypeScript, que sí lo entiende.
       *
       * `no-undef` no conoce los tipos globales de TypeScript (`NodeJS`,
       * `Express`), y el compilador ya falla si algo no existe de verdad.
       */
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // Redeclarar es legítimo en TypeScript (interfaz + función, sobrecargas).
      'no-redeclare': 'off',

      // Lo que sí queremos que salte:
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-fallthrough': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-compare': 'error',
      'no-unreachable-loop': 'error',

      /**
       * `require-atomic-updates` queda fuera a propósito.
       *
       * Se probó y dio cinco avisos, los cinco sin valor: tres por
       * `req.user = …` en los middleware de autenticación (cada petición
       * tiene su propio `req`, no hay estado compartido), uno por una
       * variable local dentro de un handler, y uno por la caché de ajustes,
       * donde dos llamadas simultáneas escribirían exactamente el mismo
       * valor tras leer la misma fila.
       *
       * La regla no distingue "compartido entre peticiones" de "local a
       * una", que es justo la distinción que haría falta en un servidor
       * Express. Dejarla activa obliga a sembrar el código de excepciones y,
       * peor, acostumbra a pasar por encima de la salida del linter.
       */
    },
  },
  {
    // Los scripts sueltos sí imprimen por consola: es su interfaz.
    files: ['scripts/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
