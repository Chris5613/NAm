"""Startup schema changes must flow through Alembic, not ad-hoc ALTERs."""
import unittest
from unittest.mock import MagicMock, patch

from backend import db


class StartupSchemaTests(unittest.TestCase):
    def test_existing_database_runs_alembic_upgrade_only(self):
        inspector = MagicMock()
        inspector.get_table_names.return_value = ["users", "settings"]

        with patch.object(db, "inspect", return_value=inspector), \
             patch.object(db.Base.metadata, "create_all") as create_all, \
             patch.object(db.command, "stamp") as stamp, \
             patch.object(db.command, "upgrade") as upgrade:
            db.init_db()

        create_all.assert_not_called()
        stamp.assert_not_called()
        upgrade.assert_called_once()
        self.assertEqual(upgrade.call_args.args[1], "head")

    def test_empty_database_bootstraps_current_models_then_stamps_head(self):
        inspector = MagicMock()
        inspector.get_table_names.return_value = []

        with patch.object(db, "inspect", return_value=inspector), \
             patch.object(db.Base.metadata, "create_all") as create_all, \
             patch.object(db.command, "stamp") as stamp, \
             patch.object(db.command, "upgrade") as upgrade:
            db.init_db()

        create_all.assert_called_once_with(bind=db.engine)
        stamp.assert_called_once()
        self.assertEqual(stamp.call_args.args[1], "head")
        upgrade.assert_not_called()


if __name__ == "__main__":
    unittest.main()
