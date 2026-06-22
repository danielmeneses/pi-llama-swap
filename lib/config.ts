/**
 * Load llama-swap extension configuration from ~/.pi/agent/pi-llama-swap.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { defaultConfig, mergeConfig, parsePortArg, parseUrlArg } from "./url.js";
import type { LlamaSwapConfig } from "./types.js";

const CONFIG_FILENAME = "pi-llama-swap.json";

/**
 * Path to the config file under `~/.pi/agent/`.
 * @returns Absolute path to pi-llama-swap.json.
 */
export function configPath(): string {
	return join(homedir(), ".pi", "agent", CONFIG_FILENAME);
}

/**
 * Reads and parses the config file if it exists.
 * @param path - File path to read.
 * @returns Parsed config or null when missing.
 */
async function readConfigFile(path: string): Promise<Partial<LlamaSwapConfig> | null> {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw) as Partial<LlamaSwapConfig>;
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
 * Loads config: defaults, optional ~/.pi/agent/pi-llama-swap.json, then env overrides.
 * @returns Effective connection settings.
 */
export async function loadConfig(): Promise<LlamaSwapConfig> {
	let config = defaultConfig();

	const file = await readConfigFile(configPath());
	if (file) {
		config = mergeConfig(config, normalizeRaw(file));
	}

	return applyEnvOverrides(config);
}

/**
 * Updates the context-overrides map for a model in the config file.
 * @param model - Model id to set or clear.
 * @param ctxSize - Context size in tokens, or undefined to remove the override.
 */
export async function saveContextOverride(model: string, ctxSize: number | undefined): Promise<void> {
	const path = configPath();
	let current: Record<string, unknown> = {};
	try {
		const raw = await readFile(path, "utf8");
		current = JSON.parse(raw) as Record<string, unknown>;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}

	const overrides = (current.contextOverrides as Record<string, number> | undefined) ?? {};
	if (ctxSize === undefined) {
		delete overrides[model];
	} else {
		overrides[model] = ctxSize;
	}

	current.contextOverrides = overrides;
	await writeFile(path, JSON.stringify(current, null, 2), "utf8");
}
