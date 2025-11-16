"""
Shared constants from nats-subjects.json
"""

import json
from pathlib import Path

# When installed as a package, nats-subjects.json is in the same directory as __init__.py
_json_path = Path(__file__).parent / "nats-subjects.json"
_data = json.loads(_json_path.read_text())

# Create NATS_SUBJECTS as the main export (matching TypeScript API)
NATS_SUBJECTS = _data

# Also export individual subject groups for convenience
globals().update(_data)
__all__ = ["NATS_SUBJECTS"] + list(_data.keys())
