import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cameraServiceTarget =
    env.CAMERA_SERVICE_PROXY_TARGET || "http://localhost:5600";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: [".trycloudflare.com"],
      proxy: {
        "/camera-stream": {
          target: cameraServiceTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/camera-stream/, ""),
        },
      },
    },
  };
});
