import logger from "../logger.js";

export const STATE_TABLE = "state";
const LAST_BLOCK_KEY = "last_block";
// the provider limits the block range of eth_getLogs (10000 blocks), keep a margin
export const DEFAULT_MAX_SCAN_RANGE = 9000;
const SCAN_ATTEMPTS = 5;
const SCAN_RETRY_DELAY = 10000; // ms

export async function createStateTable(db) {
    const createStateTableSql = `CREATE TABLE IF NOT EXISTS ${STATE_TABLE}
                                 (key TEXT PRIMARY KEY
                                 ,value INTEGER NOT NULL);`;
    await db.exec(createStateTableSql);
}

export async function getLastBlock(db) {
    const selectSql = `SELECT value FROM ${STATE_TABLE} WHERE key=?;`;
    const row = await db.get(selectSql, [LAST_BLOCK_KEY]);
    return row ? row["value"] : undefined;
}

export async function saveLastBlock(db, blockNumber) {
    // the last block only moves forward
    const upsertSql = `INSERT INTO ${STATE_TABLE} (key, value) VALUES(?,?)
                       ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE excluded.value > ${STATE_TABLE}.value;`;
    try {
        await db.run(upsertSql, [LAST_BLOCK_KEY, blockNumber]);
    } catch (err) {
        logger.error("Failed to save last block - " + err.message);
    }
}

export function getMaxScanRange(value = process.env.ETH_MAX_SCAN_RANGE) {
    const range = parseInt(value);
    return range > 0 ? range : DEFAULT_MAX_SCAN_RANGE;
}

// Chooses the block to start the scan from.
// Returns {startBlock, skipped}, where skipped is the range of blocks that won't be scanned (or undefined).
export function resolveStartBlock({ cliStartBlock, lastBlock, dbStartBlock, headBlock, maxScanRange }) {
    if (cliStartBlock !== undefined) {
        // manual recovery: the whole range is scanned in chunks
        return { startBlock: cliStartBlock, skipped: undefined };
    }

    const storedBlock = lastBlock !== undefined ? lastBlock : dbStartBlock;
    const limitedStartBlock = headBlock - maxScanRange;

    if (storedBlock === undefined) {
        return { startBlock: limitedStartBlock, skipped: undefined };
    }

    if (headBlock - storedBlock > maxScanRange) {
        return {
            startBlock: limitedStartBlock,
            skipped: { fromBlock: storedBlock, toBlock: limitedStartBlock - 1 },
        };
    }

    return { startBlock: storedBlock, skipped: undefined };
}

export async function withRetry(fn, description, { attempts = SCAN_ATTEMPTS, delay = SCAN_RETRY_DELAY } = {}) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt >= attempts) {
                throw err;
            }
            logger.error(`${description} failed (attempt ${attempt}/${attempts}) - ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

// collects Pipe.NewLocalMessage events in chunks to stay within the provider's range limit
export async function scanPastEvents(pipeContract, fromBlock, toBlock, chunkSize, onEvent, retryOptions) {
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, toBlock);
        const events = await withRetry(
            () => pipeContract.getPastEvents("NewLocalMessage", { fromBlock: start, toBlock: end }),
            `Scanning of blocks ${start}..${end}`,
            retryOptions
        );
        logger.info(`Scanned blocks ${start}..${end}, found events: ${events.length}`);
        for (const event of events) {
            logger.info("Got past event: ", event);
            await onEvent(event);
        }
    }
}
