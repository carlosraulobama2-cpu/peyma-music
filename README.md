# Peyma Music

Aplicación de streaming de música moderna y fluida, inspirada en las mejores prácticas de diseño y arquitectura, construida con React Native y Expo. Incluye una API propia (Express + Prisma + PostgreSQL) lista para reemplazar la capa de datos simulada.

## Tecnologías principales

**App (`/`)**
- **Framework:** Expo SDK 57 (Managed Workflow) + Expo Router (navegación basada en archivos)
- **Lenguaje:** TypeScript estricto
- **Estado global:** Zustand
- **Reproducción de audio:** React Native Track Player (reproducción en segundo plano, controles de lockscreen/notificación)
- **Estilos:** `StyleSheet` + un sistema de tokens propio (`src/theme`), con soporte claro/oscuro/automático
- **Animaciones y gestos:** React Native Reanimated 4 + Gesture Handler
- **Imágenes:** Expo Image (caché en disco y memoria)

**Backend (`/backend`)**
- Express 5 + TypeScript, Prisma 7 (driver adapters) sobre PostgreSQL
- Seguridad: Helmet, CORS restringido por env, rate limiting (general + login/registro), bcrypt (12 rounds), JWT
- Observabilidad: logging estructurado con Pino, `/health` y `/ready`
- Apagado ordenado (`SIGTERM`/`SIGINT`) y pool de conexiones configurable

## Decisiones de arquitectura

1. **Estructura modular (`/src` y `/app`):** el enrutamiento vive en `/app` (Expo Router); toda la lógica de negocio, componentes, tema, estado y tipos residen en `/src`, así las pantallas quedan enfocadas en presentación.

2. **Estado (Zustand):** dividido en *slices*: `playerStore` (reproducción/cola/temporizador de apagado, sincronizado 1:1 con TrackPlayer), `authStore` (sesión, tipo de cuenta), `libraryStore` (favoritos, playlists propias, artistas seguidos, descargas), `artistStore` (perfil y estadísticas de artista), `settingsStore` (calidad de audio, notificaciones, descargas), `notificationsStore`, `sheetStore` (menús de opciones globales), `themeStore` y `toastStore`.

3. **Sistema de diseño (`src/theme`):** una única paleta de tokens (`tokens.ts`) resuelta en runtime por `useTheme()`/`useThemedStyles()` según la preferencia del usuario (claro/oscuro/automático vía `useColorScheme`). Sin "magic values": color, tipografía, espaciado, radios y curvas de animación salen todos de ahí.

4. **Animaciones y rendimiento:** Reanimated corre en el hilo de UI para no bloquear JS; `FlashList` para listas largas; `useThemedStyles` cachea las hojas de estilo por tema para no recrearlas en cada render de fila.

5. **Capa de datos simulada (`src/services/api.ts`):** delays realistas + cancelación vía `AbortSignal`, para poder probar skeletons y estados de error sin depender de una red real. El hook `useAsyncData` centraliza el patrón *loading/error/refresh* que antes se repetía en cada pantalla.

6. **Backend independiente:** modela el mismo dominio (canciones, álbumes, artistas, playlists, favoritos, "seguir artista") con relaciones reales en Postgres — listo para sustituir la capa mock cuando haga falta, sin que eso bloquee el desarrollo de la app.

7. **Manejo de errores:** `ErrorBoundary` en la raíz evita que una excepción tumbe toda la app; `ToastHost` + el store `toast` dan feedback no bloqueante; `EmptyState` unifica los estados vacíos/error en toda la app.

## Navegación

5 tabs: **Inicio**, **Buscar**, **Explorar** (géneros), **Tu biblioteca** y **Studio** (sólo visible con cuenta de artista — se oculta con `href: null` en vez de desaparecer del código).

## Funcionalidades

**Reproductor**
- Mini player + pantalla completa, cola reordenable, shuffle, repeat, crossfade, volumen arrastrable.
- Reproducción en segundo plano y controles desde notificación/lockscreen (`react-native-track-player`).
- Temporizador de apagado ("apagar en 15/30/45/60 min").
- Radio de una canción: genera una cola priorizando al mismo artista.

**Cuenta y sesión**
- Login en tres pasos (correo → contraseña → confirmación) y onboarding con selección de géneros.
- Dos tipos de cuenta: **oyente** y **artista**. Convertirse en artista se hace desde Ajustes.

**Cuenta de artista (Studio)**
- Panel con oyentes mensuales, seguidores y reproducciones totales.
- "Dónde te escuchan": desglose por país con barras de porcentaje.
- Tus canciones más escuchadas (top tracks con reproducciones).
- Publicar canciones propias desde el dispositivo, visibles en tu perfil de Studio.

**Biblioteca y descubrimiento**
- Crear playlists propias, subir canciones desde el dispositivo, marcar una playlist como pública/privada.
- Seguir artistas — carrusel "Artistas que sigues" en Biblioteca.
- Filtros de biblioteca: Todo / Playlists / Me gusta / Descargas / Recientes.
- Buscar con categorías (Canciones, Artistas, Álbumes, Playlists), no sólo canciones.
- Explorar por género (pestaña nueva).
- Top Charts con la canción #1 destacada (`NumberOneSpotlightCard`).
- Menú de opciones "···" en cualquier canción: añadir a playlist, descargar, radio, compartir, ver artista/álbum.
- Notificaciones (acceso desde la campana en Inicio).

**Preferencias**
- Modo claro/oscuro/automático con transición animada.
- Calidad de audio, notificaciones y descarga sólo por WiFi, todo persistido.

## Cómo ejecutar el proyecto

### App

```bash
npm install
npx expo start
```

Presiona `i` (iOS), `a` (Android) o escanea el QR con Expo Go.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # jest
```

### Backend

```bash
cd backend
npm install
docker compose up -d          # Postgres local
cp .env.example .env          # y ajusta JWT_SECRET
npm run prisma:migrate        # crea las tablas
npm run db:seed               # datos de ejemplo
npm run dev                   # http://localhost:3000
```

```bash
npm run typecheck
npm run lint
npm run build && npm start    # build de producción
```

### Web pública (`/web`)

```bash
cd web
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL apunta al backend
npm run dev                   # http://localhost:3001
```

### Panel de administración (`/admin`)

```bash
cd admin
npm install
cp .env.example .env          # VITE_API_URL apunta al backend
npm run dev                   # http://localhost:5173
```

El panel **sólo acepta cuentas con rol `ADMIN`**, y ni el seed ni el registro
público crean una: las dos dejan la cuenta en `USER`. La primera cuenta de
administrador se crea desde el backend:

```bash
cd backend
npm run admin:create -- --email=tu@correo.com --name="Tu Nombre"
```

Pregunta la contraseña sin mostrarla. Si el correo ya existe lo asciende a
`ADMIN` en vez de fallar, así que el mismo comando sirve para recuperar el
acceso; con `--reset` además cambia la contraseña. `--help` lista todo.

Con los datos de ejemplo, `demo@peyma.music` / `demo12345` ya es
administrador.

---
*Desarrollado con ❤️ para Peyma*
