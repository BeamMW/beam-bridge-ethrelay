import assert from "assert";
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";
import {
    DEFAULT_MAX_SCAN_RANGE,
    createStateTable,
    getLastBlock,
    saveLastBlock,
    getMaxScanRange,
    resolveStartBlock,
    withRetry,
    scanPastEvents,
} from "./../utils/eth_scan.js";

const PROVIDER_RANGE_LIMIT = 10000;
const NO_DELAY = { attempts: 5, delay: 0 };

// imitates the provider: rejects too wide ranges, can fail the first calls
function createFakeContract({ events = [], failures = 0, alwaysFail = false } = {}) {
    const calls = [];
    return {
        calls,
        async getPastEvents(name, { fromBlock, toBlock }) {
            calls.push({ name, fromBlock, toBlock });
            if (toBlock - fromBlock > PROVIDER_RANGE_LIMIT) {
                throw new Error(`Returned error: range ${toBlock - fromBlock} exceeds limit of ${PROVIDER_RANGE_LIMIT}`);
            }
            if (alwaysFail || failures-- > 0) {
                throw new Error("connection error");
            }
            return events.filter((e) => e.blockNumber >= fromBlock && e.blockNumber <= toBlock);
        },
    };
}

function event(blockNumber, msgId) {
    return { blockNumber, transactionHash: `0x${blockNumber.toString(16)}`, returnValues: { msgId } };
}

describe("eth_scan", function () {
    describe("getMaxScanRange", function () {
        it("uses the configured value", function () {
            assert.strictEqual(getMaxScanRange("5000"), 5000);
        });

        it("falls back to the default for empty or invalid values", function () {
            for (const value of [undefined, "", "abc", "0", "-100"]) {
                assert.strictEqual(getMaxScanRange(value), DEFAULT_MAX_SCAN_RANGE, `value: ${value}`);
            }
        });
    });

    describe("resolveStartBlock", function () {
        const headBlock = 26084320;
        const maxScanRange = 9000;

        it("prefers the block from the command line without limiting the range", function () {
            const result = resolveStartBlock({
                cliStartBlock: 26000000, lastBlock: 26084300, dbStartBlock: 26084000, headBlock, maxScanRange,
            });
            assert.deepStrictEqual(result, { startBlock: 26000000, skipped: undefined });
        });

        it("uses the last scanned block", function () {
            const result = resolveStartBlock({
                lastBlock: 26084300, dbStartBlock: 26080000, headBlock, maxScanRange,
            });
            assert.deepStrictEqual(result, { startBlock: 26084300, skipped: undefined });
        });

        it("falls back to the block from the events table", function () {
            const result = resolveStartBlock({ dbStartBlock: 26080000, headBlock, maxScanRange });
            assert.deepStrictEqual(result, { startBlock: 26080000, skipped: undefined });
        });

        it("scans the last maxScanRange blocks for an empty database", function () {
            const result = resolveStartBlock({ headBlock, maxScanRange });
            assert.deepStrictEqual(result, { startBlock: headBlock - maxScanRange, skipped: undefined });
        });

        it("keeps the start block exactly maxScanRange blocks behind the head", function () {
            const result = resolveStartBlock({ lastBlock: headBlock - maxScanRange, headBlock, maxScanRange });
            assert.deepStrictEqual(result, { startBlock: headBlock - maxScanRange, skipped: undefined });
        });

        it("limits the range and reports the skipped blocks", function () {
            const lastBlock = headBlock - 66805;
            const result = resolveStartBlock({ lastBlock, headBlock, maxScanRange });
            assert.deepStrictEqual(result, {
                startBlock: headBlock - maxScanRange,
                skipped: { fromBlock: lastBlock, toBlock: headBlock - maxScanRange - 1 },
            });
        });

        it("limits the range starting from maxScanRange + 1 blocks", function () {
            const result = resolveStartBlock({ lastBlock: headBlock - maxScanRange - 1, headBlock, maxScanRange });
            assert.deepStrictEqual(result, {
                startBlock: headBlock - maxScanRange,
                skipped: { fromBlock: headBlock - maxScanRange - 1, toBlock: headBlock - maxScanRange - 1 },
            });
        });

        it("limits the range of the block from the events table too", function () {
            const result = resolveStartBlock({ dbStartBlock: headBlock - 20000, headBlock, maxScanRange });
            assert.strictEqual(result.startBlock, headBlock - maxScanRange);
            assert.deepStrictEqual(result.skipped, { fromBlock: headBlock - 20000, toBlock: headBlock - maxScanRange - 1 });
        });
    });

    describe("withRetry", function () {
        it("returns the result after the failed attempts", async function () {
            let calls = 0;
            const result = await withRetry(async () => {
                if (++calls < 3) throw new Error("fail");
                return "ok";
            }, "test", NO_DELAY);
            assert.strictEqual(result, "ok");
            assert.strictEqual(calls, 3);
        });

        it("throws the last error when attempts are exhausted", async function () {
            let calls = 0;
            await assert.rejects(
                withRetry(async () => {
                    calls++;
                    throw new Error(`fail ${calls}`);
                }, "test", { attempts: 3, delay: 0 }),
                { message: "fail 3" }
            );
            assert.strictEqual(calls, 3);
        });
    });

    describe("scanPastEvents", function () {
        it("covers the whole range with chunks without gaps and overlaps", async function () {
            const contract = createFakeContract();
            const fromBlock = 26000000;
            const toBlock = 26084320;
            await scanPastEvents(contract, fromBlock, toBlock, 9000, async () => {}, NO_DELAY);

            assert.strictEqual(contract.calls[0].fromBlock, fromBlock);
            assert.strictEqual(contract.calls[contract.calls.length - 1].toBlock, toBlock);
            for (let i = 1; i < contract.calls.length; i++) {
                assert.strictEqual(contract.calls[i].fromBlock, contract.calls[i - 1].toBlock + 1);
            }
            for (const call of contract.calls) {
                assert.strictEqual(call.name, "NewLocalMessage");
                assert.ok(call.toBlock - call.fromBlock + 1 <= 9000);
            }
            assert.strictEqual(contract.calls.length, Math.ceil((toBlock - fromBlock + 1) / 9000));
        });

        it("makes a single request for a small range", async function () {
            const contract = createFakeContract();
            await scanPastEvents(contract, 100, 100, 9000, async () => {}, NO_DELAY);
            assert.deepStrictEqual(contract.calls, [{ name: "NewLocalMessage", fromBlock: 100, toBlock: 100 }]);
        });

        it("makes no requests when the start block is ahead of the head", async function () {
            const contract = createFakeContract();
            await scanPastEvents(contract, 101, 100, 9000, async () => {}, NO_DELAY);
            assert.strictEqual(contract.calls.length, 0);
        });

        it("passes all found events in order", async function () {
            const events = [event(26000001, "1"), event(26009000, "2"), event(26083143, "236")];
            const contract = createFakeContract({ events });
            const found = [];
            await scanPastEvents(contract, 26000000, 26084320, 9000, async (e) => found.push(e), NO_DELAY);
            assert.deepStrictEqual(found.map((e) => e.returnValues.msgId), ["1", "2", "236"]);
        });

        it("retries the failed chunk", async function () {
            const contract = createFakeContract({ events: [event(26083143, "236")], failures: 2 });
            const found = [];
            await scanPastEvents(contract, 26083100, 26083200, 9000, async (e) => found.push(e), NO_DELAY);
            assert.strictEqual(contract.calls.length, 3);
            assert.deepStrictEqual(found.map((e) => e.returnValues.msgId), ["236"]);
        });

        it("fails when the provider keeps failing", async function () {
            const contract = createFakeContract({ alwaysFail: true });
            await assert.rejects(
                scanPastEvents(contract, 26083100, 26083200, 9000, async () => {}, NO_DELAY),
                { message: "connection error" }
            );
            assert.strictEqual(contract.calls.length, NO_DELAY.attempts);
        });
    });

    describe("last block in the database", function () {
        let db;

        beforeEach(async function () {
            db = await sqlite.open({ filename: ":memory:", driver: sqlite3.Database });
            await createStateTable(db);
        });

        afterEach(async function () {
            await db.close();
        });

        it("is undefined for an empty database", async function () {
            assert.strictEqual(await getLastBlock(db), undefined);
        });

        it("is saved and updated", async function () {
            await saveLastBlock(db, 100);
            assert.strictEqual(await getLastBlock(db), 100);
            await saveLastBlock(db, 200);
            assert.strictEqual(await getLastBlock(db), 200);
        });

        it("never moves backward", async function () {
            await saveLastBlock(db, 200);
            await saveLastBlock(db, 150);
            assert.strictEqual(await getLastBlock(db), 200);
        });

        it("keeps the stored value when the state table is created again", async function () {
            await saveLastBlock(db, 300);
            await createStateTable(db);
            assert.strictEqual(await getLastBlock(db), 300);
        });
    });
});
