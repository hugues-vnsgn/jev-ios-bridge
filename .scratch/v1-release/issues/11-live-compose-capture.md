# Live Compose capture: settle the open questions on a real simulator

Type: task
Status: open
Blocked by: 04

## Question

Nothing to decide; "Compose app evidence plan" waits on these facts. "Compose Multiplatform on iOS through MobileBuildMCP" answered from source and left nine questions that only a live capture settles (listed at the end of [`docs/research/compose-multiplatform-ios.md`](../../../docs/research/compose-multiplatform-ios.md)). Among them: whether AXe reports Compose text fields as `text-field`, and whether it traverses the children of merged nodes.

Build Alkaa (`igorescodro/alkaa` at `8524e06`) for the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, install it with MobileBuildMCP, and take compact and full `mobilebuildmcp@2.7.1` captures of its list, navigation, and text-entry screens. Answer each open question with the capture excerpt that settles it. Also record the build steps and times, since the evidence plan needs a reproducible build.

One agent at a time owns the device. Don't change product code. Store the captures as research assets and link them here.
