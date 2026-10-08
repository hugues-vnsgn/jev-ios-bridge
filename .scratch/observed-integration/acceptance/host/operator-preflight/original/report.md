# Live acceptance preflight — UNVERIFIED

Read-only runtime and host metadata preflight only. No L01–L05 work was performed. The accepted host gate remains PASS for H01–H09 at product commit b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433. Current HEAD is 087efc19103479391da8bf2d91fc5f1bcc04d7ae; the accepted host evidence commit 38698fbfd1c3048c8eb09706eb3cecf58f006509 is its ancestor. All 15 files listed in accepted-host-freeze.json match their recorded hashes. The current allocation compatibility implementation/test and package files match the tested product tree.

## Runtime prerequisite

**iOS 27.0 is absent from the currently inspectable installed runtime metadata.** The runtime ID required by the current compatibility test fixture is com.apple.CoreSimulator.SimRuntime.iOS-27-0; no corresponding installed runtime bundle or metadata was found, so no exact runtime build can be reported. No simctl command was run.

The iPhone 17 device-type metadata is present and identifies com.apple.CoreSimulator.SimDeviceType.iPhone-17. Its profile declares minRuntimeVersion 26.0 and a default creation range of 26.0–99.99, so the device type metadata includes iOS 27.0 in its declared compatibility range. Actual runtime-side compatibility remains unverified because the iOS 27.0 runtime profile is absent.

The current CoreSimulator dyld cache names identify iOS 18.6 (22G86, com.apple.CoreSimulator.SimRuntime.iOS-18-6) and iOS 26.4 (23E254a, com.apple.CoreSimulator.SimRuntime.iOS-26-4), but cache entries alone do not establish installed runtimes. An earlier read-only metadata capture recorded iOS 26.4.1 build 23E254a with runtime ID com.apple.CoreSimulator.SimRuntime.iOS-26-4; its runtime bundle paths are absent in this inspection. The machine currently reports macOS 27.0.1 (26A434), Xcode 27.0 (27A266a), arm64, and Node v26.8.1. Installed package metadata reports MobileBuildMCP 2.7.1 and MobileCLI 1.0.14.

## Verdict and remaining work

Runtime prerequisite: **UNVERIFIED / absent**. Stop here as directed. No fallback, installation, download, or update was attempted. Rows L01–L05 remain **UNVERIFIED**.

Operational old-writer quiescence and historical journal/lease root declarations or exclusions are still pending. Even after iOS 27.0 is installed and verified, those facts and Root’s remaining gates are required before any live dispatch.

Exact metadata, source hashes, host evidence hashes, commands, and paths are in versions.json. This report and that file are private mode 600 under a mode 700 live/ directory. No commit was made.
