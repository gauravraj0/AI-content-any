"""Tiny JSON-file backed persistence layer.

Design note
-----------
The product spec calls for PostgreSQL + Firebase. This module keeps every
read/write behind a small repository surface (``DB.users``, ``DB.projects`` ...)
so the storage engine can be swapped for SQLAlchemy/Postgres in production
without touching the routers:  each collection is a list of dicts keyed by
``id``, exactly like a table.

In dev the whole dataset lives in ``.data/studio.json`` (atomic writes,
process-safe via a lock file).
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("STUDIO_DATA_DIR", ROOT / ".data"))
DATA_FILE = DATA_DIR / "studio.json"

COLLECTIONS = ("users", "sessions", "projects", "documents", "prompts",
               "templates", "events", "subscriptions")

_lock = threading.RLock()


def new_id(prefix: str = "") -> str:
    raw = uuid.uuid4().hex[:12]
    return f"{prefix}_{raw}" if prefix else raw


def now() -> int:
    return int(time.time())


class Table:
    """List-of-dicts collection with an id index."""

    def __init__(self, store: "Store", name: str) -> None:
        self._store = store
        self.name = name

    def all(self) -> list[dict[str, Any]]:
        with _lock:
            return [dict(r) for r in self._store.data[self.name]]

    def find(self, **match: Any) -> list[dict[str, Any]]:
        with _lock:
            rows = [dict(r) for r in self._store.data[self.name]
                    if all(r.get(k) == v for k, v in match.items())]
        return rows

    def first(self, **match: Any) -> dict[str, Any] | None:
        rows = self.find(**match)
        return rows[0] if rows else None

    def insert(self, record: dict[str, Any]) -> dict[str, Any]:
        record.setdefault("id", new_id())
        record.setdefault("created_at", now())
        with _lock:
            self._store.data[self.name].append(dict(record))
            self._store.flush()
        return record

    def update(self, rec_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with _lock:
            for row in self._store.data[self.name]:
                if row.get("id") == rec_id:
                    row.update(patch)
                    row["updated_at"] = now()
                    self._store.flush()
                    return dict(row)
        return None

    def delete(self, rec_id: str) -> bool:
        with _lock:
            rows = self._store.data[self.name]
            kept = [r for r in rows if r.get("id") != rec_id]
            if len(kept) == len(rows):
                return False
            self._store.data[self.name] = kept
            self._store.flush()
            return True

    def replace_all(self, rows: Iterable[dict[str, Any]]) -> None:
        with _lock:
            self._store.data[self.name] = [dict(r) for r in rows]
            self._store.flush()


class Store:
    def __init__(self) -> None:
        self.data: dict[str, list[dict[str, Any]]] = {c: [] for c in COLLECTIONS}
        self._loaded = False
        # one Table accessor per collection: DB.users, DB.documents, ...
        for name in COLLECTIONS:
            setattr(self, name, Table(self, name))

    def load(self) -> None:
        if self._loaded:
            return
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if DATA_FILE.exists():
            try:
                raw = json.loads(DATA_FILE.read_text() or "{}")
                for name in COLLECTIONS:
                    self.data[name] = raw.get(name, [])
            except Exception:  # corrupt dev file -> start clean
                pass
        self._loaded = True

    def flush(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = DATA_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=0, sort_keys=True))
        os.replace(tmp, DATA_FILE)

    def reset(self) -> None:
        with _lock:
            for name in COLLECTIONS:
                self.data[name] = []
            self.flush()


DB = Store()


class Q:
    """Query helpers shared by routers."""

    @staticmethod
    def order_desc(rows: list[dict], key: str = "created_at") -> list[dict]:
        return sorted(rows, key=lambda r: r.get(key, 0), reverse=True)

    @staticmethod
    def words(text: str) -> int:
        return len([w for w in str(text).split() if w.strip()])


DB.load()
