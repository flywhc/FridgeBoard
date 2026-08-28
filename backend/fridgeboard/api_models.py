"""Backward-compatible aggregate exports for all public API schemas."""

from fridgeboard.api_auth_models import *  # noqa: F401,F403
from fridgeboard.api_inventory_models import *  # noqa: F401,F403
from fridgeboard.api_model_common import CATEGORY_ID_MAX_LENGTH  # noqa: F401
from fridgeboard.api_notification_models import *  # noqa: F401,F403
from fridgeboard.api_recipe_models import *  # noqa: F401,F403
from fridgeboard.api_recognition_models import *  # noqa: F401,F403
from fridgeboard.api_refrigerator_models import *  # noqa: F401,F403
from fridgeboard.icon_api_models import *  # noqa: F401,F403
