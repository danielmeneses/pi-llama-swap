/**
 * Pi provider registration and model list refresh for llama-swap.
 */

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

import { buildModelLimits, resolveContextWindow, resolveMaxTokens } from "./context.js";
import { fetchModels, LlamaSwapClientError } from "./client.js";
import { buildBaseUrl } from "./url.js";
import type { LlamaSwapConfig, OpenAIModelEntry, RefreshResult } from "./types.js";

export const PROVIDER_ID = "llama-swap";

/**
 * Placeholder apiKey so pi lists models when llama-swap has no apiKeys.
 * OpenAI client may send `Authorization: Bearer <this>`; most open local proxies ignore it.
 */
export const NO_AUTH_API_KEY_PLACEHOLDER = "local-no-auth";

/** Whether a successful provider registration has occurred this session. */
let hasRegisteredProvider = false;

/**
 * Maps OpenAI model entries to pi provider model definitions.
 * @param entries - Models from GET /v1/models.
 * @param contextByModel - Resolved context window per model id.
 * @param maxTokensByModel - Resolved max output tokens per model id.
 * @returns Pi-compatible model configs.
 */
export function mapOpenAIModelsToPi(
	entries: OpenAIModelEntry[],
	contextByModel: Map<string, number>,
	maxTokensByModel: Map<string, number>,
): ProviderModelConfig[] {
	return entries.map((model) => {
		const contextWindow = resolveContextWindow(model.id, contextByModel);
		const maxTokens = resolveMaxTokens(model.id, maxTokensByModel, contextWindow);
		const name = typeof model.name === "string" && model.name.length > 0 ? model.name : model.id;

		return {
			id: model.id,
			name,
			reasoning: false,
			input: ["text"] as ("text" | "image")[],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow,
			maxTokens,
		};
	});
}

/**
 * Registers the llama-swap provider with the given models.
 * @param pi - Pi extension API.
 * @param config - Connection settings.
 * @param models - Model list (may be empty).
 */
export function registerLlamaSwapProvider(
	pi: ExtensionAPI,
	config: LlamaSwapConfig,
	models: ProviderModelConfig[],
): void {
	const baseUrl = buildBaseUrl(config);
	const hasKey = Boolean(config.apiKey?.trim());

	const providerConfig = {
		name: "Llama Swap",
		baseUrl,
		api: "openai-completions" as const,
		models,
		...(hasKey
			? { apiKey: config.apiKey, authHeader: true }
			: models.length > 0
				? { apiKey: NO_AUTH_API_KEY_PLACEHOLDER }
				: {}),
	};

	pi.registerProvider(PROVIDER_ID, providerConfig);
	hasRegisteredProvider = true;
}

/**
 * Fetches models, then replaces the provider only after a successful fetch.
 * On failure after a prior success, leaves the previous registration untouched.
 * @param pi - Pi extension API.
 * @param config - Effective connection settings.
 * @param options - `isInitial`: first load; may register empty provider on failure.
 * @returns Refresh outcome with base URL and model count.
 */
export async function refreshProvider(
	pi: ExtensionAPI,
	config: LlamaSwapConfig,
	options?: { isInitial?: boolean },
): Promise<RefreshResult> {
	const baseUrl = buildBaseUrl(config);

	try {
		const entries = await fetchModels(baseUrl, config.apiKey);
		const { contextByModel, maxTokensByModel } = await buildModelLimits(entries, config, config.contextOverrides);
		const models = mapOpenAIModelsToPi(entries, contextByModel, maxTokensByModel);

		if (hasRegisteredProvider) {
			pi.unregisterProvider(PROVIDER_ID);
		}
		registerLlamaSwapProvider(pi, config, models);

		return { baseUrl, modelCount: models.length };
	} catch (err) {
		const message = err instanceof LlamaSwapClientError ? err.message : err instanceof Error ? err.message : String(err);

		if (options?.isInitial) {
			registerLlamaSwapProvider(pi, config, []);
			return { baseUrl, modelCount: 0, error: message };
		}

		return { baseUrl, modelCount: 0, error: message };
	}
}
