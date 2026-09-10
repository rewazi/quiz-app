import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        host: resolve(__dirname, "host.html"),
        play: resolve(__dirname, "play.html")
      }
    }
  }
});
