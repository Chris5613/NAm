# NAm Tapo P115 power bridge

This helper runs on one Windows PC on the same LAN as both Tapo P115 plugs. It reads real wall power locally and sends only watt/kWh telemetry to NAm. Tapo credentials stay in local `config.json`.

## Setup

1. Open NAm Dashboard -> Mining Power and click **Generate bridge token**.
2. Copy the one-time token.
3. Find each P115's LAN IP in your router/Tapo network.
4. Run `setup.bat` and enter the NAm backend URL, token, Tapo login, and both plug IPs.
5. Run `run.bat`.
6. When the NAm card shows **Live**, optionally make `run.bat` start with Windows using Task Scheduler.

The bridge defaults to a 15-second polling interval. `config.json` is intentionally ignored by Git.

P115 support and authenticated Tapo access are provided by python-kasa.
