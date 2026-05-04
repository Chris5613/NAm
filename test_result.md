#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Change the main net worth page so there is only one single box for Crypto, and the net worth number shown on the Crypto tab reflects on the main Net Worth page."

backend:
  - task: "Crypto cache endpoints (GET/POST /api/crypto/cache) and net-worth crypto override"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Added /api/crypto/cache GET and POST endpoints backed by a singleton doc in db.crypto_cache. Modified /api/net-worth, /api/net-worth/snapshot and daily_snapshot_task to override breakdown.crypto with the cached crypto total when present. Smoke-tested with curl: cache set/get works, net-worth reflects cached crypto."
        -working: true
        -agent: "testing"
        -comment: "Comprehensive backend testing completed. All crypto cache endpoints working correctly: GET /api/crypto/cache returns {total, updated_at} correctly (returns 0 when empty). POST /api/crypto/cache properly validates input (rejects non-numeric with 400, handles missing fields safely). GET /api/net-worth correctly uses cached crypto value in breakdown.crypto and includes it in total_net_worth calculation. POST /api/net-worth/snapshot correctly persists crypto_value from cache. All review request scenarios passed: cache set to 50000 reflects in net-worth, invalid inputs handled safely, snapshots persist correct crypto_value. Frontend actively manages cache (CryptoPage POSTs grandTotal), which is expected behavior. Test files: /app/backend_test_focused.py, /app/backend_test_scenarios.py"

frontend:
  - task: "Main Net Worth page shows single Crypto box reflecting Crypto tab total"
    implemented: true
    working: "NA"
    file: "frontend/src/components/NetWorthHero.jsx, frontend/src/pages/CryptoPage.jsx, frontend/src/lib/api.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Removed the separate 'Projects' (crypto_projects) metric item from NetWorthHero — only one 'Crypto' box remains. CryptoPage now POSTs its grandTotal to /api/crypto/cache whenever it changes so the main Net Worth page shows the same crypto number as the Crypto tab. Added cryptoCacheApi in api.js."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 2
  run_ui: true

test_plan:
  current_focus:
    - "Main Net Worth page shows single Crypto box reflecting Crypto tab total"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Implemented unified Crypto box on the main Net Worth page. Backend caches the crypto total in db.crypto_cache (singleton). Crypto page pushes its grandTotal to the cache on changes. NetWorthHero no longer shows the Projects metric. Please verify that the Crypto box on the main Net Worth tab matches the Net Worth figure shown on the Crypto tab after visiting/refreshing the Crypto tab."
    -agent: "testing"
    -message: "Backend testing complete - all crypto cache endpoints working perfectly. Tested all scenarios from review request: cache GET/POST, net-worth override, snapshot persistence, invalid input handling. All tests passed (6/6 focused tests, 4/4 scenario tests). The crypto cache mechanism is functioning as designed: frontend CryptoPage actively updates cache with grandTotal, backend correctly uses cached value in net-worth calculations and snapshots. No issues found. Ready for main agent to summarize and finish."