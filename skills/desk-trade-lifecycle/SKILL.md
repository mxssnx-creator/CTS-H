---
name: desk-trade-lifecycle
description: Move a CTS-H ticket from idea through venue reconciliation and review.
license: MIT
---

# Desk trade lifecycle

Record the instrument, connection, liquidity, thesis, invalidation, quantity and bracket. The local operator runs `propose`, `risk`, `approve`, `send`, `reconcile` and `review` in that order. A changed bracket or venue requires a new ticket. Refreshing risk removes the previous approval.
