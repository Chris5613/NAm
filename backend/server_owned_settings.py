"""Protect server-owned accounting evidence from generic client settings writes.

Dedicated authenticated endpoints validate wallet registration, project feeds,
and parity observations. The generic legacy settings endpoint must never be
an alternate path to forge their server-side output.
"""

SERVER_OWNED_SETTING_KEYS = frozenset({
    # Backend source registration is written only by PUT /api/yield-sources/wallets.
    "yield_backend_source_wallets_v1",
    # Read-only upstream observations and reconciliation outputs.
    "yield_backend_source_snapshots_v1",
    "yield_backend_source_observations_v1",
    "yield_backend_lulo_monthly_ledger_v1",
    "yield_backend_loopscale_pnl_ledger_v1",
    "yield_backend_lulo_transaction_previews_v1",
    # Same-input parity reports are written only by POST /api/yield-sources/lulo-parity.
    "yield_lulo_transaction_parity_reports_v1",
    # Original financial checkpoints are immutable from client settings.
    "yield_loopscale_cutover_backup_v1",
    # Validated project feed and sync health belong to project_tracking.
    "yield_project_latest_balance_feed_v1",
    "yield_project_sync_alerts_v1",
})

SERVER_OWNED_SETTING_PREFIXES = (
    "yield_lulo_cutover_backup_v1_",
    "yield_project_balance_backup_",
    "yield_server_daily_income_",
)


def is_server_owned_setting(key: str) -> bool:
    """Block generic PUT, including keys that have not yet been created."""
    return key in SERVER_OWNED_SETTING_KEYS or any(
        key.startswith(prefix) for prefix in SERVER_OWNED_SETTING_PREFIXES
    )
