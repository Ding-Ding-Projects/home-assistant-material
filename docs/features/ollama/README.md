# Local Ollama suite

A settings page, at `/config/ollama`, that manages the person's own Ollama servers and models and, in later slices, offers local chat and helpers. It is administrator only.

## Principles

- The page talks only to the Ollama server addresses the person already entered. Nothing else is contacted and there is no cloud service.
- Nothing is sent anywhere unless the person asks for it.
- Prompts and answers are not logged, stored or sent to diagnostics.
- The browser never talks to an Ollama server. Every request goes through the Home Assistant instance over its WebSocket connection.

## What it reuses

The `ollama` integration (`homeassistant/components/ollama`) is unchanged. The suite reuses:

- **Server addresses.** Each `ollama` config entry holds its address (`url`, from the entry data or options). The suite stores no address of its own, so adding, editing and removing servers keeps going through the normal add-integration flow and its connection checks.
- **The client.** A loaded entry keeps an `ollama.AsyncClient` in `runtime_data`, already configured with the address, optional bearer key and the instance's TLS context. The suite calls `list`, `ps` and `show` on that client.
- **Setup state.** A server whose entry is not loaded is shown as not set up and is not contacted.

## Server-side commands

All commands are WebSocket commands that require an administrator.

| Command | Slice | Answer |
| --- | --- | --- |
| `ollama_suite/servers` | 1 | Entries: id, title, address with credentials removed, entry state, disabled, reachable, server version, plain error code |
| `ollama_suite/models` | 1 | Models of one server: name, size, family, parameter size, quantisation, modified time, digest |
| `ollama_suite/running` | 1 | Models loaded in memory: size, graphics memory, context length, unload time, totals |
| `ollama_suite/show` | 1 | Details of one model: capabilities, default settings, template, licence, small technical values |
| `ollama_suite/pull` | 2 | Download a model, with streamed progress events and cancel |
| `ollama_suite/delete` | 2 | Remove a model, after confirmation in the interface |
| `ollama_suite/chat` | 3 | Streamed chat with a model on a chosen server |

Errors are plain codes: `not_found`, `not_loaded`, `unauthorized`, `timeout`, `cannot_connect`, `server_error`, `bad_request`, `unknown`.

## Security

- **Address validation.** Addresses are validated by the existing config flow. The suite additionally shows only `http` and `https` addresses, with any user info, query and fragment removed; anything else is shown as no address. Credentials never travel in the address. An API key stays in the config entry and is sent only as a bearer header by the existing client.
- **Own address only.** The suite never builds a request to a host that is not a configured entry. A command names an entry id, never a URL.
- **Proxying.** Requests are made by the instance. The browser cannot be pointed at another origin through this feature.
- **Administrators only.** Every command requires an administrator. Management commands (pull, delete) additionally require an explicit confirmation in the interface.
- **Limits.** Each request has a 10 second timeout. Answers are bounded: at most 500 models, 100 running models, 20,000 characters per text field, and only small scalar technical values (large arrays such as tokenizer vocabularies are dropped). The client library parses a whole answer before it is shaped, so the bounds limit what is sent to the browser, not what the server may send to Home Assistant.
- **Streaming (later slices).** Pull and chat stream in bounded chunks, can be cancelled, stop when the WebSocket closes, and enforce an overall time limit and maximum prompt size.
- **No content logging.** Error handling logs no request or response bodies.

## Privacy statements shown to the person

The page opens with this statement: only the Ollama server addresses you entered are contacted; nothing is sent to the cloud or anywhere else unless you ask; prompts and answers are not logged. The empty state explains that Home Assistant only contacts the address entered when adding a server.

## Slices

1. **Read only (built).** Servers, models, running models and model details; empty state that leads to the normal add-integration flow; labelled placeholders for what comes next.
2. **Manage models.** Download with progress and cancel, remove with confirmation, disk space notes.
3. **Chat.** A local chat panel with streaming, model choice, stop, and no history kept unless the person saves it.
4. **Helpers.** Small local helpers, such as summarising text the person pastes, each clearly labelled and sending nothing elsewhere.

## Verification status

Slice 1 has Python tests with a mocked client for the shaping helpers and the WebSocket commands, and a frontend page that passes lint and type checks. No Ollama server has been contacted and the page has not been seen in a browser.
