/**
 * Tests for config.ts: multi-server loading, normalization, and
 * per-server context override persistence.
 *
 * Each test runs against a throwaway HOME so the real user config is
 * never touched.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, beforeEach, afterEach } from "node:test";

import { loadConfig, saveContextOverride } from "../lib/config.js";

let home: string;
const savedHome = process.env.HOME;
const savedEnvUrl = process.env.LLAMA_SWAP_URL;
const savedEnvPort = process.env.LLAMA_SWAP_PORT;
const savedEnvKey = process.env.LLAMA_SWAP_API_KEY;

function writeConfig(json: unknown): void {
	mkdirSync(join(home, ".pi", "agent"), { recursive: true });
	writeFileSync(join(home, ".pi", "agent", "pi-llama-swap.json"), JSON.stringify(json), "utf8");
}

function readConfigText(): string {
	return readFileSync(join(home, ".pi", "agent", "pi-llama-swap.json"), "utf8");
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pi-llama-swap-test-"));
	process.env.HOME = home;
	delete process.env.LLAMA_SWAP_URL;
	delete process.env.LLAMA_SWAP_PORT;
	delete process.env.LLAMA_SWAP_API_KEY;
});

afterEach(() => {
	process.env.HOME = savedHome;
	if (savedEnvUrl !== undefined) process.env.LLAMA_SWAP_URL = savedEnvUrl;
	if (savedEnvPort !== undefined) process.env.LLAMA_SWAP_PORT = savedEnvPort;
	if (savedEnvKey !== undefined) process.env.LLAMA_SWAP_API_KEY = savedEnvKey;
	rmSync(home, { recursive: true, force: true });
});

test("no config file: defaults, empty servers", async () => {
	const config = await loadConfig();
	assert.equal(config.defaultServer.origin, "http://127.0.0.1");
	assert.equal(config.defaultServer.port, 8080);
	assert.deepEqual(config.servers, []);
});

test("servers array resolves named servers with per-server overrides", async () => {
	writeConfig({
		origin: "http://primary.test",
		port: 8001,
		contextOverrides: { m1: 32768 },
		servers: [
			{ name: "box2", origin: "http://box2.test", port: 8080, contextOverrides: { m2: 65536 } },
		],
	});
	const config = await loadConfig();
	assert.equal(config.defaultServer.origin, "http://primary.test");
	assert.deepEqual(config.defaultServer.contextOverrides, { m1: 32768 });

	assert.equal(config.servers.length, 1);
	const box2 = config.servers[0];
	assert.equal(box2.name, "box2");
	assert.equal(box2.origin, "http://box2.test");
	assert.equal(box2.port, 8080);
	assert.deepEqual(box2.contextOverrides, { m2: 65536 });
});

test("named server entry falls back to package defaults, not default server values", async () => {
	writeConfig({
		origin: "http://primary.test",
		port: 8001,
		servers: [{ name: "box2" }],
	});
	const config = await loadConfig();
	const box2 = config.servers[0];
	assert.equal(box2.origin, "http://127.0.0.1");
	assert.equal(box2.port, 8080);
});

test("invalid server entries are skipped; duplicates keep first", async () => {
	writeConfig({
		servers: [
			{ name: "good", origin: "http://good.test", port: 1 },
			{ origin: "http://noname.test", port: 2 },
			{ name: "", origin: "http://emptyname.test" },
			{ name: "default", origin: "http://reserved.test" },
			{ name: "bad name!", origin: "http://badname.test" },
			{ name: "good", origin: "http://dup.test", port: 3 },
		],
	});
	const config = await loadConfig();
	assert.deepEqual(config.servers.map((s) => s.origin), ["http://good.test"]);
});

test("LLAMA_SWAP_URL env override applies to default server only", async () => {
	writeConfig({
		origin: "http://primary.test",
		servers: [{ name: "box2", origin: "http://box2.test", port: 8080 }],
	});
	process.env.LLAMA_SWAP_URL = "http://env.test:9090";
	const config = await loadConfig();
	assert.equal(config.defaultServer.origin, "http://env.test:9090");
	assert.equal(config.defaultServer.port, 9090);
	assert.equal(config.servers[0].origin, "http://box2.test");
});

test("saveContextOverride writes into the named server section", async () => {
	writeConfig({
		origin: "http://primary.test",
		contextOverrides: { m1: 1 },
		servers: [{ name: "box2", origin: "http://box2.test", port: 8080 }],
	});
	await saveContextOverride("m2", 65536, "box2");

	const raw = JSON.parse(readConfigText()) as Record<string, unknown>;
	assert.deepEqual(raw.contextOverrides, { m1: 1 }, "default section untouched");
	const box2 = (raw.servers as Record<string, unknown>[])[0];
	assert.equal(box2.name, "box2");
	assert.deepEqual(box2.contextOverrides, { m2: 65536 });
});

test("saveContextOverride without server name writes the default section", async () => {
	writeConfig({ servers: [{ name: "box2", contextOverrides: { m1: 1 } }] });
	await saveContextOverride("m9", 4096);
	const raw = JSON.parse(readConfigText()) as Record<string, unknown>;
	assert.deepEqual(raw.contextOverrides, { m9: 4096 });
	assert.deepEqual((raw.servers as Record<string, unknown>[])[0].contextOverrides, { m1: 1 });
});

test("saveContextOverride clears an override (auto)", async () => {
	writeConfig({ contextOverrides: { m1: 1, m2: 2 } });
	await saveContextOverride("m1", undefined);
	const raw = JSON.parse(readConfigText()) as Record<string, unknown>;
	assert.deepEqual(raw.contextOverrides, { m2: 2 });
});
