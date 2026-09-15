---
name: api-sync
description: Pull the latest backend API collection into this repo and write a changelog of which endpoints were added, updated or removed. Reports only — it never edits frontend code unless the user separately asks for the integration. Use when the user says "/api-sync", "sync the api", "new apis eseche", asks what backend endpoints changed, or asks to integrate a new/updated API.
---

# api-sync — bring in the latest backend APIs

```
node .claude/skills/api-sync/sync.mjs
```

Every run produces exactly two things, always:

1. **`docs/bruno/`** — the collection, refreshed to the remote's current state.
2. **`docs/api-changes/<date>_<time>_<from>-to-<to>.md`** — one changelog listing every
   endpoint Added / Updated / Removed since the checkpoint. Written even when nothing
   changed (every section reads `None`), so there is always a dated record of the check.

**A sync never writes frontend code.** It mirrors, it reports, it stops. Integrating is a
separate ask — see "Integrating" below — because the user may want to read the changelog
first, scope the work, or do it themselves. Do not start editing `src/` off the back of a
sync, however obvious the change looks.

Nothing else is tracked. Whether the frontend work is genuinely finished is a judgement
call, so the script does not try to guess it.

## Ground rules

- **Never touch a local clone of the backend repo.** The script fetches straight from
  the remote into a cache under the OS temp folder. Do not `cd` into a backend checkout,
  do not pull, and never push there — read access to the spec, nothing more.
- Everything project-specific lives in `.claude/api-sync.json`. This skill folder is
  copied between projects unchanged; only that file differs.
- `docs/bruno/` is a mirror, not a working folder. It is wiped and rewritten on every
  sync, so never hand-edit anything inside it.

## The checkpoint

`fromCommit` in `.claude/api-sync.json` is where the next changelog starts measuring.

**Every sync moves it** to whatever it just pulled. So a changelog always covers *since
the last sync*, and an endpoint is never reported twice — sync, sync again a week later,
and the second file starts where the first stopped.

Nothing is confirmed by hand. Whether the frontend work actually got done is not tracked
anywhere: if the user syncs and integrates nothing, the changes still live in that dated
changelog file, they are simply not repeated in the next one. When they want to know what
is outstanding, the answer is "read the recent changelogs", not "re-run the sync".

`.claude/api-sync.json` is committed, so the checkpoint travels to the user's other
machine. Remind them to commit it (`claude:push` / `claude:deploy`, see the `git-flow`
skill), or that machine will re-report a range this one already has a changelog for.

`--done` used to move the checkpoint by hand. It is gone; the flag still runs, but only to
say so.

## Steps

1. **Sync.** Run the script. It prints the changed endpoints and writes the changelog.
   Nothing new? Say so and stop — do not invent work.

2. **Read only the changed files.** The collection holds hundreds of spec files and
   reading it whole wastes the context budget for no gain. Open exactly the ones listed,
   under `docs/bruno/`.

3. **Do not trust the "Added" list alone.** An **Updated** entry regularly carries a
   brand-new request/response field, and a field the frontend never modelled can be
   silently dropped on save. For every Updated endpoint, diff its payload against the
   matching schema/type in this repo and report fields that exist on one side only —
   in both directions.

4. **Report and stop.** Say what changed, link the changelog, and name the frontend files
   each change would touch — without touching them. Then ask whether they want it
   integrated. Do not edit `src/`, do not "just add the type while I'm here".

5. **Tell them to commit `.claude/api-sync.json`.** The sync already moved the checkpoint;
   committing it is what stops the other machine repeating this range. There is nothing
   else to confirm.

## Integrating

Only on a separate, explicit ask — "integrate it", "koro", "do the b_grade_weights one".
A sync in the same conversation is not that ask.

Then follow this project's own conventions (see `CLAUDE.md`): schema → service/query hook
→ form → detail view. If they scoped it ("just the clone one"), do that and say plainly
what you left out.

The changelogs are the backlog. When they ask what is outstanding, read the recent `.md`
files rather than re-running the sync — the checkpoint has already moved past them.

## Reporting

Summarise in the user's own terms: which endpoints are new, which changed, which were
removed. Link the generated changelog file. Keep the raw diff out of the reply — that is
what the `.md` is for. Close by offering the integration; do not perform it.

## Other commands

```
node .claude/skills/api-sync/sync.mjs --status
```

Reports the remote head, what the local files are, and the changes outstanding — writing
nothing at all. Use it to answer "is there anything new?" without rewriting the mirror or
adding a changelog file.

## Using this in another project

Copy `.claude/skills/api-sync/` across. Then, rather than guessing where that backend
repo keeps its collection, ask:

```
node .claude/skills/api-sync/sync.mjs --find https://github.com/<org>/<backend-repo> [branch]
```

It lists every folder in that repo holding a `bruno.json` (or `collection.bru`) and
prints a ready-to-paste config. Nothing is cloned into the project and nothing is
written — it reads the repo's file list and throws the temporary copy away.

That gives you `.claude/api-sync.json`:

```json
{
  "repo": "https://github.com/<org>/<backend-repo>",
  "branch": "main",
  "folder": "<collection folder inside that repo>",
  "into": "docs/bruno",
  "changelog": "docs/api-changes",
  "fromCommit": null
}
```

`fromCommit: null` makes the first run a baseline — it mirrors the files and records the
current commit without a comparison, since there is nothing to compare against yet. Set
it to a real sha instead if the project has already integrated up to a known point. From
then on the script maintains it: each sync leaves it on the commit that sync pulled.

No code changes are ever needed to move this to a new repo. `into` and `changelog` are
wiped/created by the script, so make sure they are gitignored (or deliberately tracked)
to taste — this project keeps `docs/` ignored.
