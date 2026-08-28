import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next ships flat config directly in v16 — no FlatCompat shim.
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "desktop/**"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
