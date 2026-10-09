# Actionable static traces

These traces explain Source behavior at frozen candidate4fa9cc99. They were not executed. The approved v3 policy permits no atomic kernel-pinning claim; the P1 trace instead supplies an identity mismatch that the verifier itself observes. All fixture paths map into the fixture-owned temporary root (fixture25-29,91-109); its Source/launch113-141 are simulated. No native runtime replacement, metadata command or privileged concurrency was attempted.

## P1: Bind every proof to the enumeration candidate

Policy27 captures full namespace/ancestor/mount identity at Source349 and requires binding to subsequent proofs. mountedBundles367-382 compares candidate with the first proof371 and compares the remaining listing snapshots to that proof. Later verifyInstalledCompatibility431-436 invokes installedPlist300-306 with only path/host/process/signal. convertMounted199-213 has no expected candidate parameter. Its beforeMount202, fullpath203, afterMount207 and afterpath208 compare to their own fresh snapshots. confirmMountedEnumeration363 compares candidate only at the end.

For the injected compatibility helper at newtest30-39, configure legacyFixture's mounted stats overrides and hook (fixture61-89,91-97): start legacyMount ino101n; count only lstat operations whose path equals legacyMount; change ino to202n at count8 and restore101n at count16. Keep all other identities/bytes/entries/typed RO XML constant. This is a finite, mapped-fixture input, not a claim about native guarantees.

| Mount lstat count | Call path | Observed inode |
|---|---|---|
|1|enumerateMountedNamespace349 captures candidate|101|
|2-3|mountedBundles370 → readonlyMountedRoot175/180, first fresh XML proof|101|
|4-7|runtime path372; after listing376; fresh postproof377|101|
|8-9|Info installedPlist302 → convertMounted202 → readonlyMountedRoot175/180|202|
|10-11|Info full path203; mountedBytes195 final path|202|
|12-15|Info postproof207; path208; second byte-read final path195|202|
|16-23|profile installedPlist435 and its full conversion|101|
|24-31|SystemVersion installedPlist436 and its full conversion|101|
|32|confirmMountedEnumeration363 compares original candidate|101|

Every comparison presently performed can succeed. The observable wrong behavior is accepting compatibility despite reading202 in later proofs after capturing101. Correct behavior is refusal before the mismatching proof/read/conversion can authorize metadata. Current candidate tests221-228 replace at count2 and never exercise this mismatch/restore window. Tests206-220 target leaf identity changes, not candidate binding across conversions.

The same missing context affects production: installedPlist302 invokes the SourceProcess, whose plutil authorization278 enters a second convertMounted using its own fresh identity; the diskutil recursion239/279 compares only each child's own snapshots. Explicitly carry the captured candidate and the caller's relevant expected snapshots through the private invocation path, and compare before every fresh proof, full-path snapshot and read. Preserve public SourceProcess signatures, finite bootstrap, no cached RO proof and no shared mutable current-anchor state. New regressions must exercise the injected caller and the production-inner boundary separately, including a mismatch/restore entirely inside the inner layer. Exact native stat counts differ in that layer, so the count table is only for the injected caller trace.

## P2: Recheck cancellation after open and EOF read

Policy23 requires a shared-signal check at every bounded stage. mountedBytes184 checks before await fs.open, but handle.stat187 starts after the await without checking cancellation. A mapped hook `if(operation === 'open' && path === legacyInfo) abort.abort()` (fixture92/98-101) makes the open return its handle after cancellation; Source then records opened-stat before the read-loop check190 rejects. Later conversion is prevented, but the stat still dispatches after cancellation. Put the post-open check inside the existing try/finally so the handle closes.

For EOF, wrap the fixture-owned handle read to abort immediately before returning its terminal `{bytesRead:0}`. Source191 breaks; final stat194 starts without a check. Assert that neither a later stat/read/proof/conversion nor child dispatch occurs; handle.close197 remains allowed cleanup. Cover both caller and production-inner reads, and cancellation after each await before a subsequent validation operation. Current tests319-326 abort inside opened-stat or conversion and assert no later conversion; they do not cover either dispatch window above.
