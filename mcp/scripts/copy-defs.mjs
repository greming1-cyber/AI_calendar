// 도구 정의의 단일 출처(supabase/functions/_shared/life/defs.ts)를 src/generated/로 복사한다. npm run build 전에 실행된다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../supabase/functions/_shared/life/defs.ts");
const dest = path.resolve(here, "../src/generated/defs.ts");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `// 자동 생성: ${path.relative(path.dirname(dest), src).replaceAll("\\", "/")} 사본. 직접 고치지 않는다.\n${fs.readFileSync(src, "utf8")}`);
console.log(`도구 정의 복사: ${dest}`);
