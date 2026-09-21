import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Si 5173 está ocupado, Vite por defecto se muda a 5174 sin avisar y el
    // panel arranca en un origen que el CORS del backend no conoce: todo
    // falla con "no se pudo conectar con el servidor" aunque la API esté
    // perfecta. Es preferible no arrancar y decir que el puerto está en uso.
    strictPort: true,
  },
})
