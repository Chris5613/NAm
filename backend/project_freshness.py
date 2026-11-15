"""Provider-specific expected-refresh cadence for project valuations.

A stale market/source observation is NOT zero balance and is never mining income.
An inactive source retains its historical snapshot without freshness alarms.
Unetwork publishes its account reading once a day around 17:00 Pacific; other
active live sources retain the short freshness threshold.
"""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
DEFAULT_LIVE_MAX_AGE = timedelta(minutes=20)
UNETWORK_UPDATE_TIME = time(17, 0)
UNETWORK_GRACE_PERIOD = timedelta(minutes=90)


def _timestamp(value):
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _is_unetwork(project):
    provider = "".join(ch for ch in str(project.get("name") or "").lower() if ch.isalnum())
    project_id = "".join(ch for ch in str(project.get("id") or "").lower() if ch.isalnum())
    return provider in {"unetwork", "unitynetwork"} or project_id.startswith("unetworkproject")


def is_project_stale(project, now):
    """Whether a required active provider update is overdue at *now*.

    For Unetwork the 17:00 Pacific update is due at 18:30 local time (grace
    window), and its previous day's reading remains valid until then. This
    respects daylight saving time via America/Los_Angeles.
    """
    if project.get("inactive") or not project.get("requiresLiveSync"):
        return False
    observation = _timestamp(project.get("sourceLastSyncedAt"))
    checked_at = _timestamp(now)
    if checked_at is None:
        raise ValueError("now must be a timestamp")
    if observation is None:
        return True
    if observation > checked_at + timedelta(minutes=5):
        return True

    if _is_unetwork(project):
        local_now = checked_at.astimezone(PACIFIC)
        today_slot = datetime.combine(local_now.date(), UNETWORK_UPDATE_TIME, PACIFIC)
        required_slot = today_slot if local_now >= today_slot + UNETWORK_GRACE_PERIOD else (
            datetime.combine(local_now.date() - timedelta(days=1), UNETWORK_UPDATE_TIME, PACIFIC)
        )
        return observation < required_slot

    return checked_at - observation > DEFAULT_LIVE_MAX_AGE
