import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const apiTarget =
    env.BLOCKVAULT_API_PROXY_TARGET ||
    "http://127.0.0.1:8081";

  const cameraServiceTarget =
    env.CAMERA_SERVICE_PROXY_TARGET ||
    "http://127.0.0.1:5600";

  const proxy = {
    "/bvs-api": {
      target: apiTarget,
      changeOrigin: true,
      rewrite: (path) =>
        path.replace(/^\/bvs-api/, ""),
    },

    "/bvs-camera": {
      target: cameraServiceTarget,
      changeOrigin: true,
      rewrite: (path) =>
        path.replace(/^\/bvs-camera/, ""),
    },

    "/camera-stream": {
      target: cameraServiceTarget,
      changeOrigin: true,
      rewrite: (path) =>
        path.replace(/^\/camera-stream/, ""),
    },
  };

  return {
    plugins: [react()],

    server: {
      host: "0.0.0.0",
      allowedHosts: [".trycloudflare.com"],
      proxy,
    },

    preview: {
      host: "0.0.0.0",
      proxy,
    },
  };
});
