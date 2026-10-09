# Cryptex design review

**Verdict: conditional.** The revised proposal resolves the first draft's mount-proof lifetime, nested-device, mode, bootstrap and Xcode-output omissions. Obtain the additional owner decision before implementation. Production compatibility and L01-L05 remain unverified.

## Required decision

Trust root and all actors with daemon-group authority to replace entries in exactly `/private/var/run`, solely to reach `com.apple.security.cryptexd/mnt`. Its root0/daemon1/0775 parent permits replacement of cryptexd despite that child's 0705 mode. Applications approval does not authorize this trust. Retain the explicit limitation on concurrent replacement by trusted namespace managers.

The observations establish neither SIP protection nor exhaustive effective writers. ACLs were not inspected. Treat that as an unverified limit of the existing mode-based trust model; an unsafe ACL was not observed. Apple documents both ACL and BSD access controls. [Apple file security](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html).

## Remaining specifications

- The current proposal states 64 mount candidates and 4096-character paths. Specify the proposed 1000 aggregate runtime-bundle and 8192 metadata-child limits in the document, plus the exact name grammar. Preserve cancellation checks and the existing ten-second compatibility stage.
- Select a shipped bounded parser. The diagnostic `plist` import is unavailable and its hypothetical `ReadOnlyVolume` key is absent. The revised exact `MountPoint`, strictly false Writable* booleans, duplicate rejection and disabled external resolution are appropriate. Parse complete original bytes; follow no returned location.
- Define bounded child termination. The existing runner sends SIGTERM and awaits close without escalation; its timer does not prove termination. Track uncertain termination rather than treating cancellation as completion. [Node24](https://nodejs.org/download/release/v24.0.0/docs/api/child_process.html#subprocesskillsignal).

The distinct diskutil bootstrap must inspect namespace and mount-root metadata without calling runtime verification recursively. Its inspection alone authorizes no runtime byte read. The revised fresh pre/post queries, all-descendant device association and explicit modes then constrain each conversion.

## Optional design advice

Keep discovery, path proof and conversion inside one installed-metadata module behind the existing compatibility interface. Use a private bootstrap runner. The proposed fixed 128 KiB Xcode-Info combined output cap fits the recorded 77,555 bytes; retain the 64 KiB input cap and other output caps.

This conditional design supplies no cryptographic Apple provenance or atomic path pinning. Require implementation regressions and independent reviews before accepting product behavior.
