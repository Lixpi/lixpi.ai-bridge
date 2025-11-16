"""
Shared constants from nats-subjects.json
"""

import json
from pathlib import Path

_json_path = Path(__file__).parent.parent / "nats-subjects.json"
_data = json.loads(_json_path.read_text())

# Dynamically export all top-level keys
globals().update(_data)
__all__ = list(_data.keys())
