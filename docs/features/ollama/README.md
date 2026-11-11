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
| `ollama_suite/pull` | 2 | Download a model. A subscription: events carry `state` (`progress`, `done`, `error`), the server's status text, digest, and completed and total bytes. Unsubscribing cancels it. One download per server at a time (`busy` otherwise) |
| `ollama_suite/delete` | 2 | Remove a model that the server lists; answers the size it freed |
| `ollama_suite/unload` | 2 | Unload a loaded model by asking the server to keep it for zero seconds. The page offers it on each loaded model, after a confirmation that says what it does |
| `ollama_suite/used_by` | 3 | The conversation agents and AI tasks (subentries of the stock `ollama` entry) whose stored model is the given one; a name without a tag matches `latest`. Read only |
| `ollama_suite/chat` | 3 | A subscription for one test message to one model. Events carry `state` (`text`, `done`, `error`); `done` carries `truncated` and, only when the server reported real counts, `tokens_per_second`. One chat per connection (`busy` otherwise); unsubscribing cancels it. The model gets no tools and nothing is stored |

Errors are plain codes: `not_found`, `not_loaded`, `unauthorized`, `timeout`, `cannot_connect`, `server_error`, `bad_request`, `busy`, `unknown`.

## Security

- **Address validation.** Addresses are validated by the existing config flow. The suite additionally shows only `http` and `https` addresses, with any user info, query and fragment removed; anything else is shown as no address. Credentials never travel in the address. An API key stays in the config entry and is sent only as a bearer header by the existing client.
- **Own address only.** The suite never builds a request to a host that is not a configured entry. A command names an entry id, never a URL.
- **Proxying.** Requests are made by the instance. The browser cannot be pointed at another origin through this feature.
- **Administrators only.** Every command requires an administrator. Management commands (pull, delete) additionally require an explicit confirmation in the interface.
- **Limits.** Each request has a 10 second timeout. Answers are bounded: at most 500 models, 100 running models, 20,000 characters per text field, and only small scalar technical values (large arrays such as tokenizer vocabularies are dropped). The client library parses a whole answer before it is shaped, so the bounds limit what is sent to the browser, not what the server may send to Home Assistant.
- **Model names.** A name to download must fully match `name`, `name:tag` or `namespace/name[:tag]` (lowercase name, no host part, so no other registry). Delete and unload accept only a model the server itself lists.
- **Downloads.** A download stops when the browser unsubscribes or the WebSocket closes, and after 120 seconds with no message from the server. Progress events are sent at most four times a second unless the status text changes.
- **Streaming chat.** A prompt is at most 4,000 characters and a reply at most 20,000 (a longer reply is cut and marked). A reply waits up to 120 seconds for its first text, 30 seconds between pieces and 300 seconds overall. It stops when the browser unsubscribes or the WebSocket closes. The reply is shown as plain text, never as markup.
- **No content logging.** Error handling logs no request or response bodies.

## Privacy statements shown to the person

The page opens with this statement: only the Ollama server addresses you entered are contacted; nothing is sent to the cloud or anywhere else unless you ask; prompts and answers are not logged. The empty state explains that Home Assistant only contacts the address entered when adding a server.

## Slices

1. **Read only (built).** Servers, models, running models and model details; empty state that leads to the normal add-integration flow; labelled placeholders for what comes next.
2. **Manage models (built).** Download with progress and cancel, remove with confirmation naming the space it frees. Speed and time left are derived from the bytes the server reports for the part being fetched, shown only when they can be computed.
3. **Model detail and test chat (built, unrun).** The detail panel shows size, family, parameters, quantisation, context length, modified time, a shortened digest with copy, and which Home Assistant agents and tasks use the model. A "Try this model" panel sends one message at a time to the chosen model and streams the reply, with Stop and Clear. Nothing is kept and the model cannot reach the home.
4. **Helpers.** Small local helpers, such as summarising text the person pastes, each clearly labelled and sending nothing elsewhere.

## Verification status

The integration was seen loading at start in a running copy on 10 November 2026 without errors; no command was driven against it.

Slice 3 adds Python tests for `chat` (result before the first event, streamed text and real speed, no speed without counts, cancel frees the slot, oversize and blank prompts refused, bounded reply, plain error codes, administrator only) and `used_by`. They compile but have not been run, and no Ollama server has been contacted. The model name stored in a subentry is assumed to be the `model` key of its data, read from the stock integration's source. The page has not been seen in a browser.

Slice 2 adds Python tests with a mocked client for name validation, progress shaping, cancellation and the one-download-at-a-time rule. The pure parts and the download loop were exercised for real in a throwaway container; the WebSocket tests have not been run with pytest and no Ollama server has been contacted. Slice 1 has Python tests with a mocked client for the shaping helpers and the WebSocket commands, and a frontend page that passes lint and type checks. No Ollama server has been contacted and the page has not been seen in a browser.
