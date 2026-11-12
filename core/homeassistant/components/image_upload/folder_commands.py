"""WebSocket commands for the folders of the image store."""

from __future__ import annotations

from collections.abc import Awaitable
from typing import Any, cast

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .folders import MAX_MOVE_IMAGES, FolderError, ImageFolders


def _folders(hass: HomeAssistant) -> ImageFolders:
    """Return the folders of the image store."""
    return cast(ImageFolders, hass.data[DOMAIN].folders)


async def _async_answer(
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    operation: Awaitable[Any],
) -> None:
    """Run a folder operation and answer with its result or a stable error code."""
    try:
        result = await operation
    except FolderError as err:
        connection.send_error(msg["id"], err.code, str(err))
    else:
        connection.send_result(msg["id"], result)


async def _immediate(value: Any) -> Any:
    """Wrap a value so it can be answered like an operation."""
    return value


def async_register_folder_commands(hass: HomeAssistant) -> None:
    """Register the folder commands."""
    websocket_api.async_register_command(hass, websocket_list_folders)
    websocket_api.async_register_command(hass, websocket_create_folder)
    websocket_api.async_register_command(hass, websocket_rename_folder)
    websocket_api.async_register_command(hass, websocket_remove_folder)
    websocket_api.async_register_command(hass, websocket_move_images)


@websocket_api.websocket_command({probatio.Required("type"): "image/folder/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_list_folders(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the folders with their image and subfolder counts."""
    await _async_answer(connection, msg, _immediate(_folders(hass).async_list()))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "image/folder/create",
        probatio.Optional("parent", default=""): str,
        probatio.Required("name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_create_folder(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create a folder."""
    try:
        result = _folders(hass).async_create(msg["parent"], msg["name"])
    except FolderError as err:
        connection.send_error(msg["id"], err.code, str(err))
    else:
        connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "image/folder/rename",
        probatio.Required("path"): str,
        probatio.Required("new_name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_rename_folder(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Rename a folder; its images and subfolders move with it."""
    await _async_answer(
        connection, msg, _folders(hass).async_rename(msg["path"], msg["new_name"])
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "image/folder/remove",
        probatio.Required("path"): str,
        probatio.Optional("move_to_parent", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_remove_folder(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a folder; one that is not empty only with move_to_parent set."""
    await _async_answer(
        connection,
        msg,
        _folders(hass).async_remove(msg["path"], msg["move_to_parent"]),
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "image/move",
        probatio.Required("image_ids"): probatio.All(
            [str], probatio.Length(min=1, max=MAX_MOVE_IMAGES)
        ),
        probatio.Optional("folder", default=""): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_move_images(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Move images into a folder, or to the root with an empty folder."""
    await _async_answer(
        connection,
        msg,
        _folders(hass).async_move_images(msg["image_ids"], msg["folder"]),
    )
