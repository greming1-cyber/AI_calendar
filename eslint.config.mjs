import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno(Edge Function)·별도 패키지(MCP 서버)는 Next 린트 대상에서 뺀다.
    "supabase/functions/**",
    "mcp/**",
    // 병렬 세션용 worktree(각자 .next 산출물을 가짐)는 main 린트에서 뺀다.
    ".claude/**",
  ]),
]);

export default eslintConfig;
