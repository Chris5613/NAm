import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiTarget =
    env.REACT_APP_API_BASE_URL ||
    env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8001";

  return {
    plugins: [
      react({
        include: /\.[jt]sx?$/,
      }),
    ],
    envPrefix: ["VITE_", "REACT_APP_"],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 3000,
      proxy: {
        "/api": {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 3000,
    },
    build: {
      outDir: "build",
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: "jsdom",
      clearMocks: true,
      restoreMocks: false,
    },
  };
});
