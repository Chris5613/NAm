"""Existing columns must not trigger table-locking startup DDL."""
import unittest
from unittest.mock import MagicMock, patch

from backend import db


class StartupSchemaTests(unittest.TestCase):
    def test_existing_columns_skip_alter_table(self):
        connection = MagicMock()
        manager = MagicMock()
        manager.__enter__.return_value = connection
        inspector = MagicMock()
        inspector.get_columns.side_effect = lambda table: (
            [{"name": "security_answer_hash"}] if table == "users" else [{"name": "hidden"}]
        )
        with patch.object(db.engine, "begin", return_value=manager), \
             patch.object(db.Base.metadata, "create_all"), \
             patch.object(db, "inspect", return_value=inspector):
            db.init_db()
        connection.execute.assert_not_called()

    def test_missing_legacy_column_is_added(self):
        connection = MagicMock()
        manager = MagicMock()
        manager.__enter__.return_value = connection
        inspector = MagicMock()
        inspector.get_columns.side_effect = lambda table: (
            [] if table == "users" else [{"name": "hidden"}]
        )
        with patch.object(db.engine, "begin", return_value=manager), \
             patch.object(db.Base.metadata, "create_all"), \
             patch.object(db, "inspect", return_value=inspector):
            db.init_db()
        self.assertEqual(connection.execute.call_count, 1)
        self.assertIn("security_answer_hash", str(connection.execute.call_args.args[0]))
