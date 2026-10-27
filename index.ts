/**
 * Pi extension entry: llama-swap provider with dynamic model discovery.
 *
 * Usage: pi -e /path/to/pi-llama-swap
 *
 * Config (optional): ~/.pi/agent/pi-llama-swap.json overrides defaults.
 * Top-level fields configure the default server (`llama-swap`); a
 * `servers` array adds more llama-swap instances as `llama-swap-<name>`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadConfig, saveContextOverride } from "./lib/config.js";
import { providerIdFor, refreshProvider, PROVIDER_ID } from "./lib/provider.js";
import type { LlamaSwapConfig } from "./lib/types.js";

interface ServerTarget {
	providerId: string;
	config: LlamaSwapConfig;
}

/** All configured servers: default first, then named servers. */
function serverTargets(config: Awaited<ReturnType<typeof loadConfig>>): ServerTarget[] {
	return [
		{ providerId: PROVIDER_ID, config: config.defaultServer },
		...config.servers.map((server) => ({ providerId: providerIdFor(server.name), config: server })),
	];
}

/**
 * Pi extension factory (async for model discovery before startup).
 * @param pi - Extension API instance.
 */
export default async function llamaSwapExtension(pi: ExtensionAPI): Promise<void> {
	const initial = await loadConfig();

	for (const target of serverTargets(initial)) {
		const result = await refreshProvider(pi, target.providerId, target.config, { isInitial: true });
		if (result.error) {
			console.warn(`[llama-swap] ${target.providerId}: ${result.error}`);
		}
	}

	pi.registerCommand("llama-swap-set-context-length", {
		description: "Set or clear context window override for the current model",
		handler: async (args, ctx) => {
			const model = ctx.model;
			if (!model || !model.provider.startsWith(`${PROVIDER_ID}-`) && model.provider !== PROVIDER_ID) {
				ctx.ui.notify("No llama-swap model selected. Use /model first.", "warning");
				return;
			}

			const trimmed = args.trim();

			if (trimmed === "auto") {
				const ok = await ctx.ui.confirm(
					"Clear context override",
					`Use auto-detected context window for "${model.id}"?`,
				);
				if (!ok) return;

				await saveContextOverride(model.id, undefined, serverNameOf(model.provider));
				await refreshAll(pi);
				ctx.ui.notify(`Context override removed for ${model.id}. Now auto-detected.`);
				return;
			}

			const ctxSize = Number(trimmed);
			if (!Number.isInteger(ctxSize) || ctxSize < 1) {
				ctx.ui.notify(
					"Invalid context size. Use a positive integer or \"auto\".\nExample: /llama-swap-set-context-length 32768",
					"error",
				);
				return;
			}

			const ok = await ctx.ui.confirm(
				"Set context override",
				`Set context window to ${ctxSize} for "${model.id}"?`,
			);
			if (!ok) return;

			await saveContextOverride(model.id, ctxSize, serverNameOf(model.provider));
			await refreshAll(pi);
			ctx.ui.notify(`Context window for ${model.id} set to ${ctxSize}.`);
		},
	});
}

/** Server name for a provider id (undefined for the default provider). */
function serverNameOf(providerId: string): string | undefined {
	return providerId === PROVIDER_ID ? undefined : providerId.slice(PROVIDER_ID.length + 1);
}

/** Reload config and refresh every server (after a config write). */
async function refreshAll(pi: ExtensionAPI): Promise<void> {
	// ponytail: refresh all servers; writes are rare and servers are few
	const config = await loadConfig();
	for (const target of serverTargets(config)) {
		await refreshProvider(pi, target.providerId, target.config);
	}
}
