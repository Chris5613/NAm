# NAm Tapo P115 power bridge

This helper runs on one Windows PC on the same LAN as both Tapo P115 plugs. It reads real wall power locally and sends only watt/kWh telemetry to NAm. Tapo credentials stay in local `config.json`.

## Setup

1. Open NAm -> Mining Power and click **Generate bridge token**.
2. Copy the one-time token.
3. On one always-on Windows mining PC, open this folder and run `setup.bat`.
4. Enter the bridge token and your Tapo account login when prompted.
5. Setup automatically discovers supported Tapo/Kasa devices on the LAN.
6. Choose which discovered P115 powers the RTX 5070 PC, then which powers the RTX 2080 Super PC.
7. Run `run.bat`.
8. When NAm shows **Live**, optionally configure `run.bat` to start with Windows using Task Scheduler.

Default NAm backend: `https://nam1-dmte.onrender.com`

The bridge defaults to a 15-second polling interval. `config.json` is intentionally ignored by Git. The Tapo password and NAm bridge token never need to be committed or sent to the frontend.
