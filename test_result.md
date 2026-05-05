user_problem_statement: |
  Net Worth tracker (client-side React app). Latest task: receive Unity Nodes
  earnings data from a companion Chrome extension (Unity Nodes Earnings
  Tracker, MV3 — see https://github.com/Chris5613/Extention) instead of
  manually typing balances. **Pure client-side bridge** — extension's content
  script pushes payloads directly to the React app via window.postMessage on
  https://nam-qyn8.onrender.com. No backend hop. The extension itself runs
  on its own schedule (default 7:30 PM PST).

backend:
  - task: "Backend remains a stub — no inbox endpoint (architecture is pure client-side bridge)"
    implemented: false
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          User asked for a fully client-side architecture. Reverted server.py
          to the original 38-line stub. The Chrome extension delivers
          payloads directly via window.postMessage — zero server hop.

frontend:
  - task: "Unity Nodes extension client-side bridge (postMessage → Phone Farm)"
    implemented: true
    working: true
    file: "frontend/src/lib/unityNetworkExtensionSync.js, frontend/src/components/UnityNetworkEarningsCard.jsx, frontend/src/App.js, frontend/src/lib/localStorage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Pure client-side architecture. Listens for window.postMessage from
          the extension's content script on https://nam-qyn8.onrender.com/*.
          Protocol:
            ext → app:  { source: "unity-nodes-tracker-ext", type: "READY" }
            ext → app:  { source: "unity-nodes-tracker-ext", type: "EARNINGS_PUSH", payload: {...} }
            app → ext:  { source: "unity-nodes-tracker-app", type: "REQUEST_LATEST" }
          Origin hard-checked. Idempotent on payload.synced_at. Uses
          lifetime_usd as the monotonic baseline → applies positive deltas
          via existing applyUnityNetworkBalanceUpdate(action='earning'). UI
          shows today's earnings tile, lifetime, device count, last-push
          relative time, "auto-apply" checkbox, "Sync from extension" button
          (4 s timeout on REQUEST_LATEST round-trip).

          Extension patch (manifest.json bumped to 1.1.0 + new
          content-app.js + 1-line background.js change) lives in
          /app/extension_patch/ for the user to push to Chris5613/Extention.
      - working: true
        agent: "main"
        comment: |
          Verified end-to-end via Playwright with a simulated postMessage:
            - Initial card state on /integrations as expected (no extension
              data → manual mode).
            - Simulated READY + EARNINGS_PUSH → "extension" violet badge
              appears, "Today's earnings" tile shows $1.23 with today's UTC
              date, Lifetime $200.00, Devices 3, "Last push: just now",
              auto-apply checkbox checked.
            - 0 console errors.

  - task: "Nosana auto-sync (Crypto tab → Investment Overview)"
    implemented: true
    working: true
    file: "frontend/src/lib/nosanaSync.js, frontend/src/components/NosanaEarningsCard.jsx, frontend/src/pages/CryptoPage.jsx, frontend/src/App.js, frontend/src/lib/api.js, frontend/src/lib/external-apis.js, frontend/src/lib/localStorage.js, frontend/src/components/TransactionsDialog.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
  - task: "Acurast → Phone Farm sync fix (CoinGecko rate-limit resilience)"
    implemented: true
    working: true
    file: "frontend/src/lib/acurastSync.js, frontend/src/components/AcurastEarningsCard.jsx, frontend/src/lib/localStorage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New feature. Pulls daily earnings from
          https://dashboard.k8s.prd.nos.ci/api/stats/earning-history?address=...&start_date=...&end_date=...&group_by=month
          and posts each day's USD as a transaction (source: 'nosana',
          source_date: 'YYYY-MM-DD') into a "Nosana" investment project.
          Auto-runs at 23:45 UTC daily (with catch-up if app opens after that
          time). Manual "Sync now" button on the Crypto tab. Edit/delete
          transactions reverse the synced-dates map and project.earned.
          Idempotent — same day at the same amount is a no-op; intra-day
          changes update the existing transaction.
      - working: true
        agent: "main"
        comment: |
          Verified end-to-end via Playwright:
            - Card hidden behind "not configured" state, Sync button disabled.
            - Configure dialog accepts node address, saves, badge flips to
              green "auto-sync 23:45 UTC".
            - "Sync now" hits the real Nosana API, returns 35 days of data,
              renders Total Synced ($50.37), Days Tracked (35), Last 7 Days
              tile grid, and a success toast "Nosana synced — 35 added,
              0 updated (+$50.37)".
            - Investment Overview shows a fresh "Nosana" project with
              Earned $50.37 and Net P&L +$50.37.
            - Re-sync = idempotent (totals unchanged, "0 updated" toast).
            - 0 console errors.

metadata:
  created_by: main_agent
  version: 1
  test_sequence: 0
  run_ui: true

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: main
    message: |
      Architecture pivoted to fully client-side per user request. Backend
      reverted to stub. Replaced HTTP polling with window.postMessage bridge:
      the extension's content script (running on https://nam-qyn8.onrender.com/*)
      posts EARNINGS_PUSH messages directly to the page; the React app
      listens, dedupes by synced_at, and credits the lifetime_usd delta to
      Phone Farm via the existing applyUnityNetworkBalanceUpdate flow.

      Required user action: push the patched extension files in
      /app/extension_patch/ to Chris5613/Extention and reload the extension
      in Chrome. Files: manifest.json (v1.1.0 with content-app.js entry +
      nam-qyn8.onrender.com host permission), background.js (1-line change
      to also save lastFullPayload to chrome.storage.local), content-app.js
      (new — the postMessage bridge).

      Smoke tested on /integrations via Playwright with a simulated
      postMessage; "extension" badge appeared, "Today's earnings" tile
      showed $1.23, last-push "just now". 0 console errors.
  - agent: testing
    message: |
      Backend testing complete! All Unity Nodes extension inbox endpoints are
      working correctly. 15 out of 16 test scenarios passed.
      
      Core functionality verified:
      - POST/GET/DELETE operations work as expected
      - Payload storage and retrieval correct
      - today_usd field correctly extracted from payload.total_usd
      - ?since parameter logic works for all practical cases
      - Error handling for invalid JSON and non-object bodies
      - CORS headers properly configured
      - Health endpoints operational
      
      Minor edge case: When ?since parameter is malformed (e.g., "garbage"),
      the endpoint returns {empty: true, no_new_data: true} instead of falling
      through to return the payload. This happens because Python string
      comparison doesn't raise exceptions. In practice, this won't affect the
      extension or frontend since both will always send valid ISO 8601
      timestamps. If you want to fix this for spec compliance, parse timestamps
      as datetime objects in the comparison (lines 135-138 in server.py).
      
      Ready for frontend testing or to summarize and finish.
