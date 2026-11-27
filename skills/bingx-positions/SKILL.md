---
name: bingx-positions
description: Match a futures position to its CTS-H parent ticket.
license: MIT
---

# Bingx positions

A reduction starts with a reconciled parent. Match venue, symbol, direction, exact position ID and own remaining fill quantity. For a close proposal use `npm run desk -- close-plan TICKET --why 'reason'` on the operator host. All other open orders and positions stay outside this ticket.
