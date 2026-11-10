"""Read Tapo P115 wall power locally and publish it to NAm."""

import asyncio
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time

import requests
from kasa import Discover
from tapo import ApiClient
from tapo.requests import EnergyDataInterval

CONFIG_PATH = Path(__file__).with_name("config.json")


def load_config():
    if not CONFIG_PATH.exists():
        raise SystemExit("Missing config.json. Run setup.bat first.")
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


async def read_plug(plug, username, password):
    # python-kasa's current public API authenticates Tapo devices through
    # discover_single(host, username=..., password=...). Using credentials=
    # directly with Device.connect() is not supported in current releases.
    device = await Discover.discover_single(
        plug["host"],
        username=username,
        password=password,
    )
    if device is None:
        raise RuntimeError("device did not respond")
    await device.update()

    watts = None
    today_kwh = None

    modules = getattr(device, "modules", {}) or {}
    energy = modules.get("Energy") or modules.get("energy")
    if energy is None:
        for key, module in modules.items():
            if "energy" in str(key).lower():
                energy = module
                break

    if energy is not None:
        current = getattr(energy, "current_consumption", None)
        if current is not None:
            watts = float(current)
        today = getattr(energy, "consumption_today", None)
        if today is not None:
            today_kwh = float(today)

    if watts is None:
        for feature_name in ("current_consumption", "power", "current_power"):
            feature = getattr(device, "features", {}).get(feature_name)
            if feature is not None and getattr(feature, "value", None) is not None:
                watts = float(feature.value)
                break

    if watts is None:
        raise RuntimeError(f"{plug['label']}: power sensor not available")

    result = {"id": plug["id"], "label": plug["label"], "watts": round(watts, 2)}
    if today_kwh is not None:
        result["today_kwh"] = round(today_kwh, 4)
    return result


async def collect(config):
    username = config["tapo_username"]
    password = config["tapo_password"]
    results = await asyncio.gather(
        *(read_plug(plug, username, password) for plug in config["plugs"]),
        return_exceptions=True,
    )
    devices = []
    for plug, result in zip(config["plugs"], results):
        if isinstance(result, Exception):
            print(f"[WARN] {plug['label']}: {result}", flush=True)
        else:
            devices.append(result)
    return devices


async def collect_hourly_history(config, lookback_days=7):
    """Read recent hourly Wh history from each P115, preserving per-device totals."""
    client = ApiClient(config["tapo_username"], config["tapo_password"])
    now = datetime.now(timezone.utc)
    lookback_days = max(1, min(int(lookback_days), 7))
    combined = {}

    for plug in config["plugs"]:
        try:
            device = await client.p110(plug["host"])
            timezone_result = await device.get_timezone()
            device_now = now.astimezone(timezone_result.timezone)
            start_date = (device_now - timedelta(days=lookback_days)).date()
            end_date = device_now.date()
            history = await device.get_energy_data(
                EnergyDataInterval.Hourly,
                start_date,
                end_date,
                timezone=timezone_result.timezone,
            )
            for entry in history.entries:
                if entry.energy is None:
                    continue
                start_at = entry.start_date_time.astimezone(timezone.utc)
                key = start_at.replace(minute=0, second=0, microsecond=0).isoformat()
                device_kwh = max(0.0, float(entry.energy)) / 1000.0
                bucket = combined.setdefault(
                    key,
                    {"startAt": key, "kwh": 0.0, "devices": []},
                )
                bucket["kwh"] += device_kwh
                bucket["devices"].append({
                    "id": plug["id"],
                    "label": plug["label"],
                    "kwh": round(device_kwh, 6),
                })
        except Exception as error:
            print(f"[WARN] {plug['label']} history: {error}", flush=True)

    rows = []
    for key in sorted(combined):
        bucket = combined[key]
        bucket["kwh"] = round(bucket["kwh"], 6)
        rows.append(bucket)
    return rows


def publish(config, devices):
    if not devices:
        raise RuntimeError("No Tapo readings were available.")
    url = config["nam_url"].rstrip("/") + "/api/power/ingest"
    response = requests.post(
        url,
        json={"devices": devices},
        headers={"Authorization": f"Bearer {config['token']}"},
        timeout=15,
    )
    response.raise_for_status()
    body = response.json()
    print(f"[OK] {body.get('totalWatts', 0):.0f} W total -> NAm", flush=True)


def publish_history(config, intervals):
    if not intervals:
        print("[INFO] No P115 history was available to backfill.", flush=True)
        return

    url = config["nam_url"].rstrip("/") + "/api/power/backfill"
    response = requests.post(
        url,
        json={"intervals": intervals},
        headers={"Authorization": f"Bearer {config['token']}"},
        timeout=30,
    )
    response.raise_for_status()
    body = response.json()
    print(
        f"[HISTORY] Combined: {body.get('imported', 0)} new hours "
        f"({body.get('importedKwh', 0):.2f} kWh); "
        f"per-GPU: {body.get('deviceImported', 0)} entries "
        f"({body.get('deviceImportedKwh', 0):.2f} kWh) -> NAm",
        flush=True,
    )


def main():
    config = load_config()
    interval = max(5, int(config.get("interval_seconds", 15)))
    history_pending = True
    print("NAm Tapo P115 bridge started. Press Ctrl+C to stop.", flush=True)

    while True:
        try:
            devices = asyncio.run(collect(config))
            publish(config, devices)

            if history_pending:
                history_pending = False
                try:
                    intervals = asyncio.run(
                        collect_hourly_history(
                            config,
                            config.get("history_lookback_days", 7),
                        )
                    )
                    publish_history(config, intervals)
                except Exception as history_error:
                    print(f"[WARN] P115 history import: {history_error}", flush=True)
        except KeyboardInterrupt:
            return
        except Exception as error:
            print(f"[ERROR] {error}", file=sys.stderr, flush=True)

        time.sleep(interval)


if __name__ == "__main__":
    main()
