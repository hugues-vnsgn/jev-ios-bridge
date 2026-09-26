# Clean install (release check 6)

On 2026-09-26, `npm pack` from the candidate code, then `npm install ./jev-ios-bridge-1.0.0.tgz` into an empty `npm init -y` project:

- **Tarball:** `jev-ios-bridge-1.0.0.tgz`, 63,233 bytes, SHA-256 `8dec62b03b4609e262ea0db0be3eab27aeb651018513e5500750e5035a9cc096`. This is a pre-tag pack; the published asset is packed again from the tagged commit and verified in phase 8.
- **Versions:** `npx jev-ios-bridge --version` prints `1.0.0`, and `node node_modules/jev-ios-bridge/dist/cli.js --version` prints `1.0.0`.
- **Contents:** the installed package holds 43 files, matching `files`: `dist/`, `skills/`, `README.md`, `docs/guide/`, `LICENSE`, `CHANGELOG.md`, and `package.json`. `mobilebuildmcp@2.7.1` is installed as its dependency.
