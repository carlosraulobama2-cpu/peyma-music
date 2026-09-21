import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Este proyecto vive dentro del repo de la app Expo (que tiene su propio
  // package-lock.json) — sin esto, Turbopack duda entre los dos lockfiles
  // y adivina la raíz del workspace.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
