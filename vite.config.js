import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/cm": {
        target: "http://localhost:6500",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/cm/, ""),
      },
      "/admin": {
        target: "http://localhost:6500",
        changeOrigin: true,
        secure: false,
      },
      "/public": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/public/, ""),
      },
    },
  },
})
