---
name: desk-execution-protocol
description: Hand one exact CTS-H ticket to the operator for approval and execution.
license: MIT
---

# Desk execution protocol

Present the risk receipt and exact ticket ID. Only the operator approves and sends using the isolated CLI. For a BingX validation request the operator can choose `send TICKET --confirm TICKET --test`. For a real submission, the specific connection must also be enabled on that host. After any real send, query `reconcile TICKET` and keep the original client ID.
