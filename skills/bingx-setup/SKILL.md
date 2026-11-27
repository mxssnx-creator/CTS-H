---
name: bingx-setup
description: Set up isolated BingX mainnet and VST connections.
license: MIT
---

# Bingx setup

Use `bingx-x01` for mainnet and `bingx-x02` for VST. The operator terminal resolves the chosen slot's `BINGX_X01_*` or `BINGX_X02_*` environment variables, optionally from Redis as described in the README. Keep trading credentials on the operator host. The Grok workspace can start with `bingx-public` or a public query to either venue.
