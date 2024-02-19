import dotenv from "dotenv";

dotenv.config();

import * as beam from "./utils/beam_utils.js";
import * as eth from "./utils/eth_utils.js";
import { program } from "commander";
import logger from "./logger.js"
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";
import {UnexpectedAmountError, SmallFeeError} from "./utils/exceptions.js"
import {calcCurrentRelayerFee} from "./utils/eth_fee.js"

const MAX_ATTEMPTS = 3
const ATTEMPT_COLUMN_NAME = 'attempt'
const MESSAGES_TABLE = "messages";
const ResultStatus = {
    None: 0,
    Success: 1,
    UnexpectedAmount: 2,
    SmallFee: 3,
    Other: 4
};
let db = undefined;
let msgId = 1;
let lowFeeMessagesRefreshCounter = 0;

async function requestHeight() {
    try {
        const status = await beam.walletStatus();
        return status["current_height"];
    } catch (e) {
        logger.error(`There is Beam wallet status problem. ${e}`);
    }
    return 0;
}

async function addMessage(id, localMsg) {
    const insertSql = `INSERT OR IGNORE INTO ${MESSAGES_TABLE} (msgId, receiver, amount, relayerFee) VALUES(?,?,?,?);`;
    try {
        return db.run(insertSql, [
            id,
            localMsg["receiver"],
            localMsg["amount"],
            localMsg["relayerFee"]
        ]);
    } catch (err) {
        logger.error(`Failed to save result - ${err.message}`);
        throw err;
    }
}

async function getMaxMsgIdFromDB() {
    const maxMsgIdSql = `SELECT MAX(msgId) from ${MESSAGES_TABLE}`;
    try {
        let row = await db.get(maxMsgIdSql);
        return row['MAX(msgId)'];
    } catch (err) {
        logger.error(`Failed to get last known msgId from DB - ${err.message}`);
        throw err;
    }
}

async function onProcessedLocalMsg(id, processed, result, details, attempt) {
    const updateSql = `UPDATE ${MESSAGES_TABLE} SET processed=${Number(processed)}, result=${result}, details='${details}', ${ATTEMPT_COLUMN_NAME}=${attempt} WHERE msgId=${id}`;
    try {
        return db.run(updateSql);
    } catch (err) {
        logger.error("Failed to update message - " + err.message, " msgID: ", id);
        throw err;
    }
}

function preprocessAmount(value) {
    let strValue = value.toString();

    if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
        const diff = process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS;
        return strValue.padEnd(strValue.length + diff, "0");
    } else if (process.env.ETH_SIDE_DECIMALS < beam.BEAM_MAX_DECIMALS) {
        const diff = beam.BEAM_MAX_DECIMALS - process.env.ETH_SIDE_DECIMALS;
        // check that amount contains this count of zeros at the end
        let endedStr = "0".repeat(diff);
        if (strValue.endsWith(endedStr)) {
            // remove zeros
            return strValue.slice(0, -diff);
        }
    } else { // process.env.ETH_SIDE_DECIMALS === beam.BEAM_MAX_DECIMALS
        return strValue;
    }
}

async function getCurrentMinRelayerFee() {
    const estimatedRelayerFee = await calcCurrentRelayerFee(
        process.env.COINGECKO_CURRENCY_RATE_ID
    );
    const expectedMinimumFee = Math.trunc(
        Math.pow(10, process.env.ETH_SIDE_DECIMALS) * estimatedRelayerFee
    );

    return expectedMinimumFee;
}

async function processLocalMsg(localMsg) {
    let details = 'success';
    let processed = 1;
    let result = ResultStatus.Success;
    try {
        logger.info(`Processing of a new message has started. Message ID - ${localMsg["msgId"]}`);
        localMsg[ATTEMPT_COLUMN_NAME]++;
        let amount = preprocessAmount(localMsg["amount"]);
        let relayerFee = preprocessAmount(localMsg["relayerFee"]);

        if (amount === undefined) {
            throw new UnexpectedAmountError(`Unexpected amounts. Amount = ${localMsg["amount"]}`);
        }

        if (relayerFee === undefined) {
            throw new UnexpectedAmountError(`Unexpected relayerFee. relayerFee = ${localMsg["relayerFee"]}`);
        }
        {
            const expectedMinimumFee = await getCurrentMinRelayerFee();
            const isFeeOk = BigInt(relayerFee) >= BigInt(expectedMinimumFee);
            if (!isFeeOk) {
                throw new SmallFeeError(`Relayer fee is small! realyerFee = ${relayerFee}, 
                expected minimum fee - ${expectedMinimumFee}`);
            }
        }
        
        logger.info(`Basic message checks are completed successfully. Message ID - ${localMsg["msgId"]}`);
        logger.info(`Starting the message transmission to the Ethereum. Message ID - ${localMsg["msgId"]}`);

        await eth.processRemoteMessage(
            localMsg["msgId"],
            amount,
            localMsg["receiver"],
            relayerFee
        );

        logger.info(`The message was successfully transferred to the Ethereum. Message ID - ${localMsg["msgId"]}`);
    } catch (err) {
        details = `Failed to push remote message #${localMsg["msgId"]}. Details: ${err.message}`;
        logger.error(details);

        if (err instanceof UnexpectedAmountError) {
            result = ResultStatus.UnexpectedAmount;
        } else if (err instanceof SmallFeeError) {
            result = ResultStatus.SmallFee;
        } else {
            result = ResultStatus.Other;
            processed = localMsg[ATTEMPT_COLUMN_NAME] >= MAX_ATTEMPTS;
        }
    }

    await onProcessedLocalMsg(localMsg["msgId"], processed, result, details, localMsg[ATTEMPT_COLUMN_NAME]);
}

async function monitorBridge() {
    const currentHeight = await requestHeight();

    if (currentHeight > 0 && currentHeight > process.env.BEAM_MIN_CONFIRMATIONS) {
        try {
            await checkStuckMessages();

            const count = await beam.getLocalMsgCount();

            while (msgId <= count) {
                const localMsg = await beam.getLocalMsg(msgId);

                if (
                    localMsg["height"] >
                    currentHeight - process.env.BEAM_MIN_CONFIRMATIONS
                ) {
                    break;
                }

                await addMessage(msgId, localMsg);
                ++msgId;
            }

            // select unprocessed messages
            const filterSql = `SELECT * FROM ${MESSAGES_TABLE} WHERE processed = 0`;
            const rows = await db.all(filterSql);

            for (const row of rows) {
                await processLocalMsg(row);
            }
        } catch (e) {
            logger.error(`Error: ${e}`);
        }
    }

    setTimeout(monitorBridge, process.env.BEAM_BLOCK_CREATION_PERIOD);
}

function convertToBeam(amount) {
    if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
        return Math.trunc(amount / Math.pow(10, process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS));
    } else if (process.env.ETH_SIDE_DECIMALS < beam.BEAM_MAX_DECIMALS) {
        return amount * Math.pow(10, beam.BEAM_MAX_DECIMALS - process.env.ETH_SIDE_DECIMALS);
    }
    return amount;
}

async function checkStuckMessages() {
    if (lowFeeMessagesRefreshCounter < process.env.LOW_FEE_MESSAGES_REFRESH_INTERVAL) {
        lowFeeMessagesRefreshCounter++;
        return;
    }
    lowFeeMessagesRefreshCounter = 0;
    try {
        // retry to process stuck messages with low fee:
        // 0) check if messages with low fee are exists
        const kCountField = 'count';
        const kTargetResultStatus = ResultStatus.SmallFee;
        const countSql = `SELECT count(*) AS ${kCountField} FROM ${MESSAGES_TABLE} WHERE result=${kTargetResultStatus};`
        const row = await db.get(countSql);
        if (!row[kCountField]) {
            return;
        }
        // 1) get current estimated fee
        const expectedMinimumFee = convertToBeam(await getCurrentMinRelayerFee());
        // 2) filter stuck messages with low fee error and reset them 'processed' to 0
        const updateSql = `UPDATE ${MESSAGES_TABLE} SET processed=0 WHERE processed=1 
                            AND result=${kTargetResultStatus} 
                            AND relayerFee>=${expectedMinimumFee};`;
        return db.run(updateSql);
    } catch (err) {
        logger.error("Failed to reset stuck messages with low fee - " + err.message);
    }
}

(async () => {
    // open the database
    db = await sqlite.open({
        filename: process.env.BEAM2ETH_DB_PATH,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        driver: sqlite3.Database,
    });

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} 
                            (msgId INTEGER NOT NULL
                            ,processed INTEGER NOT NULL DEFAULT 0
                            ,result INTEGER NOT NULL DEFAULT 0
                            ,details TEXT NOT NULL DEFAULT ''
                            ,receiver TEXT NOT NULL
                            ,amount INTEGER NOT NULL DEFAULT 0
                            ,relayerFee INTEGER NOT NULL DEFAULT 0
                            ,${ATTEMPT_COLUMN_NAME} INTEGER NOT NULL DEFAULT 0
                            ,UNIQUE(msgId));`;

    await db.exec(createTableSql);

    // check if 'attempt' column is exist, else ADD to DB
    const tablePragmaInfoSql = `PRAGMA table_info(${MESSAGES_TABLE});`
    let result = await db.all(tablePragmaInfoSql);
    if (result && result[result.length - 1]['name'] !== ATTEMPT_COLUMN_NAME) {
        const addColumnSql = `ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN ${ATTEMPT_COLUMN_NAME} INTEGER NOT NULL DEFAULT 0;`
        await db.exec(addColumnSql);
    }

    program.option("-m, --msgId <number>", "start message id");
    program.parse(process.argv);

    const options = program.opts();

    if (options.msgId !== undefined) {
        msgId = options.msgId;
    } else {
        try {
            msgId = await getMaxMsgIdFromDB();
            // if msgId is uninitialized then start from 1, else switch to the next one
            msgId = msgId ? msgId + 1 : 1;
        } catch (e) { }
    }

    await monitorBridge();
})();
