/**
 * Tests for parseArgSpec function
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Inline the parseArgSpec function for testing
function parseArgSpec(content) {
	const positionalSet = new Set();
	let usesAllArgs = false;
	const slices = [];

	// $1, $2, ... (but not inside ${...})
	for (const match of content.matchAll(/\$(\d+)/g)) {
		const idx = parseInt(match[1], 10);
		if (idx > 0) positionalSet.add(idx);
	}

	// ${@:N} and ${@:N:L}
	for (const match of content.matchAll(/\$\{@:(\d+)(?::(\d+))?\}/g)) {
		const start = parseInt(match[1], 10);
		const length = match[2] ? parseInt(match[2], 10) : undefined;
		slices.push({ start, length });
	}

	// $@ or $ARGUMENTS
	if (/\$@/.test(content) || /\$ARGUMENTS/.test(content)) {
		usesAllArgs = true;
	}

	const positionalIndices = [...positionalSet].sort((a, b) => a - b);
	const highestPositional = positionalIndices.length > 0 ? positionalIndices[positionalIndices.length - 1] : 0;

	return { highestPositional, positionalIndices, usesAllArgs, slices };
}

describe("parseArgSpec", () => {
	it("handles empty content", () => {
		const spec = parseArgSpec("");
		assert.strictEqual(spec.highestPositional, 0);
		assert.deepStrictEqual(spec.positionalIndices, []);
		assert.strictEqual(spec.usesAllArgs, false);
		assert.deepStrictEqual(spec.slices, []);
	});

	it("parses positional args $1, $2, $3", () => {
		const spec = parseArgSpec("Review $1 with $2 and $3");
		assert.strictEqual(spec.highestPositional, 3);
		assert.deepStrictEqual(spec.positionalIndices, [1, 2, 3]);
		assert.strictEqual(spec.usesAllArgs, false);
	});

	it("parses $@ (all args)", () => {
		const spec = parseArgSpec("Process: $@");
		assert.strictEqual(spec.highestPositional, 0);
		assert.strictEqual(spec.usesAllArgs, true);
	});

	it("parses $ARGUMENTS", () => {
		const spec = parseArgSpec("Context: $ARGUMENTS");
		assert.strictEqual(spec.highestPositional, 0);
		assert.strictEqual(spec.usesAllArgs, true);
	});

	it("parses ${@:N} slice", () => {
		const spec = parseArgSpec("First: $1, rest: ${@:2}");
		assert.strictEqual(spec.highestPositional, 1);
		assert.deepStrictEqual(spec.slices, [{ start: 2, length: undefined }]);
	});

	it("parses ${@:N:L} slice with length", () => {
		const spec = parseArgSpec("Get ${@:2:3} items");
		assert.deepStrictEqual(spec.slices, [{ start: 2, length: 3 }]);
	});

	it("handles mixed placeholders", () => {
		const spec = parseArgSpec("Review $1 with context ${@:2} and full args: $@");
		assert.strictEqual(spec.highestPositional, 1);
		assert.strictEqual(spec.usesAllArgs, true);
		assert.deepStrictEqual(spec.slices, [{ start: 2, length: undefined }]);
	});

	it("handles cognitive trigger template", () => {
		const content = `
INVERSION — Bug Discovery via Shadow Analysis

Before addressing the stated problem, map its shadow.

Focus on: $1
Context: $@
`;
		const spec = parseArgSpec(content);
		assert.strictEqual(spec.highestPositional, 1);
		assert.strictEqual(spec.usesAllArgs, true);
		assert.deepStrictEqual(spec.positionalIndices, [1]);
	});
});
