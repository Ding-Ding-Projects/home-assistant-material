"""Tests for command building, quoting and host validation."""

import shlex
from typing import Any

import pytest

from homeassistant.components.minecraft_manager import commands
from homeassistant.components.minecraft_manager.const import MINECRAFT_IMAGE
from homeassistant.components.minecraft_manager.host_validation import (
    is_forbidden_target,
    is_lan_address,
    is_valid_address,
    validate_host,
)

SERVER: dict[str, Any] = {
    "id": "b" * 32,
    "name": "Family survival",
    "edition": "java",
    "flavour": "paper",
    "version": "1.21.4",
    "port": 25565,
    "memory_mb": 2048,
}
HOST: dict[str, Any] = {
    "name": "Garage server",
    "address": "192.168.1.20",
    "port": 22,
    "user": "docker",
}


def test_run_command_shape() -> None:
    """The run command publishes on one address and pins the image."""
    command = commands.run(SERVER, "192.168.1.20")
    assert command[:3] == ["docker", "run", "--detach"]
    assert command[command.index("--name") + 1] == "mc-family-survival"
    assert command[command.index("--publish") + 1] == "192.168.1.20:25565:25565/tcp"
    assert command[command.index("--volume") + 1] == "mc-family-survival-data:/data"
    assert "TYPE=PAPER" in command
    assert "VERSION=1.21.4" in command
    assert "MEMORY=2048M" in command
    assert command[command.index("--memory") + 1] == "2560m"
    assert command[-1] == MINECRAFT_IMAGE
    assert not MINECRAFT_IMAGE.endswith(":latest")


def test_latest_version_sets_no_version() -> None:
    """The word latest leaves the choice to the image."""
    command = commands.run({**SERVER, "version": "latest"}, "10.0.0.5")
    assert not any(item.startswith("VERSION=") for item in command)


def test_ipv6_bind_address_is_bracketed() -> None:
    """An IPv6 address is written the way Docker expects."""
    command = commands.run(SERVER, "fd00::5")
    assert command[command.index("--publish") + 1] == "[fd00::5]:25565:25565/tcp"


@pytest.mark.parametrize(
    ("change", "code"),
    [
        pytest.param({"name": "x; rm -rf /"}, "invalid_name", id="name-semicolon"),
        pytest.param({"name": "a$(id)"}, "invalid_name", id="name-substitution"),
        pytest.param({"name": "a\nb"}, "invalid_name", id="name-newline"),
        pytest.param({"name": "-rf"}, "invalid_name", id="name-dash"),
        pytest.param({"version": "1.21; id"}, "invalid_version", id="version"),
        pytest.param({"version": "1.21\n"}, "invalid_version", id="version-newline"),
        pytest.param({"port": "25565; id"}, "invalid_port", id="port-string"),
        pytest.param({"port": 80}, "invalid_port", id="port-low"),
        pytest.param({"memory_mb": 1}, "invalid_memory", id="memory"),
        pytest.param({"flavour": "evil"}, "invalid_flavour", id="flavour"),
        pytest.param({"edition": "bedrock"}, "edition_not_supported", id="edition"),
        pytest.param({"id": "not hex"}, "invalid_id", id="id"),
    ],
)
def test_hostile_values_refused_before_a_command_exists(
    change: dict[str, Any], code: str
) -> None:
    """A bad value raises; no argument list is ever returned."""
    with pytest.raises(commands.CommandError) as error:
        commands.run({**SERVER, **change}, "192.168.1.20")
    assert error.value.code == code


@pytest.mark.parametrize("bind", ["", "host name", "1.2.3.4; id", "$(id)"])
def test_bind_address_must_be_an_ip(bind: str) -> None:
    """Only an IP address literal can be a bind address."""
    with pytest.raises(commands.CommandError):
        commands.run(SERVER, bind)


def test_shlex_round_trip_keeps_one_argument_per_value() -> None:
    """Joining and splitting gives back the same list, so nothing is re-parsed."""
    command = commands.run(SERVER, "192.168.1.20")
    assert shlex.split(shlex.join(command)) == command
    inspect = commands.inspect("Family survival")
    assert shlex.split(shlex.join(inspect)) == inspect


@pytest.mark.parametrize("lines", [0, -1, 501, True, "10", 1.5])
def test_log_lines_bounded(lines: Any) -> None:
    """Only a whole number from 1 to 500 is accepted."""
    with pytest.raises(commands.CommandError):
        commands.logs("Family survival", lines)


def test_slug_collisions_and_limits() -> None:
    """Names that differ only in punctuation give the same container name."""
    assert commands.slug("Family survival") == commands.slug("family-survival")
    assert len(commands.slug("a" * 48)) <= 40


@pytest.mark.parametrize(
    ("status", "stderr", "code"),
    [
        pytest.param(127, "", "docker_missing", id="missing"),
        pytest.param(1, "permission denied while trying to connect", "docker_permission", id="permission"),
        pytest.param(1, "Cannot connect to the Docker daemon at unix:///x", "docker_not_running", id="daemon"),
        pytest.param(1, "Error: No such object: mc-x", "container_not_found", id="absent"),
        pytest.param(125, "port is already allocated", "port_in_use", id="port"),
        pytest.param(125, "The container name is already in use", "container_exists", id="exists"),
        pytest.param(1, "something with /home/secret/path", "command_failed", id="other"),
    ],
)
def test_failure_classification(status: int, stderr: str, code: str) -> None:
    """Remote error text becomes a code; the text itself is dropped."""
    assert commands.classify_failure(status, stderr) == code


def test_valid_host() -> None:
    """A complete host has no errors."""
    cleaned, errors = validate_host(HOST)
    assert errors == []
    assert cleaned == HOST


@pytest.mark.parametrize(
    ("change", "field", "code"),
    [
        pytest.param({"name": ""}, "name", "required", id="name"),
        pytest.param({"address": "a b"}, "address", "invalid_address", id="space"),
        pytest.param({"address": "-oProxyCommand=x"}, "address", "invalid_address", id="option"),
        pytest.param({"address": "ho\nst"}, "address", "invalid_address", id="newline"),
        pytest.param({"address": "999.1.1.1"}, "address", "invalid_address", id="octet"),
        pytest.param({"port": 0}, "port", "out_of_range", id="port-zero"),
        pytest.param({"port": 70000}, "port", "out_of_range", id="port-high"),
        pytest.param({"port": True}, "port", "out_of_range", id="port-bool"),
        pytest.param({"user": "root; id"}, "user", "invalid_user", id="user"),
        pytest.param({"user": "-x"}, "user", "invalid_user", id="user-dash"),
        pytest.param({"extra": 1}, "extra", "unknown_field", id="unknown"),
    ],
)
def test_invalid_host(change: dict[str, Any], field: str, code: str) -> None:
    """Each rule reports its own field and code."""
    _, errors = validate_host({**HOST, **change})
    assert {"field": field, "code": code} in errors


@pytest.mark.parametrize("address", ["garage.local", "10.0.0.5", "fd00::5", "Garage"])
def test_valid_addresses(address: str) -> None:
    """Host names and IP literals are accepted."""
    _, errors = validate_host({**HOST, "address": address})
    assert errors == []


def test_inspect_names_the_object_type_and_reads_the_owner() -> None:
    """A volume called like a container is never inspected as a container."""
    command = commands.inspect("Family survival")
    assert command[:4] == ["docker", "inspect", "--type", "container"]
    assert "minecraft_manager.server_id" in command[command.index("--format") + 1]
    assert command[-1] == "mc-family-survival"
    # The container of "foo-data" and the volume of "foo" share one name.
    assert commands.container_name("foo-data") == commands.volume_name("foo")


def test_volume_commands_carry_the_owner_label() -> None:
    """The data volume is created with, and inspected for, the owner label."""
    create = commands.volume_create("Family survival", "b" * 32)
    assert create == [
        "docker",
        "volume",
        "create",
        "--label",
        f"minecraft_manager.server_id={'b' * 32}",
        "mc-family-survival-data",
    ]
    inspect = commands.volume_inspect("Family survival")
    assert inspect[:3] == ["docker", "volume", "inspect"]
    assert inspect[-1] == "mc-family-survival-data"
    with pytest.raises(commands.CommandError):
        commands.volume_create("Family survival", "not hex")


def test_run_command_limits_the_container() -> None:
    """The container cannot gain privileges, fork without end or fill the disk."""
    command = commands.run(SERVER, "192.168.1.20")
    assert command[command.index("--security-opt") + 1] == "no-new-privileges"
    assert int(command[command.index("--pids-limit") + 1]) > 0
    options = [command[i + 1] for i, item in enumerate(command) if item == "--log-opt"]
    assert options == ["max-size=10m", "max-file=3"]
    assert command[command.index("--label") + 1] == (
        f"minecraft_manager.server_id={SERVER['id']}"
    )


@pytest.mark.parametrize(
    "bind",
    [
        "0.0.0.0",
        "::",
        "255.255.255.255",
        "224.0.0.1",
        "ff02::1",
        "240.0.0.1",
        "192.0.2.5",
        "198.51.100.7",
        "203.0.113.9",
        "198.18.0.1",
        "2001:db8::1",
        "fe80::1%eth0",
        "::ffff:192.168.1.5",
        "8.8.8.8",
    ],
)
def test_bind_address_must_be_a_lan_unicast_address(bind: str) -> None:
    """Special ranges, scoped addresses and public addresses are refused."""
    with pytest.raises(commands.CommandError) as error:
        commands.run(SERVER, bind)
    assert error.value.code == "invalid_address"


@pytest.mark.parametrize(
    "address",
    ["192.168.1.20", "10.0.0.5", "172.16.4.4", "127.0.0.1", "169.254.1.1", "fd00::5", "fe80::1"],
)
def test_lan_addresses(address: str) -> None:
    """Private, loopback and link-local unicast addresses are LAN addresses."""
    assert is_lan_address(address)


@pytest.mark.parametrize(
    "address", ["", "not-an-ip", "0.0.0.0", "::", "224.0.0.1", "8.8.8.8", "192.0.2.5"]
)
def test_not_lan_addresses(address: str) -> None:
    """Anything else is not."""
    assert not is_lan_address(address)


@pytest.mark.parametrize(
    "address",
    ["0x7f.1", "0x7f.0.0.1", "127.1", "1.2.3", "010.0.0.1", "fe80::1%eth0", "a%b", "123", "0x10", "1.2.3.4.5"],
)
def test_numeric_and_scoped_forms_are_not_addresses(address: str) -> None:
    """Only dotted decimal, a plain IPv6 literal or a real name is accepted."""
    assert not is_valid_address(address)
    _, errors = validate_host({**HOST, "address": address})
    assert {"field": "address", "code": "invalid_address"} in errors


@pytest.mark.parametrize(
    "address", ["garage.local", "10.0.0.5", "fd00::5", "a1.example", "host-1", "nas2"]
)
def test_real_names_and_literals_are_addresses(address: str) -> None:
    """Names and literals that no resolver reads as a number stay valid."""
    assert is_valid_address(address)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "127.5.5.5",
        "::1",
        "169.254.169.254",
        "fe80::1",
        "0.0.0.0",
        "::",
        "localhost",
        "LOCALHOST",
        "printer.localhost",
        "::ffff:127.0.0.1",
    ],
)
def test_host_cannot_point_at_this_machine_or_its_link(address: str) -> None:
    """Loopback, link-local and unspecified targets are refused at creation."""
    assert is_forbidden_target(address)
    _, errors = validate_host({**HOST, "address": address})
    assert {"field": "address", "code": "address_not_allowed"} in errors


@pytest.mark.parametrize("address", ["192.168.1.20", "garage.local", "fd00::5", "8.8.8.8"])
def test_other_targets_are_allowed(address: str) -> None:
    """Ordinary hosts are not refused by the target rule."""
    assert not is_forbidden_target(address)
