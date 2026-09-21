import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, readThemePreference } from './lib/themes'

// Antes de montar React: si se aplicara dentro de un efecto, el primer
// render usaría los colores por defecto y se vería un parpadeo al cambiar.
const saved = readThemePreference()
applyTheme(saved.themeId, saved.accent)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
