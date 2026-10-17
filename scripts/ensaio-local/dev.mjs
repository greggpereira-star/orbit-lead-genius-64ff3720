/** Inicia o Vite de desenvolvimento com as variáveis de .env.ensaio.local (ensaio local). */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
const env = { ...process.env };
for (const l of readFileSync(join(raiz, ".env.ensaio.local"), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i)] = l.slice(i + 1);
}
const f = spawn("npx", ["vite", "dev", "--host", "127.0.0.1", "--port", process.env.PORT ?? "8081"], { cwd: raiz, env, stdio: "inherit" });
f.on("exit", (c) => process.exit(c ?? 0));
