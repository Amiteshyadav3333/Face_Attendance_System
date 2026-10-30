"""Shared validation for user-entered academic year labels."""


def normalize_academic_year(value):
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.split())
    if not normalized or len(normalized) > 50:
        return None
    return normalized
