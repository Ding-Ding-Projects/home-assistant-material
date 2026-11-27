"""Queue a synthetic full backup on a disposable first start and verify its owner login."""

import base64
from datetime import UTC, datetime
import io
import json
import secrets
import shutil
import subprocess
import sys
import tarfile
import time
from uuid import uuid4

import bcrypt
from playwright.sync_api import sync_playwright
import requests


def archive(files, *, compress=False):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz" if compress else "w") as output:
        for name, contents in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(contents)
            member.mode = 0o600
            output.addfile(member, io.BytesIO(contents))
    return data.getvalue()


def store(key, data, version=1):
    return json.dumps({"key": key, "version": version, "minor_version": 1, "data": data}).encode()


def synthetic_backup(core_version, username, password, marker):
    owner_id = uuid4().hex
    owner = {"id": owner_id, "name": username, "is_owner": True, "is_active": True,
             "system_generated": False, "group_ids": ["system-admin"]}
    credential = {"id": uuid4().hex, "user_id": owner_id, "auth_provider_type": "homeassistant",
                  "auth_provider_id": None, "data": {"username": username}}
    password_hash = base64.b64encode(bcrypt.hashpw(password.encode(), bcrypt.gensalt())).decode()
    inner = archive({
        "data/configuration.yaml": (
            f'homeassistant:\n  name: "{marker}"\nfrontend:\napi:\n'
            'onboarding:\nhttp:\n  server_port: 80\n'
        ).encode(),
        "data/.storage/auth": store("auth", {"users": [owner], "credentials": [credential],
                                               "refresh_tokens": []}),
        "data/.storage/auth_provider.homeassistant": store(
            "auth_provider.homeassistant", {"users": [{"username": username, "password": password_hash}]}
        ),
        "data/.storage/onboarding": store("onboarding", {"done": ["user", "core_config", "integration"]}, 4),
    }, compress=True)
    metadata = {"version": 2, "slug": uuid4().hex[:8], "type": "full", "name": "Synthetic acceptance home",
                "date": datetime.now(UTC).isoformat(), "compressed": True, "protected": False,
                "addons": [], "folders": [], "repositories": [], "homeassistant": {"version": core_version}}
    return archive({"./backup.json": json.dumps(metadata).encode(), "homeassistant.tar.gz": inner})


def docker(*args):
    return subprocess.run(["docker", *args], check=True, text=True, capture_output=True).stdout.strip()


def wait_for(description, seconds, probe):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = probe()
            if result:
                return result
        except (requests.RequestException, subprocess.CalledProcessError, ValueError):
            pass
        time.sleep(2)
    raise TimeoutError(description)


def main():
    name, core_version, source_commit = sys.argv[1:]
    assert name.startswith("ham-acceptance-")
    binding = docker("port", name, "80/tcp")
    assert binding.startswith("127.0.0.1:")
    origin = "http://" + binding
    username = "acceptance-owner"
    password = secrets.token_urlsafe(32)
    marker = "Restore-" + uuid4().hex
    data = synthetic_backup(core_version, username, password, marker)
    session = requests.Session()
    session.trust_env = False

    def ready():
        response = session.get(origin + "/supervisor-api/backups/restore/pending", timeout=4)
        return response.status_code == 200 and response.json()["result"] == "ok"

    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium"))
        wait_for("First-start backup route did not become ready", 1200, ready)
        page = browser.new_page(viewport={"width": 390, "height": 844}, locale="en-US")
        page.goto(origin, wait_until="domcontentloaded", timeout=20000)
        picker = page.locator("landing-page-restore input[type=file]")
        picker.wait_for(state="attached", timeout=15000)
        picker.set_input_files({"name": "synthetic.tar", "mimeType": "application/x-tar", "buffer": data})
        with page.expect_response(lambda response: response.url.endswith("/restore/full/when_ready")) as queued:
            page.get_by_role("button", name="Continue", exact=True).click(timeout=20000)
        assert queued.value.ok and queued.value.json()["data"]["state"] == "queued"
        browser.close()
    print("Synthetic backup queued from the phone layout. Browser closed.", flush=True)

    def completed():
        result = docker("exec", name, "cat", "/var/lib/ha-material/supervisor/pending_restore.json")
        record = json.loads(result)
        if record["state"] == "failed":
            raise RuntimeError("Supervisor recorded a failed restore")
        return record["state"] == "done"

    wait_for("Supervisor did not complete the queued restore", 2100, completed)
    wait_for("Restored Core API did not require authentication", 240,
             lambda: session.get(origin + "/api/", timeout=4).status_code == 401)
    client = origin + "/"
    flow = session.post(origin + "/auth/login_flow", json={
        "client_id": client, "redirect_uri": origin + "/auth_callback",
        "handler": ["homeassistant", None]}, timeout=15)
    flow.raise_for_status()
    grant = session.post(origin + "/auth/login_flow/" + flow.json()["flow_id"],
                         json={"client_id": client, "username": username, "password": password}, timeout=15)
    grant.raise_for_status()
    assert grant.json()["type"] == "create_entry"
    token = session.post(origin + "/auth/token", data={"grant_type": "authorization_code",
                         "code": grant.json()["result"], "client_id": client}, timeout=15)
    token.raise_for_status()
    config = session.get(origin + "/api/config", headers={
        "Authorization": "Bearer " + token.json()["access_token"]}, timeout=15)
    config.raise_for_status()
    assert config.json()["location_name"] == marker
    for container in ["homeassistant", "hassio_supervisor"]:
        image = docker("exec", name, "docker", "inspect", "-f", "{{.Image}}", container)
        revision = docker("exec", name, "docker", "image", "inspect", "-f",
                          '{{index .Config.Labels "org.opencontainers.image.revision"}}', image)
        assert revision == source_commit, f"{container} source revision mismatch"
    print("Unattended restore completed. Synthetic owner signed in and read its restored home name.")


if __name__ == "__main__":
    main()
