# AGENTS.md

## Project Overview
`@dsnbyte/pi-tools-manager` is an interactive TUI extension for Pi Coding Agent to inspect, search, and toggle installed tools.

---

## Release & Changelog Workflow

When the user asks to release, publish, or bump a new version (e.g., *"release new version"*, *"publish version 0.2.0"*, *"create a new release"*), the agent must follow this standardized procedure:

### 1. Determine Target Version & Bump `package.json`
- Identify the target semver bump (`patch`, `minor`, or `major`) based on user request or commit nature:
  - `patch` (e.g. `0.1.0` -> `0.1.1`): Bug fixes, minor adjustments, maintenance.
  - `minor` (e.g. `0.1.0` -> `0.2.0`): New features, enhancements, new UI views.
  - `major` (e.g. `0.1.0` -> `1.0.0`): Breaking changes, major overhaul.
- Update the `"version"` field in `package.json`.

### 2. Generate Polished, User-Friendly `CHANGELOG.md`
- Inspect commits since the last release tag:
  ```bash
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  # If tag exists: git log $LAST_TAG..HEAD --oneline
  # If no previous tag: git log --oneline
  ```
- Synthesize the commit history into a **user-friendly**, descriptive, and concise changelog:
  - Do not merely dump raw git commit messages or technical jargon.
  - Highlight the actual value, behavior changes, or fixed issues for the end user.
  - Categorize entries cleanly:
    - `### Added` (New features and capabilities)
    - `### Changed` (Modifications to existing features)
    - `### Fixed` (Bug fixes and stability improvements)
- Use standard Pi Package heading format so Pi's **Extension Updates** can read it properly:
  ```markdown
  ## [X.Y.Z] - YYYY-MM-DD

  ### Added
  - Description of new feature...

  ### Fixed
  - Description of fix...
  ```
- Prepend the new section directly below the `# Changelog` header in `CHANGELOG.md`.

### 3. Commit & Tag
- Stage files: `package.json` and `CHANGELOG.md`.
- Formulate a clean commit message following Conventional Commits, e.g.:
  `chore(release): bump version to vX.Y.Z`
- Delegate the commit to the `git-committer` subagent per user/project instructions.
- Create an annotated git tag:
  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  ```

### 4. Push to GitHub
- Push the commit and tag to GitHub:
  ```bash
  git push origin main
  git push origin vX.Y.Z
  ```

### 5. Publish to npmjs
- Verify the package contents before publishing:
  ```bash
  npm pack --dry-run
  ```
- Publish the package:
  ```bash
  npm publish --access public
  ```
- **Handling 2FA/OTP**: If npm prompts for One-Time Password (OTP) or web authentication, inform the user or request the OTP to finalize publication. If the terminal session is non-interactive, provide the exact one-line command (`npm publish --access public`) for the user to run directly.
