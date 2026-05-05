user_problem_statement: |
  Net Worth tracker (client-side React app). Latest task: in the Crypto tab,
  whenever NOS in the wallet increases, route the increase as earnings to the
  Investment Overview's Nosana project — but use the official Nosana dashboard
  earning history API instead of wallet-balance diffing (avoids any swap
  double-dip). Schedule the auto-sync to run at 23:45 UTC daily.

backend:
  - task: "N/A — backend is a 38-line stub; all data lives in localStorage on the client."
    implemented: false
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "No backend changes for this feature."

frontend:
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
    - "Nosana auto-sync (Crypto tab → Investment Overview)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: main
    message: |
      Implemented Nosana auto-sync per user request. Test the manual "Sync now"
      flow end-to-end (config → sync → Investment Overview shows Nosana project
      with auto-sync transactions tagged "nosana" badge). Use real public test
      address cLmiLWMpbWjUKZzuhmAq432Vaz8eFGHgyHXfxgL3As6 — Nosana's API is
      public and CORS-permissive. Don't try to time-travel for the 23:45 UTC
      scheduler — just confirm manual sync works.
