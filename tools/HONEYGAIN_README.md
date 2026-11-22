# Honeygain desktop → NAm read-only bridge (opt-in)

NAm supports a **separate Honeygain ingest token**, stores daily credit readings
in PostgreSQL, and shows them in Passive Income → Honeygain. The bridge does
**not** automate earnings, create transactions, claim rewards, or alter Honeygain.

**Important:** Honeygain does not publish these endpoints as a supported
personal-account API, and its terms restrict access methods that Honeygain
has not authorized. Obtain permission from Honeygain before enabling recurring
requests. This connector is intentionally **off by default** and requires your
own credentials locally. Do not share a Honeygain session token or the NAm
bridge token in chat or commit either token to GitHub.

## Initial setup on Windows

1. Wait for NAm frontend and backend deployment to succeed and refresh NAm.
2. Open **Passive Income → Honeygain** and expand the project.
3. Click **Generate bridge token**. Copy it privately; rotating invalidates old copies.
4. On your own PC, download `tools/honeygain_bridge.py`.
5. If Honeygain has authorized dashboard API usage, obtain a **session token
   for your own account** through its authorized mechanism. Do not use a
   password in this script.
6. Run these commands in PowerShell, inside the folder with the Python script:

```powershell
$env:NAM_API_URL = "https://nam1-dmte.onrender.com"
$env:HONEYGAIN_MODE = "jumptask"
$env:NAM_HONEYGAIN_TOKEN = Read-Host "Paste the private NAm Honeygain bridge token"
$env:HONEYGAIN_DASHBOARD_TOKEN = Read-Host "Paste the private Honeygain session token"
py -3 .\honeygain_bridge.py --once
```

Expected successful output:

```
YYYY-MM-DD: N.NNNN credits today; NAm accepted=True
```

To start a five-minute read-only polling loop, omit `--once`:

```powershell
py -3 .\honeygain_bridge.py
```

Leave this command running. Closing PowerShell stops the bridge; no background
service or Task Scheduler job is automatically installed. Your Honeygain
desktop app may continue running normally, but the bridge's values are read
from the account dashboard service, not the desktop app's process.

To inspect latest evidence, open **Passive Income → Honeygain** after a sync.
A reading updates the displayed monthly credits/USD, but is **not booked
into Financials** and does not automatically update the JumpTask wallet.

### Fail-closed design

* The bridge uses **GET** requests to Honeygain's earnings and balance endpoints.
* The **JumpTask mode** uses daily `/jt-earnings/today` credit readings; Honeygain
  mode uses `/earnings/today`.
* The script accepts only known daily credit response shapes; if the
  undocumented API changes or rejects authorization, it sends **nothing**.
* The script never prints credentials, account payloads, or HTTP response bodies.
* Separate NAm bridge token is hashed server-side and can be rotated in the UI.
* Samples are idempotent: NAm keeps the highest observed credits for each
  Pacific calendar day. JumpTask transfers are not additional earnings.
* The dashboard's 1,000 credits = $1 conversion is applied to displayed
  reporting values, not to withdrawals or wallet token valuation.
* Month estimates only include days collected by the bridge. They are not
  retroactively reconstructed or treated as audited accounting records.

If the command reports `HTTPError`, your account session may have expired,
the API may have changed, or Honeygain may disallow the request. Stop and
check authorization rather than attempting to bypass access controls.
