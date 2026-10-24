# Re-freeze the Appium stack

Start only after the owner requests a re-freeze. A dependency update alone does not authorize one. Use an isolated worktree and preserve the previous release inputs until the replacement passes its live qualification.

1. Update the candidate stack under `.scratch/appium-mcp-migration/candidate-stack/`. Run the Phase 1 qualification on the authorized private devices. Record the new lock, every loaded file, the three Android APKs, and the toolchain in a new freeze record. Run all six iOS Phase 1 cases again, including the stop and fault cases. Follow the Phase 1 run instructions for device ownership and cleanup.
2. Build the runner from the XCUITest driver's bundled `appium-webdriveragent` package. Record the complete `xcodebuild build-for-testing` command, Xcode and SDK versions, file hashes, architectures, and actual signing results. Do not substitute the hoisted WDA package or an upstream download. The current source is WDA 16.14.2 inside XCUITest 12.17.1.
3. Compare the runner's sorted file hashes with the new freeze record. Compute its tree hash as SHA-256 over the concatenation of each UTF-8 relative path, a NUL byte, and its raw 32-byte SHA-256 digest. Sort paths by their UTF-8 bytes. Archive the runner under `wda/WebDriverAgentRunner-Runner.app/`, preserving executable bits. Use zero timestamps and owner IDs so repeated builds produce the same archive. Commit the archive under `stack/wda/` with an updated `provenance.json`. Keep package integrity, bundle integrity for bundled packages, the build command, and signing observations in that record.
4. Copy the candidate `package.json` and `package-lock.json` byte for byte to `stack/`. Replace `stack/freeze.json` with the new lock and package hashes, selected package records, Android APK records, and the union of loaded-file hashes from the new qualifying wire records. Reject conflicting hashes for the same path. Remove absolute checkout prefixes from APK paths so they start with `node_modules/`.
5. Update the WDA version and archive filename in `scripts/build-stack-archive.mjs`, the runtime manifest schema in `src/appium/stack.ts`, and the literal expectations in `tests/appium-stack.test.ts` and the packaging proof. If the qualified host, iOS, Xcode, or protocol versions change, update their guards and warnings with the new evidence. The current release toolchain is Node 26.8.1 and npm 11.19.0. Change either pin only as part of this owner-approved re-freeze.
6. Build the release inputs in this order:

   ```sh
   npm ci
   npm run build
   node scripts/build-stack-archive.mjs
   npm pack
   npm run build:plugin
   ```

   The archive builder selects the pinned Node and npm through `npx` when needed. It installs the unpruned darwin-arm64 tree with scripts disabled, checks the Phase 1 hashes, and writes both archives plus `manifest.json` under `stack/release/`. It writes the archive identities into `dist/appium/stack-identity.js`. Run it after every `npm run build`, because TypeScript clears `dist/`. Commit the WDA archive, provenance, freeze inputs, and generated `THIRD_PARTY_NOTICES.md`. Leave `stack/release/` and every `node_modules/` out of git.
7. Read the generated notices. Hand-check every package without a licence field, the Creative Commons attributions, WDA's verbatim BSD text, and the libvips source links and LGPL text. Keep all supplied licence and notice files in the unpruned archive. If libvips changes, update its component source versions and licence copies in `stack/licenses/`. The manifest records the containing archive's integrity for bundled packages. A Git dependency such as `fs-walk` has no registry integrity; keep its pinned `resolved` commit and every file hash instead of inventing an integrity value.
8. Run `npm run typecheck`, `node --import tsx --test tests/appium-stack.test.ts`, then `npm run check` with no competing test run. Run `node tests/fixtures/observed-packaging/proof.mjs`. The proof must unpack the actual npm tarball and plugin zip and extract their stacks with network and non-tar subprocesses denied. Both installations must select the same content-addressed directory under the proof's temporary `Application Support` location.
9. Re-record the Appium wire fixtures when the frozen identities change. Obtain the root's verification and the owner's merge approval. Follow the Phase 4 live release gates before publishing; this procedure does not authorize a release.

The qualified WDA provenance records Apple's runner signature and an unsuccessful strict bundle verification. Retain those observations rather than replacing them with a signing-support claim. The supported live pair remains iOS 26.5 and Xcode 27.0 until new evidence widens it. Other iOS and Xcode versions warn and continue; macOS on Apple silicon with Node 24 or later is required.
