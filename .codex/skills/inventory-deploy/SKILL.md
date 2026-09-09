---
name: inventory-deploy
description: Deploy the Inventory Management frontend when the user says `ong:deploy` or `2devs:deploy`; routes each command to its exact approved GitHub remote.
---

# Inventory Deploy

Use this skill only for the two exact deployment commands below in this workspace:

`/Users/apple/tofaal/cse/ongshak/inventory-management`

Before any deployment action, run `git rev-parse --show-toplevel`. If it is not exactly that path, stop and say that this skill is restricted to the Inventory Management project. Do not treat an ordinary request to “deploy” as either command; ask which target is intended.

| User command | Target | Remote command |
|---|---|---|
| `ong:deploy` | Main Ongshak GitHub repository | `git push origin main` |
| `2devs:deploy` | Tofaal9152 repository connected to Netlify | `git push tofaal main` |

The remote URLs must match before pushing:

- `origin`: `https://github.com/Ongshak-Tech/InventoryManagementFrontend.git`
- `tofaal`: `https://github.com/Tofaal9152/InventoryManagementFrontend.git`

## Safe deployment workflow

1. Confirm the Git top-level path is exactly the restricted project path above and the current branch is `main`. Do not switch branches automatically.
2. Read `git remote get-url` for the selected remote and stop if it does not exactly match the mapped URL.
3. Check `git status --short`. The command authorizes committing current, clearly in-scope project work for this deployment. Preserve unrelated or ambiguous changes and ask the user before including them.
4. Run the project test command (`npm test`). Stop on a failing test.
5. Make one concise conventional commit when there are in-scope unstaged changes, then push only the mapped remote’s `main` branch.

Never push to the other remote, use `--force`, rewrite history, change remotes, or publish directly to Netlify. The `tofaal` GitHub push triggers Netlify’s normal connected-repository deployment.

Report the selected remote, commit (if created), and push result. State explicitly that the other remote was not touched.
