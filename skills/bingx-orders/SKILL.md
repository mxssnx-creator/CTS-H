---
name: bingx-orders
description: Inspect the lifecycle and protection of one CTS-H order.
license: MIT
---

# Bingx orders

Use the operator's reconciliation output. Bind the exchange order to the original `ctsh-…` client ID and retain the complete string order ID. Report the venue status, executed quantity, and matching stop and target separately. Treat quantity after an IOC partial fill as the venue quantity.
