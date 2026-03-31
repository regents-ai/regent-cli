import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageDir = path.join(repoRoot, "packages", "regent-cli");

const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageDir,
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "npm pack --dry-run failed\n");
  process.exit(result.status ?? 1);
}

const stdout = result.stdout.trim();
if (!stdout) {
  throw new Error("npm pack --dry-run returned no output");
}

const jsonStart = stdout.lastIndexOf("\n[");
const jsonPayload = jsonStart >= 0 ? stdout.slice(jsonStart + 1) : stdout;
const payload = JSON.parse(jsonPayload);
if (!Array.isArray(payload) || payload.length !== 1 || !Array.isArray(payload[0]?.files)) {
  throw new Error("unexpected npm pack --dry-run JSON shape");
}

const tarballFiles = payload[0].files.map((entry) => entry.path).sort();
const requiredFiles = ["LICENSE", "README.md", "package.json", "dist/index.js"];
const unexpectedFiles = tarballFiles.filter(
  (file) =>
    file !== "LICENSE" &&
    file !== "README.md" &&
    file !== "package.json" &&
    !file.startsWith("dist/"),
);

const missingFiles = requiredFiles.filter((file) => !tarballFiles.includes(file));

if (unexpectedFiles.length > 0 || missingFiles.length > 0) {
  const lines = ["packed CLI package contents did not match expectations"];

  if (missingFiles.length > 0) {
    lines.push(`missing: ${missingFiles.join(", ")}`);
  }

  if (unexpectedFiles.length > 0) {
    lines.push(`unexpected: ${unexpectedFiles.join(", ")}`);
  }

  throw new Error(lines.join("\n"));
}

process.stdout.write(
  `Packed CLI package contents verified (${tarballFiles.length} files): LICENSE, README.md, package.json, and dist/** only.\n`,
);
