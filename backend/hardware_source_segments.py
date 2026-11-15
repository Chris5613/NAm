"""Dated hardware provider assignment, not a source of earned revenue.

Periods only authorize *which* verified provider observations may credit a
device on each calendar day. They never provide or persist earnings amounts.
A source change becomes effective the following Pacific day so neither
provider is assigned a fractional day without supporting observations.
"""
from datetime import date, timedelta
from .hardware_credit_audit import normalize_source, sources_for


class InvalidSourceSegments(ValueError):
    pass


def _day(value):
    try:
        parsed = date.fromisoformat(str(value))
        if parsed.isoformat() == str(value):
            return parsed
    except (ValueError, TypeError):
        pass
    raise InvalidSourceSegments("Invalid dated source assignment")


def checked_segments(device):
    """Canonical contiguous segments, or None for a pre-cutover device."""
    rows = device.get("sourceSegments")
    if rows is None:
        return None
    if not isinstance(rows, list) or not rows or len(rows) > 100:
        raise InvalidSourceSegments("Invalid source assignment history")
    result = []
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict):
            raise InvalidSourceSegments("Invalid source assignment")
        start = _day(raw.get("startDay"))
        selected = raw.get("sources")
        if not isinstance(selected, list) or not selected:
            raise InvalidSourceSegments("Missing assigned providers")
        names = [normalize_source(x) for x in selected]
        if any(not x for x in names) or len(names) != len(set(names)):
            raise InvalidSourceSegments("Duplicate or invalid assigned providers")
        last = index == len(rows) - 1
        end_raw = raw.get("endDay")
        if last:
            if end_raw not in (None, ""):
                raise InvalidSourceSegments("Last source assignment must be open-ended")
            end = None
        else:
            end = _day(end_raw)
            if end < start:
                raise InvalidSourceSegments("Inverted source assignment")
        if result and result[-1]["end"] + timedelta(days=1) != start:
            raise InvalidSourceSegments("Gapped or overlapping source assignments")
        result.append({"start": start, "end": end, "sources": names})
    original_start = _day(device.get("earningsStartDay"))
    if result[0]["start"] != original_start:
        raise InvalidSourceSegments("Assignment does not match original earnings start")
    if set(result[-1]["sources"]) != set(sources_for(device)):
        raise InvalidSourceSegments("Latest assignment differs from device sources")
    return result


def switch_source_segments(original, new_sources, today_key):
    """Schedule a provider switch tomorrow, preserving every earlier day."""
    today = _day(today_key)
    first = _day(original.get("earningsStartDay"))
    if first > today:
        raise InvalidSourceSegments("Earnings start is in the future")
    chosen = [normalize_source(source) for source in new_sources]
    if not chosen or any(not name for name in chosen) or len(chosen) != len(set(chosen)):
        raise InvalidSourceSegments("Invalid selected providers")
    existing = checked_segments(original)
    if existing is None:
        existing = [{"start": first, "end": None, "sources": sources_for(original)}]
    new = [{"start": s["start"], "end": s["end"], "sources": list(s["sources"])}
           for s in existing]
    effective = today + timedelta(days=1)
    # Replacing a switch already scheduled for tomorrow must not create an
    # overlapping segment or silently reassign today's earned income.
    if new[-1]["start"] == effective:
        new[-1]["sources"] = chosen
    elif new[-1]["start"] > today:
        raise InvalidSourceSegments("Existing future source assignment needs review")
    else:
        new[-1]["end"] = today
        new.append({"start": effective, "end": None, "sources": chosen})
    return [{
        "startDay": row["start"].isoformat(),
        **({"endDay": row["end"].isoformat()} if row["end"] is not None else {}),
        "sources": row["sources"],
    } for row in new]


def sources_on_day(segments, date_key, default):
    """Return the selected providers for one day; None marks an invalid gap."""
    if segments is None:
        return default
    for item in segments:
        if item["start"].isoformat() <= date_key and (
            item["end"] is None or date_key <= item["end"].isoformat()
        ):
            return item["sources"]
    return None
