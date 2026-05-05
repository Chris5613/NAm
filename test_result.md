user_problem_statement: |
  Net Worth tracker (client-side React app). Latest task: receive Unity Nodes
  earnings data from a companion Chrome extension (Unity Nodes Earnings
  Tracker, MV3 — see https://github.com/Chris5613/Extention) instead of
  manually typing balances. Extension auto-runs at 7:30 PM PST and POSTs a
  JSON payload to our backend inbox. Frontend polls the inbox, applies any
  delta as earnings on the existing "Phone Farm" investment project, and
  displays today's earnings on the Unity Network card.

backend:
  - task: "Unity Nodes extension inbox (POST/GET /api/integrations/unity-network/inbox)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New endpoints. Single in-memory slot — no DB, no auth, by design
          (single-user app, ingress-protected). The extension POSTs whatever
          JSON shape it sends today (see README on the GitHub repo). GET
          returns { empty, received_at, today_usd, payload } or { empty: true }.
          Optional ?since=<iso> short-circuits to "no_new_data" when the
          stored synced_at <= since. DELETE clears the slot.
          Smoke-tested locally: POST 200, GET 200 with the expected shape.
      - working: true
        agent: "testing"
        comment: |
          Comprehensive backend testing completed (15/16 tests passed):
          ✅ GET on fresh state returns {empty: true}
          ✅ POST valid payload returns {ok: true, received_at}
          ✅ POST second payload with different values works correctly
          ✅ GET after POST returns full payload with correct today_usd
          ✅ GET with ?since (future) returns {empty: true, no_new_data: true}
          ✅ GET with ?since (equal) returns full payload (correct per spec)
          ✅ GET with ?since (past) returns full payload
          ✅ POST plain text returns 400 with 'invalid json' error
          ✅ POST JSON array returns 400 with 'expected JSON object' error
          ✅ DELETE inbox returns {ok: true}
          ✅ GET after DELETE returns {empty: true}
          ✅ GET /api/ returns {status: 'ok'}
          ✅ GET /api/health returns {status: 'ok'}
          ✅ OPTIONS preflight returns Access-Control-Allow-Origin: *
          ✅ GET with Origin header returns Access-Control-Allow-Origin: *
          
          Minor: GET with ?since=malformed returns {empty: true, no_new_data: true}
          instead of falling through to return payload. This is because Python
          string comparison doesn't raise exceptions - it compares
          lexicographically. In practice, this won't affect the extension or
          frontend (both send valid ISO timestamps). The fix would be to parse
          timestamps as datetime objects and catch parsing exceptions.
          
          All core functionality working correctly. The malformed-since edge
          case is a minor deviation from spec that won't impact real usage.

frontend:
  - task: "Unity Nodes extension auto-sync (Integrations card → Phone Farm)"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/unityNetworkExtensionSync.js, frontend/src/components/UnityNetworkEarningsCard.jsx, frontend/src/App.js, frontend/src/lib/localStorage.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          New feature. Polls GET /api/integrations/unity-network/inbox every
          60s + on focus. Uses payload.lifetime_usd as the monotonic baseline
          → applies any positive delta via existing
          applyUnityNetworkBalanceUpdate(action='earning'), so it credits
          Phone Farm with a regular earning transaction.
          Idempotent on payload.synced_at. New tile shows today's earnings
          (payload.total_usd) when payload.date matches today (UTC).
          "Sync from extension" button does a manual drain. "auto-apply"
          checkbox in the panel disables the background poller. When tracking
          is disabled and the extension reports in, a manual sync auto-
          configures with the current lifetime as baseline (no retroactive
          earning). Backend inbox is in-memory only — no DB, no auth.

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
  current_focus:
    - "Unity Nodes extension inbox (POST/GET /api/integrations/unity-network/inbox)"
    - "Unity Nodes extension auto-sync (Integrations card → Phone Farm)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: main
    message: |
      Implemented the Chrome-extension receiver. Two pieces to test:
        1. Backend inbox endpoints — POST accepts the extension's JSON shape
           and stores it in a single in-memory slot. GET returns the latest
           push (with a `today_usd` convenience field). DELETE clears it.
           No auth, no DB.
        2. Frontend Integrations page → Unity Network card now polls the
           inbox every 60 s and applies any delta to the Phone Farm project.
      Test sequence for the backend:
        a. GET /api/integrations/unity-network/inbox → should return {empty: true}
           on a clean start.
        b. POST a sample payload (see extension README for shape — at
           minimum: source, synced_at, date, total_usd, lifetime_usd) →
           expect {ok: true, received_at: <iso>}.
        c. GET again → expect {empty: false, received_at, today_usd, payload}.
        d. GET with ?since=<future-iso> → expect {empty: true, no_new_data: true}.
        e. POST invalid JSON / non-object → expect 400.
        f. DELETE → expect {ok: true}; subsequent GET → {empty: true}.
      Don't worry about the frontend — I'll handle UI testing separately.
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
