from __future__ import annotations

from sqlalchemy import inspect


def model_dict(value) -> dict:
    return {column.key: getattr(value, column.key) for column in inspect(value).mapper.column_attrs}
