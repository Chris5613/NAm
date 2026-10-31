# Database migration rollout (non-Phase-7)

NAm previously used `Base.metadata.create_all()` and two compatibility ALTER
statements on backend startup. Those remain unchanged. The Alembic revision
`20261031_01` establishes a **non-destructive baseline** for the existing
schema, but **is not run automatically on Render**.

## Safety conditions

- Back up production PostgreSQL and confirm a restore path **before** any manual
  migration operation; never practice on production.
- Connect to the intended database by setting `DATABASE_URL` (do not commit
  connection strings or credentials). The Alembic environment reads this from
  `backend.db`.
- Check the revision graph with `python -m alembic heads`.
- In a disposable, already-initialized PostgreSQL database, use:
  `python -m alembic upgrade head` and `python -m alembic current`.
  CI exercises these commands with a disposable database, *not* Render data.
- For an existing production database, the baseline revision's `upgrade()`
  checks required tables and columns before recording `alembic_version`. It
  intentionally performs **no destructive DDL**. This does not guarantee full
  index/type compatibility. Complete manual schema diff and backup checks
  before any production execution.
- The baseline intentionally cannot be downgraded. Restore from a verified
  backup if recovery is required.

## Next steps

All **future** structural database changes must be authored as reviewed
Alembic revisions and tested against a disposable copy of the current schema.
After the production baseline is deliberately applied and a complete
migrations path exists for fresh databases, replace the startup
`create_all()`/ad-hoc ALTER mechanism. Do **not** remove it prematurely.

**State:** Migration infrastructure and CI rehearsal are in place, but
production migration cutover has **not** been performed.
