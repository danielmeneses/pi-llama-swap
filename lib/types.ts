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

/** Result of a provider refresh attempt. */
export interface RefreshResult {
	baseUrl: string;
	modelCount: number;
	error?: string;
}
