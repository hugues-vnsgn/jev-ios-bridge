# Fix: the production clock passed a fractional delay to AbortSignal.timeout

Status: closed
Closed: fixed by the coordinator on agent/android-v1.2-phase5
Blocked by: none

Found by the first live `capture` on `Medium_Phone_API_36.1` (Issue 25's device work, 2026-09-30).

- **The failure:** `awaitAgent` gives the clock's `timeout` the time left before its 5 s deadline, computed from `performance.now()` readings, for example 4999.997666 ms. `AbortSignal.timeout` accepts only whole numbers, so it threw `ERR_OUT_OF_RANGE`. Every real Android run and capture then failed while starting the agent: `capture` reported `EXECUTION_ERROR`, and a run would have ended the same way. The unit tests' fake clock returns whole numbers, so no test saw it.
- **The fix:** the production clock (now exported as `productionClock`) rounds a timeout up to at least 1 ms.
- **The test:** it calls `productionClock.timeout(4999.997666)`.
- **Scope:** the other `AbortSignal.timeout` calls in `src/` take constants.
