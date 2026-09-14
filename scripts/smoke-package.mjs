import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), "implication-chain-set-smoke-"));
const commandEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryRoot, "npm-cache"),
  npm_config_dry_run: "false",
};

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", projectRoot, "--ignore-scripts", "--pack-destination", temporaryRoot, "--json"],
    { cwd: projectRoot, encoding: "utf8", env: commandEnvironment },
  );
  const [packResult] = JSON.parse(packOutput);
  const packagedPaths = new Set(packResult.files.map((file) => file.path));

  for (const requiredPath of ["dist/index.js", "dist/index.d.ts", "README.md", "LICENSE"]) {
    if (!packagedPaths.has(requiredPath)) {
      throw new Error(`Published package is missing ${requiredPath}`);
    }
  }

  for (const packagedPath of packagedPaths) {
    if (packagedPath.endsWith(".tsbuildinfo") || packagedPath.includes(".test.")) {
      throw new Error(`Published package contains development artifact ${packagedPath}`);
    }
  }

  const consumerRoot = join(temporaryRoot, "consumer");
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, "package.json"),
    JSON.stringify({ name: "implication-chain-set-smoke-consumer", private: true, type: "module" }),
  );

  const tarballPath = join(temporaryRoot, packResult.filename);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarballPath],
    { cwd: consumerRoot, stdio: "pipe", env: commandEnvironment },
  );

  const runtimeCheck = [
    'import { ImplicationChainSet } from "implication-chain-set";',
    'const set = new ImplicationChainSet([["animal", "cat"]]);',
    'if (!set.implies("cat", "animal")) throw new Error("runtime import failed");',
  ].join("\n");
  execFileSync(process.execPath, ["--input-type=module", "--eval", runtimeCheck], {
    cwd: consumerRoot,
    stdio: "pipe",
  });

  const typeCheckSource = [
    'import { ImplicationChainSet } from "implication-chain-set";',
    'const set = new ImplicationChainSet([["animal", "cat"]]);',
    'const items: ReadonlySet<string> = set.items;',
    'set.getUpPaths("cat", "animal", { maxDepth: 1, maxPaths: 1 });',
    'void items;',
  ].join("\n");
  const typeCheckPath = join(consumerRoot, "index.ts");
  await writeFile(typeCheckPath, typeCheckSource);

  const executableSuffix = process.platform === "win32" ? ".cmd" : "";
  execFileSync(
    join(projectRoot, "node_modules", ".bin", `tsc${executableSuffix}`),
    [
      "--noEmit",
      "--target", "ES2022",
      "--module", "NodeNext",
      "--moduleResolution", "NodeNext",
      "--strict",
      typeCheckPath,
    ],
    { cwd: consumerRoot, stdio: "pipe" },
  );

  const installedManifest = JSON.parse(
    await readFile(join(consumerRoot, "node_modules", "implication-chain-set", "package.json"), "utf8"),
  );
  console.log(`Package smoke test passed for ${installedManifest.name}@${installedManifest.version}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
