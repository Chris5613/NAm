"""Interactive setup for the NAm Tapo P115 bridge."""

import asyncio
import getpass
import json
import os
from pathlib import Path

from kasa import Credentials, Discover

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
DEFAULT_NAM_URL = "https://nam1-dmte.onrender.com"


def ask(prompt, default=None, secret=False):
    suffix = f" [{default}]" if default else ""
    value = (getpass.getpass if secret else input)(f"{prompt}{suffix}: ").strip()
    return value or (default or "")


async def discover_devices(username, password):
    credentials = Credentials(username, password)
    print("\nSearching your home network for Tapo/Kasa devices...")
    devices = await Discover.discover(credentials=credentials, discovery_timeout=6)
    rows = []
    for host, device in sorted(devices.items()):
        try:
            await device.update()
        except Exception:
            pass
        model = str(getattr(device, "model", "") or "")
        alias = str(getattr(device, "alias", "") or "")
        rows.append({
            "host": host,
            "model": model,
            "alias": alias,
        })
    return rows


def choose_device(rows, label, exclude_host=None):
    candidates = [row for row in rows if row["host"] != exclude_host]
    if not candidates:
        raise SystemExit("No remaining devices were found.")
    print(f"\nChoose the P115 powering your {label}:")
    for index, row in enumerate(candidates, 1):
        name = row["alias"] or "Unnamed device"
        model = row["model"] or "Unknown model"
        print(f"  {index}. {name} — {model} — {row['host']}")
    while True:
        raw = input("Enter number: ").strip()
        try:
            selected = candidates[int(raw) - 1]
            return selected
        except (ValueError, IndexError):
            print("Please enter one of the numbers shown above.")


def main():
    print("NAm Tapo P115 bridge setup")
    print("---------------------------")
    nam_url = ask("NAm backend URL", DEFAULT_NAM_URL)
    token = ask("Power bridge token from NAm", secret=True)
    tapo_username = ask("Tapo account email")
    tapo_password = ask("Tapo account password", secret=True)

    try:
        rows = asyncio.run(discover_devices(tapo_username, tapo_password))
    except Exception as error:
        raise SystemExit(f"Could not discover Tapo devices: {error}") from error

    p115s = [row for row in rows if "P115" in row["model"].upper()]
    selectable = p115s or rows
    if not selectable:
        print("\nNo Tapo/Kasa devices were auto-discovered.")
        print("This can happen when broadcast discovery is blocked even though the plugs are reachable.")
        print("You can continue by entering the P115 LAN IP addresses manually.")
        plug1 = ask("RTX 5070 P115 IP address")
        plug2 = ask("RTX 2080 Super P115 IP address")
        if not plug1 or not plug2 or plug1 == plug2:
            raise SystemExit("Two different P115 IP addresses are required.")
        gpu5070 = {"host": plug1, "model": "P115", "alias": "RTX 5070 PC"}
        gpu2080 = {"host": plug2, "model": "P115", "alias": "RTX 2080 Super PC"}
    else:
        if p115s:
            print(f"\nFound {len(p115s)} Tapo P115 device(s).")
        else:
            print("\nNo device identified itself specifically as P115, so all discovered devices are shown.")

        gpu5070 = choose_device(selectable, "RTX 5070 PC")
        gpu2080 = choose_device(selectable, "RTX 2080 Super PC", exclude_host=gpu5070["host"])

    config = {
        "nam_url": nam_url.rstrip("/"),
        "token": token,
        "interval_seconds": 15,
        "tapo_username": tapo_username,
        "tapo_password": tapo_password,
        "plugs": [
            {"id": "rtx5070", "label": "RTX 5070 PC", "host": gpu5070["host"]},
            {"id": "rtx2080super", "label": "RTX 2080 Super PC", "host": gpu2080["host"]},
        ],
    }
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")

    print("\nSetup complete.")
    print(f"RTX 5070 PC: {gpu5070['host']}")
    print(f"RTX 2080 Super PC: {gpu2080['host']}")
    print("Run run.bat to start sending live wattage to NAm.")
    print("Your Tapo credentials and bridge token are stored only in local config.json.")


if __name__ == "__main__":
    main()
