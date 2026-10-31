"""Compare-and-swap plans for legacy project JSON, without collection deletion."""
from copy import deepcopy


class ProjectConflict(ValueError):
    pass


def plan_project_changes(current, changes):
    """Validate the complete batch before returning any mutations.

    An exact replay is a no-op. Conflicting financial/history fields are never
    automatically merged. Call under a per-user database lock.
    """
    planned = {}
    for change in changes:
        project_id = change.get("id")
        if not isinstance(project_id, str) or not project_id or len(project_id) > 64 or project_id in planned:
            raise ValueError("Project changes require unique nonempty IDs.")
        before, after = change.get("before"), change.get("after")
        if before is None and after is None:
            raise ValueError("Empty project change.")
        for record in (before, after):
            if record is not None and (not isinstance(record, dict) or record.get("id") != project_id):
                raise ValueError("Project change ID mismatch.")
        actual = current.get(project_id)
        if actual != after and actual != before:
            raise ProjectConflict(project_id)
        planned[project_id] = deepcopy(after)
    return planned
