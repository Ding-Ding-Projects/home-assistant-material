"""Recorder websocket commands that report database storage usage.

All sizes derived from row counts are estimates: the states table size divided
by its row count gives an average row size, which is multiplied by the rows of
an entity. Row counts, timestamps and the database size are measured values.
"""

from datetime import timedelta
import os
from typing import Any

import probatio
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm.session import Session

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.recorder import get_instance, session_scope
from homeassistant.util import dt as dt_util

from .const import SupportedDialect
from .db_schema import States, StatesMeta
from .entity_options import is_entity_recorded
from .util import dburl_to_path

GROWTH_DAYS = 14
DEFAULT_ENTITY_LIMIT = 50
MAX_ENTITY_LIMIT = 200
DEFAULT_ENTITY_DAYS = 14
MAX_ENTITY_DAYS = 30


@callback
def async_setup(hass: HomeAssistant) -> None:
    """Set up the storage usage websocket commands."""
    websocket_api.async_register_command(hass, ws_storage_overview)
    websocket_api.async_register_command(hass, ws_storage_entity)


def _sqlite_sizes(session: Session, db_url: str) -> tuple[int | None, int | None]:
    """Return the database file size and the size of the states table."""
    db_size: int | None = None
    try:
        db_size = os.path.getsize(dburl_to_path(db_url))
    except OSError:
        pass
    table_size: int | None = None
    try:
        # dbstat is a SQLite extension that is not compiled into every build.
        table_size = session.execute(
            text(
                "SELECT SUM(pgsize) FROM dbstat WHERE name = 'states' OR name IN "
                "(SELECT name FROM sqlite_master WHERE type = 'index' "
                "AND tbl_name = 'states')"
            )
        ).scalar()
    except SQLAlchemyError:
        table_size = None
    return db_size, table_size


def _mysql_sizes(session: Session) -> tuple[int | None, int | None]:
    """Return the database size and the size of the states table."""
    db_size = session.execute(
        text(
            "SELECT SUM(data_length + index_length) FROM information_schema.tables "
            "WHERE table_schema = DATABASE()"
        )
    ).scalar()
    table_size = session.execute(
        text(
            "SELECT data_length + index_length FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = 'states'"
        )
    ).scalar()
    return _as_int(db_size), _as_int(table_size)


def _postgresql_sizes(session: Session) -> tuple[int | None, int | None]:
    """Return the database size and the size of the states table."""
    db_size = session.execute(
        text("SELECT pg_database_size(current_database())")
    ).scalar()
    table_size = session.execute(text("SELECT pg_total_relation_size('states')")).scalar()
    return _as_int(db_size), _as_int(table_size)


def _as_int(value: Any) -> int | None:
    """Convert a database number to an int, keeping None."""
    return None if value is None else int(value)


def _database_sizes(
    session: Session, dialect: SupportedDialect | None, db_url: str
) -> tuple[int | None, int | None]:
    """Return (database size, states table size) in bytes, None when unknown."""
    try:
        if dialect == SupportedDialect.SQLITE:
            return _sqlite_sizes(session, db_url)
        if dialect == SupportedDialect.MYSQL:
            return _mysql_sizes(session)
        if dialect == SupportedDialect.POSTGRESQL:
            return _postgresql_sizes(session)
    except SQLAlchemyError:
        return None, None
    return None, None


def _day_starts(days: int) -> list[float]:
    """Return the UTC timestamps of the last `days` local day starts, oldest first."""
    today = dt_util.start_of_local_day()
    starts = []
    for offset in range(days - 1, -1, -1):
        starts.append(dt_util.start_of_local_day(today - timedelta(days=offset)))
    return [start.timestamp() for start in starts]


def _rows_per_day(
    session: Session, days: int, metadata_id: int | None = None
) -> list[dict[str, Any]]:
    """Count states rows for each of the last `days` local days."""
    starts = _day_starts(days)
    ends = [*starts[1:], dt_util.utcnow().timestamp() + 1]
    result = []
    for start, end in zip(starts, ends, strict=True):
        stmt = select(func.count()).select_from(States).where(
            States.last_updated_ts >= start, States.last_updated_ts < end
        )
        if metadata_id is not None:
            stmt = stmt.where(States.metadata_id == metadata_id)
        result.append({"start": start, "rows": session.execute(stmt).scalar() or 0})
    return result


def _average_row_bytes(table_size: int | None, rows: int) -> float | None:
    """Return the average bytes per states row, None when it cannot be known."""
    if table_size is None or rows <= 0:
        return None
    return table_size / rows


def _estimate(rows: int, average_row_bytes: float | None) -> int | None:
    """Estimate the bytes used by `rows` rows."""
    if average_row_bytes is None:
        return None
    return round(rows * average_row_bytes)


def _storage_overview(
    hass: HomeAssistant, limit: int, dialect: SupportedDialect | None, db_url: str
) -> dict[str, Any]:
    """Build the storage overview. Runs in the recorder executor."""
    with session_scope(hass=hass, read_only=True) as session:
        db_size, table_size = _database_sizes(session, dialect, db_url)
        total_rows = session.execute(select(func.count()).select_from(States)).scalar() or 0
        oldest, newest = session.execute(
            select(func.min(States.last_updated_ts), func.max(States.last_updated_ts))
        ).one()
        average_row_bytes = _average_row_bytes(table_size, total_rows)
        growth = _rows_per_day(session, GROWTH_DAYS)
        row_count = func.count().label("rows")
        top = session.execute(
            select(StatesMeta.entity_id, row_count)
            .select_from(States)
            .join(StatesMeta, States.metadata_id == StatesMeta.metadata_id)
            .group_by(StatesMeta.entity_id)
            .order_by(row_count.desc(), StatesMeta.entity_id)
            .limit(limit)
        ).all()

    return {
        "database": {
            "engine": dialect.value if dialect else None,
            "size_bytes": db_size,
            "size_source": (
                None
                if db_size is None
                else "file" if dialect == SupportedDialect.SQLITE else "engine_query"
            ),
        },
        "states": {
            "rows": total_rows,
            "oldest": oldest,
            "newest": newest,
            "table_bytes": table_size,
            "average_row_bytes": average_row_bytes,
        },
        "growth": growth,
        "entities": [
            {
                "entity_id": entity_id,
                "rows": rows,
                "estimated_bytes": _estimate(rows, average_row_bytes),
            }
            for entity_id, rows in top
        ],
    }


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "recorder/storage/overview",
        probatio.Optional("limit", default=DEFAULT_ENTITY_LIMIT): probatio.All(
            int, probatio.Range(min=1, max=MAX_ENTITY_LIMIT)
        ),
    }
)
@websocket_api.async_response
async def ws_storage_overview(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Report the database size, growth and the entities with the most rows."""
    instance = get_instance(hass)
    result = await instance.async_add_executor_job(
        _storage_overview, hass, msg["limit"], instance.dialect_name, instance.db_url
    )
    connection.send_result(msg["id"], result)


def _storage_entity(
    hass: HomeAssistant,
    entity_id: str,
    days: int,
    dialect: SupportedDialect | None,
    db_url: str,
) -> dict[str, Any]:
    """Build the storage details of one entity. Runs in the recorder executor."""
    with session_scope(hass=hass, read_only=True) as session:
        _, table_size = _database_sizes(session, dialect, db_url)
        total_rows = session.execute(select(func.count()).select_from(States)).scalar() or 0
        average_row_bytes = _average_row_bytes(table_size, total_rows)
        metadata_id = session.execute(
            select(StatesMeta.metadata_id).where(StatesMeta.entity_id == entity_id)
        ).scalar()
        if metadata_id is None:
            return {
                "rows": 0,
                "first": None,
                "last": None,
                "per_day": [],
                "estimated_bytes": _estimate(0, average_row_bytes),
                "average_row_bytes": average_row_bytes,
                "total_rows": total_rows,
                "table_bytes": table_size,
            }
        rows = (
            session.execute(
                select(func.count())
                .select_from(States)
                .where(States.metadata_id == metadata_id)
            ).scalar()
            or 0
        )
        first, last = session.execute(
            select(func.min(States.last_updated_ts), func.max(States.last_updated_ts))
            .where(States.metadata_id == metadata_id)
        ).one()
        per_day = _rows_per_day(session, days, metadata_id)

    return {
        "rows": rows,
        "first": first,
        "last": last,
        "per_day": per_day,
        "estimated_bytes": _estimate(rows, average_row_bytes),
        "average_row_bytes": average_row_bytes,
        "total_rows": total_rows,
        "table_bytes": table_size,
    }


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "recorder/storage/entity",
        probatio.Required("entity_id"): cv.strict_entity_id,
        probatio.Optional("days", default=DEFAULT_ENTITY_DAYS): probatio.All(
            int, probatio.Range(min=1, max=MAX_ENTITY_DAYS)
        ),
    }
)
@websocket_api.async_response
async def ws_storage_entity(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Report how many rows one entity has, how fast they grow and the cost."""
    instance = get_instance(hass)
    result = await instance.async_add_executor_job(
        _storage_entity,
        hass,
        msg["entity_id"],
        msg["days"],
        instance.dialect_name,
        instance.db_url,
    )
    result["recording_excluded"] = not is_entity_recorded(hass, msg["entity_id"])
    result["keep_days"] = instance.keep_days
    connection.send_result(msg["id"], result)
