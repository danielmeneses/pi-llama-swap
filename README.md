# pi-llama-swap

Pi coding agent extension that registers a **llama-swap** provider and discovers models from a running [llama-swap](https://github.com/mostlygeek/llama-swap) instance.

## What it does

- Injects provider `llama-swap` with models from `GET /v1/models`
- Resolves per-model context from llama-swap APIs (`/v1/models`, `/running`) with 256K default — see [Context window](#context-window-per-model)
- Uses OpenAI Chat Completions API (`openai-completions`) for streaming
- Reads optional config from `~/.pi/agent/pi-llama-swap.json` to override defaults

## Requirements

- [pi](https://github.com/badlogic/pi-mono) coding agent (`@earendil-works/pi-coding-agent`)
- [llama-swap](https://github.com/mostlygeek/llama-swap) running and reachable
- Node.js 18+ (for `fetch`)

## Quick start

```bash
# Terminal 1: start llama-swap (example)
llama-swap --config ~/llama-swap/config.yaml --listen 127.0.0.1:8080

# Terminal 2: load extension
cd /path/to/pi-llama-swap
pi -e .
```

In pi: `/model` → pick `llama-swap/your-model-id`.

### Commands

| Command | Args | Description |
|---------|------|-------------|
| `/llama-swap-set-context-length` | `<number>` or `auto` | Override context window for the current model (`auto` removes override and uses auto-detection) |

Verify from CLI:

```bash
pi -e . --list-models | grep llama-swap
curl http://127.0.0.1:8080/v1/models
```

## Configuration

### Defaults

| Setting | Default |
|---------|---------|
| Origin | `http://127.0.0.1` |
| Port | `8080` |
| Base URL | `http://127.0.0.1:8080/v1` |

No config file needed when llama-swap runs on the defaults above.

### Config file

Create `~/.pi/agent/pi-llama-swap.json` to override defaults:

```json
{
  "origin": "http://127.0.0.1",
  "port": 8080,
  "apiKey": "optional-key",
  "contextOverrides": {
    "my-model": 32768
  }
}
```

| Field | Description |
|-------|-------------|
| `origin` | Scheme + host (e.g. `http://192.168.1.10`) |
| `port` | TCP port (1–65535) |
| `basePath` | API path prefix (default `/v1`; normalized to end with `/v1`) |
| `apiKey` | Bearer token when llama-swap uses `apiKeys` |
| `contextOverrides` | Per-model context overrides (model id → tokens). Use `/llama-swap-set-context-length` instead of editing manually. |

Load order: **defaults → `~/.pi/agent/pi-llama-swap.json` → environment variables**.

### Context window (per model)

Context size is auto-detected from llama-swap's `/v1/models` and `/running` endpoints at startup, with a default of **256K** when nothing reports a value. User overrides set via `/llama-swap-set-context-length` take precedence over all auto-detected values.

```bash
# Restrict permissions when storing API keys
chmod 600 ~/.pi/agent/pi-llama-swap.json
```

### Environment variables

Optional runtime overrides (highest precedence):

| Variable | Purpose |
|----------|---------|
| `LLAMA_SWAP_URL` | Origin URL (scheme + host, optional port/path) |
| `LLAMA_SWAP_PORT` | Port override |
| `LLAMA_SWAP_API_KEY` | API key override |

## Auth

If llama-swap uses `apiKeys` in its config, set `"apiKey"` in `pi-llama-swap.json` or `LLAMA_SWAP_API_KEY`.

Without a key, extension uses placeholder `local-no-auth` so models appear in `/model`. Pi may send `Authorization: Bearer local-no-auth`; most unsecured local installs ignore it.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| `Cannot reach llama-swap` | Start llama-swap; check `origin`/`port` in config file |
| HTTP 401 | Set `apiKey` in config or `LLAMA_SWAP_API_KEY` |
| 0 models | Ensure models in llama-swap config; `curl http://127.0.0.1:8080/v1/models` |
| Extension loads but chat fails | Confirm model id; first request may load model (slow) |
| Config ignored | File must be `~/.pi/agent/pi-llama-swap.json`; restart pi after edits |

## Project layout

```
pi-llama-swap/
├── index.ts          # Extension entry
├── lib/
│   ├── config.ts     # Load ~/.pi/agent/pi-llama-swap.json
│   ├── url.ts        # URL building
│   ├── client.ts     # GET /v1/models
│   ├── context.ts    # Context window from llama-swap APIs
│   ├── provider.ts   # registerProvider
│   └── types.ts
├── package.json
└── README.md
```

## License

MIT (see repository if published).
