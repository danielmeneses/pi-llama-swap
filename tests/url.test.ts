/**
 * Tests for url.ts: mergeConfig must preserve the named-server `name` field.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeConfig, buildBaseUrl, defaultConfig } from "../lib/url.js";
import type { ServerEntry } from "../lib/types.js";

test("mergeConfig preserves name from current when partial omits it", () => {
	const current: ServerEntry = { name: "box2", origin: "http://a", port: 8080, basePath: "/v1" };
	const merged = mergeConfig(current, { port: 9000 });
	assert.equal(merged.name, "box2");
	assert.equal(merged.port, 9000);
	assert.equal(merged.origin, "http://a");
});

test("mergeConfig takes name from partial over current", () => {
	const current = { name: "old", origin: "http://a", port: 1 };
	const merged = mergeConfig(current, { name: "new" });
	assert.equal(merged.name, "new");
});

test("mergeConfig on plain config stays nameless", () => {
	const merged = mergeConfig(defaultConfig(), { origin: "http://b", port: 1234 });
	assert.equal("name" in merged, false);
});

test("buildBaseUrl works for named server entry", () => {
	const entry: ServerEntry = { name: "box2", origin: "http://example.test", port: 8080 };
	assert.equal(buildBaseUrl(entry), "http://example.test:8080/v1");
});
