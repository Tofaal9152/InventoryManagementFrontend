#!/usr/bin/env node
/**
 * api-sync — mirrors an API collection (Bruno, or any folder of spec files)
 * from a backend git repo into this repo, and writes a changelog of every
 * endpoint added, updated or removed since the last checkpoint.
 *
 * Two things come out of every run, always: the refreshed collection, and one
 * changelog file. Nothing else is tracked — whether the frontend work is
 * actually finished is a judgement call, not something a script should be
 * guessing at.
 *
 * Project-agnostic on purpose: every project-specific value lives in
 * .claude/api-sync.json, so this file is copied between projects unchanged.
 *
 * It NEVER touches a local clone of the backend repo. Everything is fetched
 * straight from the remote into a cache under the OS temp directory, so there
 * is no way for this to pull, push, or otherwise disturb anyone's checkout.
 *
 * Every sync moves the checkpoint to whatever it just pulled, so a changelog
 * always covers "since the last sync" and no endpoint is ever reported twice.
 * Nothing has to be confirmed by hand — whether the frontend work actually got
 * done is not something this script tracks, and the dated changelogs are the
 * record of what landed when.
 *
 *   node .claude/skills/api-sync/sync.mjs            sync + write the changelog
 *   node .claude/skills/api-sync/sync.mjs --status   report only, change nothing
 *   node .claude/skills/api-sync/sync.mjs --find <repo-url> [branch]
 *       lists the collection folders in a repo you have not set up yet, so a
 *       new project's "folder" value never has to be guessed
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_PATH = ".claude/api-sync.json";
const STATE_FILE = ".sync-state.json";

/** Blobless + shallow keeps the cache tiny (a few MB instead of the whole
 * backend repo), while still giving real `git diff` between commits. */
const CLONE_ARGS = ["--filter=blob:none", "--no-checkout", "--depth=1"];
const DEEPEN_STEP = 100;
const DEEPEN_TRIES = 20;

// ---------------------------------------------------------------- utilities

const run = (args, cwd) =>
  execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

const tryRun = (args, cwd) => {
  try {
    return { ok: true, out: run(args, cwd) };
  } catch (error) {
    return { ok: false, out: String(error.stderr || error.message || error) };
  }
};

const say = (message) => process.stdout.write(`${message}\n`);

const die = (message) => {
  process.stderr.write(`api-sync: ${message}\n`);
  process.exit(1);
};

const pad = (value) => String(value).padStart(2, "0");

/** Local time, not UTC: the filename is read by a person who wants to know
 * when they ran it, in their own day. */
const stamp = () => {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}-${pad(now.getMinutes())}`,
    iso: now.toISOString(),
  };
};

const repoRoot = () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
  const found = tryRun(["rev-parse", "--show-toplevel"], here);
  if (!found.ok) die("not inside a git repository");
  return found.out;
};

// -------------------------------------------------------------- discovering

const args = process.argv.slice(2);

/** Answers "where does the collection live inside that backend repo?" without
 * cloning it. A blobless, checkout-less clone downloads the commit and tree
 * objects only - enough to list every path in the repo, a few hundred KB -
 * and a collection is simply the folder holding bruno.json (or collection.bru
 * for an older export). */
const findCollections = (repoUrl, branch) => {
  const dir = path.join(
    os.tmpdir(),
    "api-sync-find",
    crypto.createHash("sha1").update(repoUrl).digest("hex").slice(0, 16),
  );

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });

  say(`inspecting ${repoUrl}...`);

  const cloneArgs = ["clone", "--filter=blob:none", "--no-checkout", "--depth=1"];
  if (branch) cloneArgs.push("--branch", branch);

  const cloned = tryRun([...cloneArgs, repoUrl, dir]);
  if (!cloned.ok) die(`could not reach ${repoUrl}.\n${cloned.out}`);

  const head = tryRun(["rev-parse", "--short", "HEAD"], dir);
  const listed = tryRun(["ls-tree", "-r", "--name-only", "HEAD"], dir);
  if (!listed.ok) die(`could not read the file list.\n${listed.out}`);

  const folders = [
    ...new Set(
      listed.out
        .split("\n")
        .filter((file) => /(^|\/)(bruno\.json|collection\.bru)$/.test(file.trim()))
        .map((file) => {
          const dirname = path.posix.dirname(file.trim());
          return dirname === "." ? "" : dirname;
        }),
    ),
  ].sort();

  fs.rmSync(dir, { recursive: true, force: true });

  say("");
  if (!folders.length) {
    say("No Bruno collection found in this repo.");
    say('Point "folder" at whichever directory holds the spec files, or "" for the repo root.');
    return;
  }

  say(`Found ${folders.length} collection folder(s) at ${head.out || "HEAD"}:`);
  say("");
  for (const folder of folders) say(`  ${folder || "(repo root)"}`);

  say("");
  say("Use it in .claude/api-sync.json:");
  say("");
  say(
    JSON.stringify(
      {
        repo: repoUrl,
        branch: branch || "main",
        folder: folders[0],
        into: "docs/bruno",
        changelog: "docs/api-changes",
        fromCommit: null,
      },
      null,
      2,
    ),
  );
};

if (args[0] === "--find") {
  if (!args[1]) die("--find needs a repo url, e.g. --find https://github.com/org/repo [branch]");
  findCollections(args[1], args[2]);
  process.exit(0);
}

// ------------------------------------------------------------------- config

const ROOT = repoRoot();
const configFile = path.join(ROOT, CONFIG_PATH);

if (!fs.existsSync(configFile)) {
  die(`missing ${CONFIG_PATH} — see .claude/skills/api-sync/SKILL.md`);
}

const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

for (const key of ["repo", "branch", "folder", "into", "changelog"]) {
  if (!config[key]) die(`${CONFIG_PATH}: "${key}" is required`);
}

/** `into` is wiped and rewritten on every sync, so refuse anything that could
 * take the repository (or something outside it) with it. */
const guardDest = (value, key) => {
  const normalised = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalised || normalised === "." || normalised.startsWith("/")) {
    die(`${CONFIG_PATH}: "${key}" must be a folder inside the repo`);
  }
  if (normalised.split("/").includes("..")) {
    die(`${CONFIG_PATH}: "${key}" must not escape the repo`);
  }
  return normalised;
};

const intoRel = guardDest(config.into, "into");
const changelogRel = guardDest(config.changelog, "changelog");
const intoAbs = path.join(ROOT, intoRel);
const changelogAbs = path.join(ROOT, changelogRel);
const sourceFolder = config.folder.replace(/\\/g, "/").replace(/\/+$/, "");

const saveConfig = (patch) => {
  // doneAt belonged to the old manual checkpoint; the sync moves it now, so
  // the key is dropped on the first save rather than left to go stale.
  const { doneAt, ...rest } = { ...config, ...patch };
  void doneAt;
  fs.writeFileSync(configFile, `${JSON.stringify(rest, null, 2)}\n`);
};

// -------------------------------------------------------------------- cache

/** Keyed by remote + folder so several projects can share one temp area
 * without ever colliding. Living outside the repo means `npm ci`, a branch
 * switch, or a clean checkout can never wipe it, and it can never be
 * committed by accident. */
const cacheDir = path.join(
  os.tmpdir(),
  "api-sync-cache",
  crypto.createHash("sha1").update(`${config.repo}#${sourceFolder}`).digest("hex").slice(0, 16),
);

const ensureCache = () => {
  if (fs.existsSync(path.join(cacheDir, ".git"))) return;

  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cacheDir), { recursive: true });

  say(`fetching ${config.repo} (${sourceFolder} only)...`);
  const cloned = tryRun([
    "clone",
    ...CLONE_ARGS,
    "--branch",
    config.branch,
    config.repo,
    cacheDir,
  ]);
  if (!cloned.ok) die(`could not reach the source repo.\n${cloned.out}`);

  const sparse = tryRun(["sparse-checkout", "set", sourceFolder], cacheDir);
  if (!sparse.ok) die(`could not limit the checkout to "${sourceFolder}".\n${sparse.out}`);
};

const fetchLatest = () => {
  const fetched = tryRun(["fetch", "--filter=blob:none", "origin", config.branch], cacheDir);
  if (!fetched.ok) die(`could not fetch ${config.branch}.\n${fetched.out}`);

  const checkedOut = tryRun(["checkout", "-f", "FETCH_HEAD"], cacheDir);
  if (!checkedOut.ok) die(`could not check out ${config.branch}.\n${checkedOut.out}`);

  return run(["rev-parse", "--short", "HEAD"], cacheDir);
};

const hasCommit = (sha) => tryRun(["cat-file", "-e", `${sha}^{commit}`], cacheDir).ok;

/** The cache is shallow, so an older checkpoint may not be in it yet. Pull
 * history down in steps rather than downloading the whole repo. */
const reachBack = (sha) => {
  if (hasCommit(sha)) return true;

  for (let attempt = 0; attempt < DEEPEN_TRIES; attempt += 1) {
    const deepened = tryRun(
      ["fetch", "--filter=blob:none", `--deepen=${DEEPEN_STEP}`, "origin", config.branch],
      cacheDir,
    );
    if (hasCommit(sha)) return true;
    if (!deepened.ok) break;
  }

  tryRun(["fetch", "--filter=blob:none", "--unshallow", "origin", config.branch], cacheDir);
  return hasCommit(sha);
};

// ------------------------------------------------------------------ parsing

const METHOD_BLOCK =
  /^[ \t]*(get|post|put|patch|delete|head|options)[ \t]*\{([\s\S]*?)^[ \t]*\}/im;

/** Pulls "POST /administrator/manage-inv/?service_type=activity" out of a
 * .bru file. Template variables like {{baseURL}} are dropped so the line
 * reads as a real endpoint. */
const describe = (text, relPath) => {
  const block = text.match(METHOD_BLOCK);
  if (!block) return { label: relPath };

  const method = block[1].toUpperCase();
  const url = (block[2].match(/^[ \t]*url:[ \t]*(.+)$/m)?.[1] ?? "")
    .trim()
    .replace(/\{\{[^}]+\}\}/g, "")
    .trim();

  return { label: `${method} ${url}`.trim() };
};

const fileAt = (commit, repoPath) => {
  const shown = tryRun(["show", `${commit}:${repoPath}`], cacheDir);
  return shown.ok ? shown.out : "";
};

// ---------------------------------------------------------------- changelog

const SECTIONS = [
  ["A", "Added API Locations"],
  ["M", "Updated API Locations"],
  ["D", "Removed API Locations"],
];

const collectChanges = (from, to) => {
  if (from === to) return [];

  if (!reachBack(from)) {
    die(
      `commit ${from} is not in the source repo any more (rewritten or force-pushed?).\n` +
        `Fix by setting "fromCommit" in ${CONFIG_PATH} to a commit that still exists.`,
    );
  }

  const diff = tryRun(["diff", "--name-status", `${from}..${to}`, "--", sourceFolder], cacheDir);
  if (!diff.ok) die(`could not diff ${from}..${to}.\n${diff.out}`);

  return diff.out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawStatus, ...rest] = line.split("\t");
      const status = rawStatus[0];
      // Renames report the old path first; the new one is what exists now.
      const repoPath = rest[rest.length - 1];
      const relPath = repoPath.slice(sourceFolder.length + 1);
      const text = status === "D" ? fileAt(from, repoPath) : fileAt(to, repoPath);

      return { status: status === "R" ? "A" : status, file: relPath, ...describe(text, relPath) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
};

const buildChangelog = (from, to, entries, when) => {
  const commits =
    from === to ? { ok: true, out: "" } : tryRun(["log", "--oneline", "--no-decorate", `${from}..${to}`, "--", sourceFolder], cacheDir);

  const lines = [
    "# API Changes",
    "",
    `Source: ${config.repo} (${config.branch})`,
    `Commit range: \`${from}\` -> \`${to}\``,
    `Generated: ${when.date} ${when.time.replace("-", ":")}`,
    "",
    "## Backend Commits",
    "",
    "```txt",
    commits.ok && commits.out ? commits.out : "None",
    "```",
    "",
  ];

  for (const [status, heading] of SECTIONS) {
    const rows = entries.filter((entry) => entry.status === status);
    lines.push(`## ${heading}`, "");

    if (!rows.length) {
      lines.push("```txt", "None", "```", "");
      continue;
    }

    for (const row of rows) {
      lines.push("```txt", row.label, row.file, "```", "");
    }
  }

  return lines.join("\n");
};

// --------------------------------------------------------------------- copy

const mirror = () => {
  const source = path.join(cacheDir, sourceFolder);
  if (!fs.existsSync(source)) die(`"${sourceFolder}" does not exist in the source repo`);

  // Wiped rather than merged: an API deleted upstream has to disappear here
  // too, and a leftover .bru would keep advertising an endpoint that is gone.
  fs.rmSync(intoAbs, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(intoAbs), { recursive: true });
  fs.cpSync(source, intoAbs, { recursive: true });
};

/** Kept beside the changelogs rather than inside the mirror, so the collection
 * folder holds nothing but the API files themselves. */
const statePath = path.join(changelogAbs, STATE_FILE);

const readState = () => {
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
};

const writeState = (commit, when) => {
  fs.mkdirSync(changelogAbs, { recursive: true });
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(
      { repo: config.repo, branch: config.branch, commit, syncedAt: when.iso },
      null,
      2,
    )}\n`,
  );
};

// --------------------------------------------------------------------- main

ensureCache();
const head = fetchLatest();
const from = config.fromCommit;
const localState = readState();

say("");
say(`source     ${config.repo} (${config.branch})`);
say(`remote     ${head}`);
say(`files here ${localState?.commit ?? "(not synced yet)"}`);
say(`diff from  ${from ?? "(first run)"}`);
say("");

if (args[0] === "--done") {
  // Kept so an old habit (or an older copy of the SKILL) does not look broken.
  say("--done is no longer needed: every sync moves the checkpoint itself.");
  say("Nothing was changed. Run the sync with no flags.");
  process.exit(0);
}

if (args[0] === "--status") {
  const entries = from ? collectChanges(from, head) : [];
  say(
    from === head
      ? "Up to date — nothing new since the last sync."
      : `${entries.length} endpoint change(s) since ${from ?? "the start"}.`,
  );
  for (const entry of entries) say(`  ${entry.status}  ${entry.label}`);
  process.exit(0);
}

// --- a sync always produces both halves: the mirror, and one changelog file

const when = stamp();

mirror();
writeState(head, when);
say(`bruno     -> ${intoRel}`);

if (!from) {
  saveConfig({ fromCommit: head, syncedCommit: head, syncedAt: when.iso });
  say("");
  say(`First run — checkpoint set at ${head}, so there is nothing to compare against yet.`);
  say("From the next sync onwards you get a full changelog.");
  process.exit(0);
}

const entries = collectChanges(from, head);
const range = from === head ? `${head}-no-changes` : `${from}-to-${head}`;
const changelogFile = path.join(changelogAbs, `${when.date}_${when.time}_${range}.md`);

fs.mkdirSync(changelogAbs, { recursive: true });
fs.writeFileSync(changelogFile, buildChangelog(from, head, entries, when));

// The checkpoint moves with the mirror: the changelog just written IS the
// record of this range, so the next one starts where this one stopped and no
// endpoint is ever listed twice. Syncing without integrating anything is fine
// — the work still sits in the dated file, it just is not re-reported.
saveConfig({ fromCommit: head, syncedCommit: head, syncedAt: when.iso });

say(`changelog -> ${path.posix.join(changelogRel, path.basename(changelogFile))}`);
say("");

if (!entries.length) {
  say("No endpoint changes since the last sync.");
  process.exit(0);
}

const counts = SECTIONS.map(
  ([status, heading]) =>
    `${entries.filter((entry) => entry.status === status).length} ${heading.split(" ")[0].toLowerCase()}`,
).join(", ");

say(`${counts}`);
say("");
for (const entry of entries) {
  say(`  ${entry.status}  ${entry.label}`);
  say(`     ${entry.file}`);
}

say("");
say(`Checkpoint moved to ${head} — the next sync starts from here.`);
say(`Commit ${CONFIG_PATH} so your other machine starts from here too.`);
