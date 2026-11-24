# Release SOP: @rcrsr/claude-code-runner

This file defines how to release this package. `/conduct:cut-release <version>` reads it as the source of truth and follows it wherever it differs from the skill's defaults. A person can follow the same steps by hand.

## Summary

| Item                 | Value                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| Package              | `@rcrsr/claude-code-runner` (single npm package, no workspaces)                    |
| Version source       | `package.json` `version`                                                           |
| Synced files         | `package-lock.json` (root `version` and `packages[""].version`)                    |
| Sync command         | `npm version {version} --no-git-tag-version` (edits both files, no commit, no tag) |
| Changelog            | `CHANGELOG.md` only                                                                |
| Changelog heading    | `## [{version}] — {YYYY-MM-DD}` (em dash, U+2014, with a space on each side)       |
| Release branch       | `release/{version}`                                                                |
| Release commit       | `chore(release): {version}`                                                        |
| Squash-merge subject | `chore: v{version} — {short summary} (#{pr})`                                      |
| Tag                  | `v{version}`, annotated                                                            |
| Qualifier            | Not supported. This repo has one package, so every release covers the whole repo   |

## Constraints

- **`main` is protected.** It requires the `check (22)`, `check (24)` and `check (26)` status checks and linear history, and it applies those rules to admins too. A release must land through a pull request (PR). A direct push to `main` is rejected.
- **The tag publishes to npm.** Pushing a `v*` tag runs `.github/workflows/release.yml`. That workflow runs `npm ci`, `npm run build` and `npm run check`, then confirms the tag matches the `package.json` version. It then publishes to npm with `NPM_TOKEN` and creates the GitHub release with `--generate-notes`. Treat pushing the tag as the publish step.
- **npm versions are permanent.** A published version cannot be republished, even after `npm unpublish`. A broken release needs a new patch version.

## Choosing the version

The package is pre-1.0 (`0.x.y`):

- A breaking change to the CLI, a host function or the result-tag format bumps MINOR (`0.15.0` → `0.16.0`).
- Anything else that is listed in `Added`, `Changed` or `Security` bumps MINOR.
- A release that contains only `Fixed` entries bumps PATCH (`0.15.0` → `0.15.1`).

## Steps

### 1. Preflight

1. Start from `main` with a clean working tree: `git checkout main && git pull --ff-only && git status --porcelain`. The last command must print nothing.
2. Confirm `## [Unreleased]` in `CHANGELOG.md` has at least 1 entry. If it is empty, there is nothing to release.
3. Confirm `gh auth status` succeeds.

### 2. Branch and bump

```bash
git checkout -b release/{version}
npm version {version} --no-git-tag-version
```

Do not hand-edit `package.json` alone. If `package-lock.json` keeps the old version, `npm ci` in CI still passes, but the lockfile drifts from `package.json`.

Check that both files carry the new version:

```bash
git grep -n '"version": "{version}"' -- package.json package-lock.json
```

This must print 3 lines: 1 from `package.json` and 2 from `package-lock.json`.

### 3. Stamp the changelog

1. Rename `## [Unreleased]` to `## [{version}] — {YYYY-MM-DD}`, using `date +%F` for the date. Use the em dash form (`—`) that every earlier release heading uses, not a hyphen.
2. Insert an empty `## [Unreleased]` heading above the new dated heading.
3. Skip link references. `CHANGELOG.md` uses inline PR links and has no bottom reference block.
4. Move nothing between categories. Keep every `Security` and `Removed` entry in its own category, and keep every PR link.

When the skill runs, its Step 5.1 changelog guard checks rule 4. Do not skip it.

### 4. Verify locally

```bash
npm run check
npm run build
```

Both must pass. The lefthook pre-push hook runs `npm run check` again on push.

### 5. Commit, push, open the PR

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): {version}"
git push -u origin release/{version}
gh pr create --base main --head release/{version} --title "Release {version}" --body-file {notes}
```

The PR body starts with a prose narrative of the release: 1 lead sentence, then 1 short paragraph for each of the top 2 to 4 themes. A `## Changes` section follows it, and it repeats the stamped entries grouped by category.

### 6. Wait for the PR to clear

The PR is ready to merge when all 3 required checks pass, no review thread is unresolved, and `mergeStateStatus` is `CLEAN`. Use `/conduct:monitor-pr` to clear review comments or CI failures.

### 7. Merge and tag

Confirm with the release owner before this step. The tag push publishes to npm and cannot be undone.

```bash
gh pr merge {pr} --squash --delete-branch --subject "chore: v{version} — {short summary} (#{pr})"
git checkout main && git pull --ff-only
git tag -a v{version} -F {tag-message-file}
git push origin v{version}
```

The tag message is `Release {version}`, then a blank line, then the PR narrative. The squash subject follows the repo history, for example `chore: v0.15.0 — rill 0.19.3 upgrade, get_result last-tag fix (#10)`.

### 8. Let the workflow publish, then add the narrative

The release workflow creates the GitHub release itself, so do not run `gh release create`. This is the skill's Path B.

1. Watch the workflow: `gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')`.
2. Confirm npm has the version: `npm view @rcrsr/claude-code-runner@{version} version`.
3. Put the narrative above the generated `## What's Changed` list:

```bash
gh release view v{version} --json body -q .body > release-body.md
{ cat {notes}; printf '\n'; cat release-body.md; } > release-merged.md
gh release edit v{version} --notes-file release-merged.md
```

Passing `--notes-file {notes}` alone replaces the generated list. Always merge the two files.

The workflow titles the release `v{version}`, for example `v0.15.0`. Keep that title.

### 9. Close out

1. Delete the local release branch: `git branch -D release/{version}`.
2. Check the npm page and the GitHub release page once each.

## Recovery

| Failure                                                                  | Action                                                                                                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow fails before `npm publish` (check, build or version-match step) | Delete the tag (`git push origin :refs/tags/v{version}` and `git tag -d v{version}`), fix the problem on `main` through a PR, then tag again                                     |
| Workflow fails after `npm publish`                                       | The npm version is live. Rerun the failed job, or create the GitHub release by hand with `gh release create v{version} --title v{version} --generate-notes --notes-file {notes}` |
| Tag version does not match `package.json`                                | The workflow stops before publishing. Delete the tag and retag the correct commit                                                                                                |
| A published version is broken                                            | Release the next PATCH version with the fix. Do not reuse the version number                                                                                                     |
