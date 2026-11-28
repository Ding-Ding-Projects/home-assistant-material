"""Run an isolated Core and its Supervisor-only entity viewer."""

import asyncio
import contextlib
import os
from pathlib import Path
import re
import signal
import sys

from aiohttp import ClientError, ClientSession, ClientTimeout, web

ASSETS = Path(__file__).parent
DATA = Path("/data/material")
CORE = "http://127.0.0.1:8123"
CLIENT_ID = CORE + "/"
SUPERVISOR = "172.30.32.2"


@web.middleware
async def ingress_only(request, handler):
    # Authenticate the TCP peer, never a caller-supplied proxy header.
    if request.remote != SUPERVISOR:
        raise web.HTTPForbidden()
    if request.method == "POST" and request.headers.get("X-Material-Request") != "panel":
        raise web.HTTPForbidden()
    response = await handler(request)
    response.headers.update({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    })
    return response


async def serve():
    os.umask(0o077)
    DATA.mkdir(parents=True, exist_ok=True)
    config = DATA / "configuration.yaml"
    if not config.exists():
        with config.open("x", encoding="utf-8") as file:
            file.write("default_config:\nhttp:\n  server_host: 127.0.0.1\n")
    # The nested instance must never inherit an outer Supervisor credential.
    env = {k: v for k, v in os.environ.items() if k not in {
        "SUPERVISOR", "SUPERVISOR_TOKEN", "HASSIO_TOKEN", "HASSIO",
    }}
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-P", "-m", "homeassistant", "--config", str(DATA), env=env,
    )
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    try:
        async with ClientSession(timeout=ClientTimeout(total=15), trust_env=False) as session:
            app = web.Application(middlewares=[ingress_only], client_max_size=16384)

            async def asset(request):
                return web.FileResponse(ASSETS / ("panel.js" if request.path == "/panel.js" else "panel.html"))

            async def api(request):
                action = request.match_info["action"]
                headers = {}
                payload = {}
                method = request.method
                if method == "POST":
                    try:
                        body = await request.json()
                    except ValueError:
                        raise web.HTTPBadRequest() from None
                    if not isinstance(body, dict):
                        raise web.HTTPBadRequest()
                    if action == "register":
                        path = "/api/onboarding/users"
                        payload["json"] = {k: body.get(k) for k in ("name", "username", "password")}
                        payload["json"].update(client_id=CLIENT_ID, language="en")
                    elif action == "login":
                        path = "/auth/login_flow"
                        payload["json"] = {"client_id": CLIENT_ID, "redirect_uri": CLIENT_ID, "handler": ["homeassistant", None]}
                    elif action == "authenticate" and isinstance(body.get("flow"), str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", body["flow"]):
                        path = "/auth/login_flow/" + body["flow"]
                        payload["json"] = {k: body[k] for k in ("username", "password", "code") if k in body}
                        payload["json"]["client_id"] = CLIENT_ID
                    elif action == "exchange":
                        path = "/auth/token"
                        payload["data"] = {"client_id": CLIENT_ID, "grant_type": "authorization_code", "code": str(body.get("code", ""))}
                    else:
                        raise web.HTTPNotFound()
                elif action == "setup":
                    path = "/api/onboarding"
                elif action == "states":
                    path = "/api/states"
                    headers["Authorization"] = request.headers.get("X-Material-Authorization", "")
                else:
                    raise web.HTTPNotFound()
                try:
                    async with session.request(method, CORE + path, headers=headers, allow_redirects=False, **payload) as response:
                        if response.status >= 300:
                            return web.json_response({"status": response.status}, status=response.status)
                        data = await response.json()
                        if action == "exchange":
                            data = {"access_token": data["access_token"]}
                        elif action == "states":
                            data = [{"entity_id": s["entity_id"], "state": s["state"]} for s in data]
                        return web.json_response(data)
                except (ClientError, TimeoutError):
                    raise web.HTTPServiceUnavailable() from None

            app.router.add_get("/", asset)
            app.router.add_get("/panel.js", asset)
            app.router.add_get("/api/{action}", api)
            app.router.add_post("/api/{action}", api)
            runner = web.AppRunner(app, access_log=None)
            await runner.setup()
            try:
                await web.TCPSite(runner, "0.0.0.0", 8099).start()
                tasks = [asyncio.create_task(process.wait()), asyncio.create_task(stop.wait())]
                _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            finally:
                await runner.cleanup()
    finally:
        if process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                process.terminate()
            await process.wait()
    return process.returncode


if __name__ == "__main__":
    sys.exit(asyncio.run(serve()))
