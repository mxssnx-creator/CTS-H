---
name: cts-h-bootstrap
description: Start the desk with public BingX data and inspect the connection setup.
license: MIT
---

# Cts h bootstrap

From the CTS-H checkout, run `npm run desk -- doctor` and `npm run desk -- brief --connection bingx-public --symbol ETH-USDT`. Record which connection, timestamps and sources responded. Use the web desk after `npm ci` and `npm run dev`. Load `desk-operating-model` before assigning the roles.
