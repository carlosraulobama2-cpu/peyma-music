# Prompt: App de Streaming de Música (tipo Spotify) — Expo + React Native + TypeScript

## Rol y objetivo

Actúa como un ingeniero senior de aplicaciones móviles especializado en React Native, Expo y arquitecturas escalables. Vas a construir una aplicación de streaming de música moderna, fluida y visualmente sofisticada, inspirada en Spotify, usando **Expo (SDK más reciente)**, **React Native** y **TypeScript estricto**. El resultado debe sentirse pulido, con animaciones cuidadas, buen rendimiento y una arquitectura mantenible a largo plazo.

---

## 1. Stack técnico obligatorio

- **Expo SDK** (managed workflow, usando `expo-router` para navegación basada en archivos).
- **TypeScript** en modo `strict`, sin `any` salvo justificación explícita.
- **Estado global:** Zustand (o Redux Toolkit si se prefiere un patrón más estructurado) para: sesión de usuario, cola de reproducción, estado del reproductor, favoritos.
- **Reproducción de audio:** `expo-av` o `react-native-track-player` (preferido para reproducción en segundo plano, notificaciones de control y lockscreen).
- **Estilos:** NativeWind (Tailwind para RN) o `styled-components`, con sistema de diseño centralizado (tokens de color, tipografía, espaciado).
- **Animaciones:** `react-native-reanimated` v3 + `react-native-gesture-handler` para transiciones tipo "mini player → pantalla completa", scroll parallax, gestos de swipe.
- **Navegación:** `expo-router` con tabs inferiores, stacks anidados y modal para el reproductor a pantalla completa.
- **Datos/backend simulado:** API mock con `msw` o un backend ligero (Supabase / Firebase) para usuarios, playlists, canciones, likes.
- **Caché e imágenes:** `expo-image` con caché de disco para portadas de álbumes.
- **Persistencia local:** `expo-secure-store` para tokens, `AsyncStorage` o `MMKV` para preferencias y cola de reproducción.
- **Testing:** Jest + React Native Testing Library para componentes críticos (reproductor, cola, buscador).

---

## 2. Arquitectura del proyecto

```
/app                    → rutas (expo-router)
  /(tabs)
    index.tsx           → Inicio
    search.tsx          → Buscar
    library.tsx         → Tu biblioteca
  /player
    [trackId].tsx        → Reproductor a pantalla completa (modal)
  /playlist/[id].tsx
  /album/[id].tsx
  /artist/[id].tsx
/src
  /components           → UI reutilizable (Button, TrackRow, MiniPlayer, Carousel...)
  /features
    /player              → lógica del reproductor (store, hooks, controles)
    /library              → playlists, favoritos, descargas
    /search
    /auth
  /hooks
  /services              → llamadas API, integración con backend
  /store                 → estado global (zustand slices)
  /theme                 → tokens de diseño, dark/light mode
  /types                 → tipos e interfaces compartidas
  /utils
```

---

## 3. Funcionalidades clave (nivel "sofisticado")

### Reproductor
- Mini reproductor persistente en la parte inferior (encima de los tabs) con gesto de swipe hacia arriba para expandir a pantalla completa (animación tipo *shared element transition*).
- Pantalla de reproductor completo con: portada animada, letras sincronizadas (opcional, tipo karaoke), controles (play/pause, siguiente, anterior, shuffle, repeat), barra de progreso arrastrable, control de volumen.
- Cola de reproducción reordenable (drag & drop) con "Reproduciendo a continuación" y "Siguiente en cola".
- Reproducción en segundo plano y controles desde la pantalla de bloqueo / centro de control (iOS) y notificación multimedia (Android).
- Crossfade opcional entre canciones.

### Descubrimiento y navegación
- Home dinámico con secciones tipo carrusel: "Escuchado recientemente", "Hecho para ti", "Nuevos lanzamientos", con scroll horizontal y animaciones de entrada (fade/slide) al hacer scroll vertical.
- Buscador con debounce, resultados agrupados por tipo (canciones, artistas, álbumes, playlists) y historial de búsquedas.
- Páginas de Artista, Álbum y Playlist con hero header que colapsa al hacer scroll (efecto parallax).

### Biblioteca y personalización
- Playlists del usuario: crear, editar, reordenar canciones, portada personalizada.
- Favoritos ("Me gusta") con animación de corazón (like heart burst).
- Modo offline básico: simulación de descarga de canciones con indicador de progreso.
- Modo oscuro/claro con transición animada y persistencia de preferencia.

### Cuenta y sesión
- Onboarding con selección de géneros favoritos (para "personalizar" recomendaciones).
- Login simulado (email/social) con manejo de estado de sesión persistente.
- Perfil de usuario con configuración (calidad de streaming, notificaciones, cerrar sesión).

### Detalles de pulido ("sofisticación")
- Skeleton loaders (shimmer) mientras cargan datos, no spinners genéricos.
- Haptic feedback (`expo-haptics`) en acciones clave: like, play/pause, drag de cola.
- Transiciones de pantalla suaves y coherentes en toda la app (usando reanimated shared transitions donde aplique).
- Manejo robusto de estados: loading, error, vacío (empty states ilustrados, no solo texto).
- Accesibilidad: labels, tamaños de toque adecuados, contraste correcto en ambos temas.

---

## 4. Sistema de diseño

Definir en `/src/theme`:
- Paleta de color (inspirada en tonos oscuros tipo Spotify: negro profundo, verde acento personalizable, grises para texto secundario).
- Escala tipográfica (Inter, Poppins o similar vía `expo-font`).
- Espaciados y radios de borde consistentes (tokens, no valores mágicos).
- Componentes base: `Button`, `IconButton`, `Chip`, `Avatar`, `TrackRow`, `SectionHeader`, `Carousel`, `ProgressBar`.

---

## 5. Requisitos no funcionales

- Rendimiento: listas largas con `FlashList` (no `FlatList`) para scroll fluido.
- Código modular, tipado de extremo a extremo (props, stores, respuestas de API).
- Manejo de errores centralizado (boundary + toast/snackbar de errores).
- Convenciones de commits y estructura lista para escalar en equipo (ESLint + Prettier + Husky opcional).

---

## 6. Entregable esperado

1. Estructura de carpetas inicial completa según el punto 2.
2. Configuración de `expo-router`, tema (dark/light) y fuentes.
3. Store del reproductor (play, pause, next, prev, seek, cola) con `react-native-track-player`.
4. Componente `MiniPlayer` + pantalla `PlayerFullScreen` con transición animada.
5. Pantalla Home con datos mock y carruseles animados.
6. Pantalla de Búsqueda funcional con debounce.
7. Pantalla de Biblioteca con playlists y favoritos.
8. Documentación breve (README) explicando cómo correr el proyecto (`npx expo start`) y decisiones de arquitectura.

---

## 7. Instrucción final para el modelo/desarrollador

Genera el código de forma incremental: primero la arquitectura y configuración base, luego el sistema de diseño, después el reproductor (el corazón de la app), y finalmente las pantallas de descubrimiento y biblioteca. En cada paso, prioriza TypeScript estricto, componentes reutilizables y animaciones fluidas con Reanimated antes que soluciones "rápidas" con `Animated` de React Native básico. Evita cualquier referencia a marcas o logos reales de Spotify; el diseño debe ser "inspirado en" pero original.
