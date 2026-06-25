import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    resolve: {
        dedupe: ["three"],
    },
    plugins: [
        react(),
        {
            name: "thatopen-import-method-compat",
            enforce: "pre",
            transform(code, id) {
                const normalized = id.replace(/\\/g, "/");
                const isThatOpenBundle = normalized.includes("/node_modules/@thatopen/components/dist/index.mjs") ||
                    normalized.includes("/node_modules/@thatopen/components-front/dist/index.js");
                if (!isThatOpenBundle)
                    return null;
                return {
                    code: code.replace(/(\n\s*)import\(/g, '$1["import"]('),
                    map: null,
                };
            },
        },
    ],
    server: {
        host: "127.0.0.1",
        port: 5173,
    },
    optimizeDeps: {
        exclude: ["@thatopen/components", "@thatopen/components-front"],
    },
});
