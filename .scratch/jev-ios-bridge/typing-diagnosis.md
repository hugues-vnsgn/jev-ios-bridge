# Leading-hyphen typing failure on MobileBuildMCP 2.7.1

Investigated 2026-09-24 on the dedicated iOS 26.4 simulator, using **only** `mobilebuildmcp@2.7.1` UI and simulator commands. The app was Sentry's installed Weather fixture, `com.sentry.weather.Weather`. No Jev call, raw AXe command, `simctl`, or private keyboard injection was used. The original failed adapter smoke is [device-literal-smoke.json](device-literal-smoke.json); its exact `Failed to type text into elementRef e103.` signal is preserved.

## Reproduction

The pinned CLI launched Weather, captured its home screen, tapped the location button, and returned a search text field (`e103`). All typing calls used the documented `--json` argument with `replaceExisting:true`, the same transport the bridge uses. A fresh `snapshot-ui` was taken after each failed call to obtain a current ref.

| Text sent to `ui-automation type-text` | Ref | Vendor result | Observed field afterward |
| --- | --- | --- | --- |
| `London` | `e103` | `mobilebuildmcp.output.ui-action-result`, `didError:false`, `textLength:6` | `London` |
| `--London` | `e102` | `didError:true`, `uiError.code:ACTION_FAILED`, `textLength:8` | still `London` |
| `-L` | `e105` | same `ACTION_FAILED`, `textLength:2` | still `London` |
| `London-` | `e104` | `didError:false`, `textLength:7` | `London-` |

For example, the failed request was:

```sh
npx -y mobilebuildmcp@2.7.1 ui-automation type-text \
  --json '{"simulatorId":"0E42FDE2-5E09-42D3-9876-9EF0037FCBE7","elementRef":"e102","text":"--London","replaceExisting":true}' \
  --output json
```

The failure envelope reports `Failed to type text into elementRef e102.` and a recovery hint to refresh the snapshot. It does **not** expose AXe's stderr, so the exact parser error is unavailable. Weather was stopped successfully afterward through `mobilebuildmcp simulator stop`.

## Cause and supported boundary

[MobileBuildMCP's 2.7.1 `type_text` implementation](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/ui-automation/type_text.ts) validates printable US keyboard characters, focuses the element, then passes `['type', text]` to its AXe command adapter. That adapter appends `--udid` and spawns the command as argv; the bridge's `--json` value has therefore reached MobileBuildMCP intact. The version's [AXe pin](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/.axe-version) is 1.8.0. [AXe 1.8.0 `Type.swift`](https://github.com/cameroncooke/AXe/blob/v1.8.0/Sources/AXe/Commands/Type.swift) declares direct text as a positional `@Argument`; its other supported sources are `--stdin` and `--file`. **Inference:** a leading `-` is parsed as a CLI option rather than positional text. The controlled success/failure pattern above supports this explanation. MobileBuildMCP's public `type-text` tool exposes no stdin/file source or argument terminator to the bridge.

The bridge now rejects a value beginning with `-` before invoking `type-text` (`UNSUPPORTED_LEADING_DASH_TEXT`), without logging the value. Scenario-level validation should reject it even earlier, before device preparation; the scenario module owner is adding that check. Other printable hyphens, such as `London-`, remain accepted. This is a pinned-vendor capability limit, not a reason to rewrite the literal, relax the assertion, or inject keyboard events outside MobileBuildMCP. An upstream typing change can restore exact leading-hyphen support; the bridge should retest it against a newly pinned version before removing the guard.
