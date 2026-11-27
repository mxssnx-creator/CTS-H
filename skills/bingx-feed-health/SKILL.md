---
name: bingx-feed-health
description: Identify stale quotes and missing historical candles.
license: MIT
---

# Bingx feed health

Check each symbol's quote timestamp and the expected complete UTC candle window. Quote transport uses public REST with bounded timeouts, shared history and rate pacing. The web desk exposes unavailable symbols. Report gaps explicitly and pause decisions that depend on them.
