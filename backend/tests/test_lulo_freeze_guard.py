import unittest

from tools.lulo_freeze_guard import frozen_changes


class LuloFreezeTests(unittest.TestCase):
    def test_lulo_specific_module_changes_are_blocked(self):
        patch = """diff --git a/backend/lulo_transaction_reconciliation.py b/backend/lulo_transaction_reconciliation.py
+++ b/backend/lulo_transaction_reconciliation.py
@@ -4,1 +4,1 @@
-INTERVAL = 5
+INTERVAL = 0
"""
        self.assertEqual(len(frozen_changes(patch)), 1)

    def test_shared_lulo_source_logic_changes_are_blocked(self):
        patch = """diff --git a/backend/financial_core.py b/backend/financial_core.py
+++ b/backend/financial_core.py
@@ -42 +42 @@
-    luloCash = 1500
+    luloCash = 0
"""
        self.assertEqual(len(frozen_changes(patch)), 1)

    def test_other_provider_and_freeze_document_updates_allowed(self):
        patch = """diff --git a/backend/earnings_dashboard.py b/backend/earnings_dashboard.py
+++ b/backend/earnings_dashboard.py
@@ -42 +42 @@
-    daily_salad = None
+    daily_salad = 0.00046496
diff --git a/docs/LULO_INACTIVE_FREEZE.md b/docs/LULO_INACTIVE_FREEZE.md
+++ b/docs/LULO_INACTIVE_FREEZE.md
@@ -1 +1 @@
-Lulo was active
+Lulo is inactive
"""
        self.assertEqual(frozen_changes(patch), [])

    def test_lulo_freeze_tool_can_be_maintained_without_self_blocking(self):
        patch = """diff --git a/tools/lulo_freeze_guard.py b/tools/lulo_freeze_guard.py
+++ b/tools/lulo_freeze_guard.py
@@ -1 +1 @@
-LULO = False
+LULO = True
"""
        self.assertEqual(frozen_changes(patch), [])


if __name__ == "__main__":
    unittest.main()
