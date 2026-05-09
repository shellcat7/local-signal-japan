#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  ".wrangler",
  ".turbo",
  ".cache",
  "coverage",
  "tmp"
]);

const ignoredFiles = new Set(["scripts/scan-secrets.mjs"]);

const contentRules = [
  { name: "OpenAI style API key", pattern: /sk-[A-Za-z0-9_-]{12,}/ },
  { name: "GitHub classic token", pattern: /ghp_[A-Za-z0-9_]{12,}/ },
  { name: "GitHub fine grained token", pattern: /github_pat_[A-Za-z0-9_]{12,}/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{12,}/ },
  { name: "Private key block", pattern: /BEGIN PRIVATE KEY/ },
  { name: "Cloudflare API token assignment", pattern: /CF_API_TOKEN\s*=/ },
  { name: "Bearer credential header", pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{8,}/ },
  { name: "Inline password assignment", pattern: /(?:^|[\s?&])password=[^\s"'&]{8,}/ },
  { name: "Inline token assignment", pattern: /(?:^|[\s?&])token=[^\s"'&]{8,}/ },
  { name: "Inline secret assignment", pattern: /(?:^|[\s?&])secret=[^\s"'&]{8,}/ }
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isBlockedSecretFile(relativePath) {
  const basename = path.basename(relativePath);

  if (basename === ".env.example") {
    return false;
  }

  return (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === ".dev.vars" ||
    basename.startsWith(".dev.vars.") ||
    basename.endsWith(".local")
  );
}

async function walk(currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = toPosix(path.relative(rootDir, fullPath));

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await walk(fullPath)));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

const findings = [];
const files = await walk(rootDir);

for (const file of files) {
  if (ignoredFiles.has(file.relativePath)) {
    continue;
  }

  if (isBlockedSecretFile(file.relativePath)) {
    findings.push(`${file.relativePath}: blocked local secret file pattern`);
    continue;
  }

  const info = await stat(file.fullPath);
  if (info.size > 1024 * 1024) {
    continue;
  }

  const buffer = await readFile(file.fullPath);
  if (!isProbablyText(buffer)) {
    continue;
  }

  const content = buffer.toString("utf8");
  for (const rule of contentRules) {
    if (rule.pattern.test(content)) {
      findings.push(`${file.relativePath}: ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secret exposure detected:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");
