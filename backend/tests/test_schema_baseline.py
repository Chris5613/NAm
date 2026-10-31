"""Model/schema guards for the non-destructive pre-Alembic baseline."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from alembic.config import Config
from alembic.script import ScriptDirectory
from backend.models import Base

ROOT = Path(__file__).resolve().parents[2]
REVISION_PATH = ROOT / "backend" / "alembic" / "versions" / "20261031_01_baseline.py"

def load_revision():
    spec = importlib.util.spec_from_file_location("nam_alembic_baseline", REVISION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class BaselineSchemaTests(unittest.TestCase):
    def test_one_explicit_initial_revision(self):
        config = Config(str(ROOT / "alembic.ini"))
        script = ScriptDirectory.from_config(config)
        self.assertEqual(script.get_current_head(), "20261031_01")

    def test_upgrade_checks_existing_schema_without_creating_tables(self):
        revision = load_revision()
        inspector = Mock()
        inspector.get_table_names.return_value = list(Base.metadata.tables)
        inspector.get_columns.side_effect = lambda name: [
            {"name": col.name} for col in Base.metadata.tables[name].columns
        ]
        with patch.object(revision.op, "get_bind", return_value=object()), patch.object(
            revision, "inspect", return_value=inspector
        ):
            revision.upgrade()
        self.assertEqual(inspector.get_columns.call_count, len(Base.metadata.tables))

    def test_upgrade_fails_closed_on_missing_table(self):
        revision = load_revision()
        inspector = Mock()
        inspector.get_table_names.return_value = []
        with patch.object(revision.op, "get_bind", return_value=object()), patch.object(
            revision, "inspect", return_value=inspector
        ):
            with self.assertRaisesRegex(RuntimeError, "missing tables"):
                revision.upgrade()

    def test_upgrade_fails_closed_on_missing_column(self):
        revision = load_revision()
        inspector = Mock()
        inspector.get_table_names.return_value = list(Base.metadata.tables)
        inspector.get_columns.side_effect = lambda name: (
            [] if name == "users" else [
                {"name": c.name} for c in Base.metadata.tables[name].columns
            ]
        )
        with patch.object(revision.op, "get_bind", return_value=object()), patch.object(
            revision, "inspect", return_value=inspector
        ):
            with self.assertRaisesRegex(RuntimeError, "users lacks columns"):
                revision.upgrade()

    def test_baseline_downgrade_refuses_destruction(self):
        with self.assertRaisesRegex(RuntimeError, "not reversible"):
            load_revision().downgrade()

if __name__ == "__main__":
    unittest.main()
