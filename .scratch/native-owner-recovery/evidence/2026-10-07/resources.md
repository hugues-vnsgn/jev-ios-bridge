# Sources for the startup disagreement

Primary local evidence is the pinned host receipts, raw `simctl listapps`, two container lookups and explicit filesystem observations. Apple `simctl help listapps` documents an installed-application listing. The local simctl payload SHA-256 is `175203e6b20fa8f88671ab9ae533320a3578f7c2104bbb13f65afba12435dc74`.

Apple explains that the container command supplies a path for filesystem investigation in [Getting the Most Out of Simulator, WWDC19](https://developer.apple.com/videos/play/wwdc2019/418/). That passage does not establish a reboot-stable absence contract or an independent registry/lifecycle barrier.

Context7 searches were bounded:

- Supervisor resolver `CoreSimulator simctl` returned `/vmanot/simulatorkit`. Its documentation query described a wrapper and ordinary install/boot/device APIs; it supplied no stale-registration or reboot-stable absence contract. [SimulatorKit source](https://github.com/vmanot/simulatorkit).
- Research worker used two resolvers and two documentation queries. `/websites/developer_apple_de` supplied no matching lifecycle semantics; this is a coverage limit. `/facebook/idb` supplied installed-app metadata and uninstall descriptions without the requested lifecycle guarantee. [idb command documentation](https://github.com/facebook/idb/blob/main/website/docs/idb/commands.mdx).

No claim is made that these searches exhaust Apple's documentation. The live observations establish dangling metadata; the underlying persistence/cache cause remains unconfirmed. No cleanup replay, daemon reset, shared-registry deletion, weaker absence rule or production capability follows from these resources.
