"""Log the running stack when a web worker stops answering its event loop."""

import asyncio
import logging
import sys
import threading
import traceback

log = logging.getLogger(__name__)
_stop = threading.Event()
_thread: threading.Thread | None = None


def start_watchdog() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    loop = asyncio.get_running_loop()
    owner_thread = threading.get_ident()

    def monitor() -> None:
        while not _stop.wait(2):
            answered = threading.Event()
            try:
                loop.call_soon_threadsafe(answered.set)
            except RuntimeError:
                return
            if answered.wait(5) or _stop.is_set():
                continue
            frame = sys._current_frames().get(owner_thread)
            if frame is not None:
                log.error("Web event loop unresponsive for over 5 seconds:\n%s",
                          "".join(traceback.format_stack(frame)))
            # Avoid flooding logs while one stalled call is still active.
            answered.wait(30)

    _thread = threading.Thread(target=monitor, name="nam-loop-watchdog", daemon=True)
    _thread.start()


def stop_watchdog() -> None:
    _stop.set()
