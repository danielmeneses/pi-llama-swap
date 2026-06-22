/**
 * Pi extension entry: llama-swap provider with dynamic model discovery.
 *
 * Usage: pi -e /path/to/pi-llama-swap
 *
 * Config (optional): ~/.pi/agent/pi-llama-swap.json overrides defaults.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadConfig, saveContextOverride } from "./lib/config.js";
import { refreshProvider, PROVIDER_ID } from "./lib/provider.js";

/**
 * Pi extension factory (async for model discovery before startup).
 * @param pi - Extension API instance.
 */
export default async function llamaSwapExtension(pi: ExtensionAPI): Promise<void> {
	const config = await loadConfig();
	const result = await refreshProvider(pi, config, { isInitial: true });

	if (result.error) {
		console.warn(`[llama-swap] ${result.error}`);
	}

	pi.registerCommand("llama-swap-set-context-length", {
		description: "Set or clear context window override for the current model",
		handler: async (args, ctx) => {
			const model = ctx.model;
			if (!model || model.provider !== PROVIDER_ID) {
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

				await saveContextOverride(model.id, undefined);
				// ponyail: reload config + refresh to pick up removed override
				const config = await loadConfig();
				await refreshProvider(pi, config);
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

			await saveContextOverride(model.id, ctxSize);
			// ponyail: reload config + refresh to pick up new override
			const config = await loadConfig();
			await refreshProvider(pi, config);
			ctx.ui.notify(`Context window for ${model.id} set to ${ctxSize}.`);
		},
	});
}
