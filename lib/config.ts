/**
 * Load llama-swap extension configuration from ~/.pi/agent/pi-llama-swap.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { defaultConfig, mergeConfig, parsePortArg, parseUrlArg } from "./url.js";
import { providerIdOf } from "./provider.js";
import type { LlamaSwapConfig } from "./types.js";

const CONFIG_FILENAME = "pi-llama-swap.json";

/**
 * Directory holding the coding-agent config.
 * Honors `PI_CODING_AGENT_DIR` when set, else defaults to `~/.pi/agent`.
 * @returns Absolute path to the agent directory.
 */
export function agentDir(): string {
	const override = process.env.PI_CODING_AGENT_DIR?.trim();
	if (override) {
		return override;
	}
	return join(homedir(), ".pi", "agent");
}

/**
 * Path to the config file under the agent directory.
 * @returns Absolute path to pi-llama-swap.json.
 */
export function configPath(): string {
	return join(agentDir(), CONFIG_FILENAME);
}

/**
 * Reads and parses the config file if it exists.
 * @param path - File path to read.
 * @returns Parsed instances (single object normalized to a one-element array), or null when missing.
 */
async function readConfigFile(path: string): Promise<Partial<LlamaSwapConfig>[] | null> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw) as Partial<LlamaSwapConfig> | Partial<LlamaSwapConfig>[];
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw err;
	}
}

/**
 * Validates and normalizes raw config fields from disk.
 * @param raw - Partial config from JSON.
 * @returns Normalized config fragment.
 */
function normalizeRaw(raw: Partial<LlamaSwapConfig>): Partial<LlamaSwapConfig> {
	const out: Partial<LlamaSwapConfig> = {};
	if (typeof raw.name === "string" && raw.name) {
		out.name = raw.name;
	}
	if (typeof raw.origin === "string" && raw.origin.trim()) {
		out.origin = raw.origin.trim();
	}
	if (typeof raw.port === "number" && Number.isInteger(raw.port) && raw.port >= 1 && raw.port <= 65535) {
		out.port = raw.port;
	}
	if (typeof raw.basePath === "string" && raw.basePath.trim()) {
		out.basePath = raw.basePath.trim();
	}
	if (typeof raw.apiKey === "string" && raw.apiKey.length > 0) {
		out.apiKey = raw.apiKey;
	}
	if (raw.contextOverrides && typeof raw.contextOverrides === "object") {
		const overrides: Record<string, number> = {};
		for (const [model, size] of Object.entries(raw.contextOverrides)) {
			if (typeof size === "number" && Number.isInteger(size) && size > 0) {
				overrides[model] = size;
			}
		}
		if (Object.keys(overrides).length > 0) {
			out.contextOverrides = overrides;
		}
	}
	return out;
}

/**
 * Applies environment variable overrides (highest precedence).
 * @param config - Config after file merge.
 * @returns Config with env overrides applied.
 */
export function applyEnvOverrides(config: LlamaSwapConfig): LlamaSwapConfig {
	let result = { ...config };

	const urlEnv = process.env.LLAMA_SWAP_URL?.trim();
	if (urlEnv) {
		const parsed = parseUrlArg(urlEnv);
		result = mergeConfig(result, {
			origin: parsed.origin,
			...(parsed.port !== undefined ? { port: parsed.port } : {}),
			...(parsed.basePath !== undefined ? { basePath: parsed.basePath } : {}),
		});
	}

	const portEnv = process.env.LLAMA_SWAP_PORT?.trim();
	if (portEnv) {
		result = mergeConfig(result, { port: parsePortArg(portEnv) });
	}

	const keyEnv = process.env.LLAMA_SWAP_API_KEY?.trim();
	if (keyEnv) {
		result = mergeConfig(result, { apiKey: keyEnv });
	}

	return result;
}

/**
 * Loads configs: defaults, optional ~/.pi/agent/pi-llama-swap.json (object or array), then env overrides.
 * Env overrides apply when exactly one endpoint is configured.
 * @returns One config per configured endpoint; `name` is the provider id, defaulting to "llama-swap".
 * @throws {Error} On non-object entries or duplicate provider ids.
 */
export async function loadConfigs(): Promise<LlamaSwapConfig[]> {
	const entries = (await readConfigFile(configPath())) ?? [defaultConfig()];

	const configs: LlamaSwapConfig[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		// JSON.parse is unchecked, so guard to keep the documented startup error for malformed entries
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			throw new Error(`llama-swap config: instance ${i + 1} must be an object`);
		}
		const config = mergeConfig(defaultConfig(), normalizeRaw(entry));
		const providerId = providerIdOf(config);
		if (seen.has(providerId)) {
			throw new Error(`llama-swap config: duplicate provider id "${providerId}"`);
		}
		seen.add(providerId);
		configs.push(config);
	}

	if (configs.length === 1) {
		configs[0] = applyEnvOverrides(configs[0]);
	}

	return configs;
}

/**
 * Sets or clears a model's context override on a raw config entry.
 * @param obj - Entry object from the config file.
 * @param model - Model id to set or clear.
 * @param ctxSize - Context size in tokens, or undefined to remove the override.
 */
function setEntryOverride(obj: Record<string, unknown>, model: string, ctxSize: number | undefined): void {
	const overrides = (obj.contextOverrides as Record<string, number> | undefined) ?? {};
	if (ctxSize === undefined) {
		delete overrides[model];
	} else {
		overrides[model] = ctxSize;
	}
	obj.contextOverrides = overrides;
}

/**
 * Updates the context-overrides map for a model in the config file.
 * @param providerId - Provider id of the instance whose overrides to update.
 * @param model - Model id to set or clear.
 * @param ctxSize - Context size in tokens, or undefined to remove the override.
 */
export async function saveContextOverride(
	providerId: string,
	model: string,
	ctxSize: number | undefined,
): Promise<void> {
	const path = configPath();
	let current: unknown;
	try {
		const raw = await readFile(path, "utf8");
		current = JSON.parse(raw);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		current = {};
	}

	if (Array.isArray(current)) {
		const entry = current.find((e) => {
			if (typeof e !== "object" || e === null || Array.isArray(e)) {
				return false;
			}
			return providerIdOf(e as Partial<LlamaSwapConfig>) === providerId;
		});
		if (!entry) {
			throw new Error(`llama-swap config: no instance with provider id "${providerId}"`);
		}
		setEntryOverride(entry as Record<string, unknown>, model, ctxSize);
		await writeFile(path, JSON.stringify(current, null, 2), "utf8");
		return;
	}

	if (typeof current !== "object" || current === null) {
		throw new Error("llama-swap config: top level must be an object or an array of instances");
	}

	setEntryOverride(current as Record<string, unknown>, model, ctxSize);
	await writeFile(path, JSON.stringify(current, null, 2), "utf8");
}
