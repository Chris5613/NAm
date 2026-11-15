"""Fail CI when a change alters frozen Lulo-specific code.

This is a read-only change gate. It does not modify providers, earnings,
project status, history, or Lulo runtime behavior.
"""
import argparse
import re
import subprocess
import sys

LULO = re.compile(r"lulo", re.IGNORECASE)
SOURCE_SUFFIXES = (".py", ".js", ".jsx", ".ts", ".tsx", ".json")
EXEMPT = ("docs/", "tools/lulo_freeze_guard.py")
DIFF_FILE = re.compile(r"^\+\+\+ b/(.+)$")


def frozen_changes(patch: str) -> list[str]:
    issues = []
    filename = ""
    for line in patch.splitlines():
        match = DIFF_FILE.match(line)
        if match:
            filename = match.group(1)
            continue
        if line.startswith("diff --git "):
            filename = ""
            continue
        if not filename or filename.startswith(EXEMPT):
            continue
        if not filename.endswith(SOURCE_SUFFIXES):
            continue
        if not ((line.startswith("+") and not line.startswith("+++"))
                or (line.startswith("-") and not line.startswith("---"))):
            continue
        if LULO.search(filename) or LULO.search(line[1:]):
            issues.append(f"{filename}: frozen Lulo code was modified")
    return sorted(set(issues))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    args = parser.parse_args()
    patch = subprocess.run(
        ["git", "diff", "--no-ext-diff", "--unified=0",
         "--no-renames", args.base, "HEAD", "--"],
        text=True, capture_output=True, check=False,
    )
    if patch.returncode:
        print("Unable to establish reliable Lulo freeze diff:", patch.stderr)
        return 2
    violations = frozen_changes(patch.stdout)
    if violations:
        print("Lulo is INACTIVE / FROZEN. Explicit user authorization is "
              "required before modifying any Lulo-specific code.")
        for item in violations:
            print(" -", item)
        print("See docs/LULO_INACTIVE_FREEZE.md")
        return 1
    print("Lulo freeze verified: no Lulo-specific source changes detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
