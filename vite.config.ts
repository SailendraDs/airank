import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isReplit = !!process.env.REPLIT_DEV_DOMAIN || !!process.env.REPL_ID;

export default defineConfig(async () => {
  const replitPlugins: Record<string, () => Promise<any>> = {};

  if (isReplit) {
    const [{ runtimeErrorOverlay }] = await Promise.all([
      import("@replit/vite-plugin-runtime-error-modal"),
    ]);
    replitPlugins.runtimeErrorOverlay = runtimeErrorOverlay;

    if (process.env.REPLIT_DEV_DOMAIN) {
      const [{ cartographer }] = await Promise.all([
        import("@replit/vite-plugin-cartographer"),
      ]);
      replitPlugins.cartographer = cartographer;
    }
  }

  const plugins = [
    react(),
    tailwindcss(),
    ...(isReplit ? [replitPlugins.runtimeErrorOverlay()] : []),
    ...(isReplit && !!process.env.REPLIT_DEV_DOMAIN ? [replitPlugins.cartographer()] : []),
    ...(isReplit ? [(await import("./vite-plugin-meta-images")).metaImagesPlugin()] : []),
  ];

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    css: {
      postcss: {
        plugins: [],
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
