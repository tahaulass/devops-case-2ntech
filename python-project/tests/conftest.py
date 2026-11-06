"""Test-only compatibility shim.

pymongo >= 4.11 passes a `sort` argument to the bulk builder when an UpdateOne is added
to a bulk_write. mongomock 4.3 (latest) does not accept it yet. The ETL never uses `sort`,
so dropping the argument in the fake database keeps the tests meaningful. Production code
talks to a real MongoDB and is not affected.
"""

import mongomock.collection as _mc

_original_add_update = _mc.BulkOperationBuilder.add_update


def _add_update(self, *args, sort=None, **kwargs):  # `sort` is intentionally ignored
    return _original_add_update(self, *args, **kwargs)


_mc.BulkOperationBuilder.add_update = _add_update
