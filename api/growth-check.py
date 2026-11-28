"""Vercel route wrapper for the shared public website growth scanner."""
from lib import growth_check_core as _GROWTH_CORE
from lib.growth_check_core import *  # noqa: F401,F403

handler = _GROWTH_CORE.handler
