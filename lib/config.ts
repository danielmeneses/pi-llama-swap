/**
 * Config file and env overrides for llama-swap.
 *
 * Precedence: process.env LLAMA_SWAP_URL / LLAMA_SWAP_PORT / LLAMA_SWAP_API_KEY
 * are applied over the file for the DEFAULT server, then the file wins for
 * everything not covered by env. Named servers in the `servers` array are
 * only affected by the file.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { defaultConfig, mergeConfig } from "./url.js";
import type { LlamaSwapConfig, LlamaSwapFileConfig, ResolvedConfig, ServerEntry } from "./types.js";

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

/** True when `name` is usable as a provider suffix (`llama-swap-<name>`). */
export function isValidServerName(name: string): boolean {
	return /^[a-z0-9][a-z0-9-]*$/.test(name) && name !== "default";
}

/**
 * Normalize the raw `servers` array: entries need a unique valid name;
 * everything else falls back to package defaults (never to the default
 * server's host, which would silently duplicate it).
 */
function normalizeServers(raw: ServerEntry[] | undefined): ServerEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: ServerEntry[] = [];
	const seen = new Set<string>();
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const name = typeof entry.name === "string" ? entry.name : "";
		if (!isValidServerName(name) || seen.has(name)) continue;
		seen.add(name);
		out.push({ ...(mergeConfig(defaultConfig(), { ...entry, name }) as ServerEntry) });
	}
	return out;
}

/** Load llama-swap connection settings (default server + named servers). */
export async function loadConfig(): Promise<ResolvedConfig> {
	let file: Partial<LlamaSwapFileConfig> = {};
	try {
		const path = configPath();
		const text = await readFile(path, "utf8");
		file = JSON.parse(text) as Partial<LlamaSwapFileConfig>;
	} catch {
		// Missing or invalid config: use defaults.
	}

	const merged = mergeConfig(defaultConfig(), file);
	const envUrl = process.env.LLAMA_SWAP_URL?.trim();
	const envPort = process.env.LLAMA_SWAP_PORT?.trim();
	const apiKey = process.env.LLAMA_SWAP_API_KEY?.trim() ?? merged.apiKey;

	const defaultServer: LlamaSwapConfig = {
		origin: envUrl ? new URL(envUrl).origin : merged.origin,
		port: envUrl ? Number(new URL(envUrl).port || merged.port) : (envPort ? Number(envPort) : merged.port),
		basePath: merged.basePath,
		apiKey,
		contextOverrides: merged.contextOverrides,
	};

	return { defaultServer, servers: normalizeServers(file.servers) };
}

/**
 * Merge context window override into the config file, preserving other keys.
 * `serverName` targets that server's `contextOverrides` inside its `servers`
 * entry; omit it for the DEFAULT server section at the top level.
 * Pass `undefined` as contextWindow to remove the override.
 */
export async function saveContextOverride(
	modelId: string,
	contextWindow: number | undefined,
	serverName?: string,
): Promise<void> {
	const path = configPath();
	let raw: Record<string, unknown> = {};
	try {
		raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
	} catch {
		// start from empty
	}

	let section: Record<string, unknown>;
	if (serverName) {
		const servers = Array.isArray(raw.servers) ? (raw.servers as Record<string, unknown>[]) : [];
		let entry = servers.find((s) => s && typeof s === "object" && s.name === serverName);
		if (!entry) {
			entry = { name: serverName };
			servers.push(entry);
		}
		raw.servers = servers;
		section = entry;
	} else {
		section = raw;
	}

	const overrides = { ...((section.contextOverrides as Record<string, number>) ?? {}) };
	if (contextWindow === undefined) {
		delete overrides[modelId];
	} else {
		overrides[modelId] = contextWindow;
	}
	section.contextOverrides = overrides;

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(raw, null, 2) + "\n", "utf8");
}
