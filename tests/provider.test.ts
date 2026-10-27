/**
 * Tests for provider.ts: provider ids per server.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PROVIDER_ID, providerIdFor } from "../lib/provider.js";

test("default server keeps legacy provider id", () => {
	assert.equal(providerIdFor(undefined), "llama-swap");
	assert.equal(PROVIDER_ID, "llama-swap");
});

test("named servers get llama-swap-<name>", () => {
	assert.equal(providerIdFor("box2"), "llama-swap-box2");
	assert.equal(providerIdFor("lan-a"), "llama-swap-lan-a");
});
