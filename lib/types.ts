/**
 * Shared types for the pi llama-swap extension.
 */

/** Persisted connection settings for llama-swap. */
export interface LlamaSwapConfig {
	/** Origin without path, e.g. `http://127.0.0.1`. */
	origin: string;
	/** TCP port (1–65535). */
	port: number;
	/** OpenAI API path prefix (default `/v1`). */
	basePath?: string;
	/** Optional API key sent as Bearer when set. */
	apiKey?: string;
	/** Per-model context window overrides (model id -> tokens). */
	contextOverrides?: Record<string, number>;
}

/** One entry of the multi-server `servers` config array. */
export interface ServerEntry extends LlamaSwapConfig {
	/** Short unique name; provider id becomes `llama-swap-<name>`. */
	name: string;
}

/**
 * Config file shape as persisted in `~/.pi/agent/pi-llama-swap.json`.
 * Top-level fields configure the DEFAULT server, which keeps the legacy
 * provider id `llama-swap`. `servers` adds further llama-swap instances
 * registered as `llama-swap-<name>`.
 */
export interface LlamaSwapFileConfig extends LlamaSwapConfig {
	servers?: ServerEntry[];
}

/** Resolved runtime view: default server plus named extra servers. */
export interface ResolvedConfig {
	/** Default server (provider id `llama-swap`). */
	defaultServer: LlamaSwapConfig;
	/** Extra named servers (provider ids `llama-swap-<name>`). */
	servers: ServerEntry[];
}

/** OpenAI-compatible model entry from GET /v1/models. */
export interface OpenAIModelEntry {
	id: string;
	name?: string;
	[key: string]: unknown;
}

/** OpenAI-compatible models list response. */
export interface OpenAIModelsListResponse {
	object?: string;
	data: OpenAIModelEntry[];
}

/** Result of a provider refresh attempt for one server. */
export interface RefreshResult {
	providerId: string;
	baseUrl: string;
	modelCount: number;
	error?: string;
}
