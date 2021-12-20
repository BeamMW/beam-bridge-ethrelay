import dotenv from "dotenv";

dotenv.config();

import * as beam from "./utils/beam_utils.js";
import * as eth from "./utils/eth_utils.js";
import { program } from "commander";
import https from "https";
import fs from "fs";
import logger from "./logger.js"
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";

/*
it is not necessary to use let if you will not reassign variable
 */
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

function saveSettings(value) {
    try {
        fs.writeFileSync(
            process.env.BEAM2ETH_SETTINGS_FILE,
            JSON.stringify({
                startMsgId: value,
            })
        );
    } catch (e) { }
}

async function requestHeight() {
    try {
        const status = await beam.walletStatus();
        return status["current_height"];
    } catch (e) {
        logger.error(`There is Beam wallet status problem. ${e}`);
    }
    return 0;
}

function baseGetRequest(url, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = "";

        const callback = (response) => {
            // same as above
            response.on("data", (chunk) => {
                accumulated += chunk;
            });

            response.on("end", () => {
                resolve(processResult(accumulated));
            });

            response.on("error", reject);
        };

        https.get(url, callback).on("error", reject);
    });
}

async function getCurrencyRate(rateId) {
    const url = `${process.env.COINGECKO_CURRENCY_RATE_API_URL}?ids=${rateId}&vs_currencies=usd`;
    return baseGetRequest(url, JSON.parse);
}

async function getGasPrice() {
    return baseGetRequest(process.env.GAS_PRICE_API_URL, JSON.parse);
}

async function calcCurrentRelayerFee(rateId) {
    const RELAY_COSTS_IN_GAS = 120000;
    const ETH_RATE_ID = "ethereum";

    const gasPrice = await getGasPrice();
    const ethRate = await getCurrencyRate(ETH_RATE_ID);
    const relayCosts =
        (RELAY_COSTS_IN_GAS *
            parseFloat(gasPrice["FastGasPrice"]) *
            parseFloat(ethRate[ETH_RATE_ID]["usd"])) /
        Math.pow(10, 9);
    const currRate = await getCurrencyRate(rateId);

    return relayCosts / parseFloat(currRate[rateId]["usd"]);
}

async function isValidRelayerFee(relayerFee) {
    const estimatedRelayerFee = await calcCurrentRelayerFee(
        process.env.COINGECKO_CURRENCY_RATE_ID
    );
    return BigInt(relayerFee) >= BigInt(Math.trunc(Math.pow(10, process.env.ETH_SIDE_DECIMALS) * estimatedRelayerFee));
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

async function onProcessedLocalMsg(id, result, details) {
    const updateSql = `UPDATE ${MESSAGES_TABLE} SET processed=1, result=${result}, details='${details}' WHERE msgId=${id}`;
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
    }
}

async function processLocalMsg(localMsg) {
    let details;
    let result;

    for (let i = 1; i < 2; i++) {
        details = 'success';
        result = ResultStatus.Success;
        try {
            let amount = preprocessAmount(localMsg["amount"]);
            let relayerFee = preprocessAmount(localMsg["relayerFee"]);

            if (amount === undefined) {
                details = `Unexpected amounts. Message ID - ${localMsg["msgId"]}. Amount = ${localMsg["amount"]}`;
                result = ResultStatus.UnexpectedAmount;
                logger.error(details);
                break;
            }

            if (relayerFee === undefined) {
                details = `Unexpected relayerFee. Message ID - ${localMsg["msgId"]}. relayerFee = ${localMsg["relayerFee"]}`;
                result = ResultStatus.UnexpectedAmount;
                logger.error(details);
                break;
            }

            if (await isValidRelayerFee(relayerFee)) {
                logger.info(`Processing of a new message has started. Message ID - ${localMsg["msgId"]}`);

                await eth.processRemoteMessage(
                    msgId,
                    amount,
                    localMsg["receiver"],
                    relayerFee
                );

                logger.info(`The message was successfully transferred to the Ethereum. Message ID - ${localMsg["msgId"]}`);
            } else {
                details = `Relayer fee is small! Message ID - ${localMsg["msgId"]}, realyerFee = ${relayerFee}`;
                result = ResultStatus.SmallFee;
                logger.error(details);
            }

            break;
        } catch (err) {
            details = `Failed to push remote message #${localMsg["msgId"]}. Attempt #${i}. Details: ${err}`;
            result = ResultStatus.Other;
            logger.error(details);
        }
    }

    await onProcessedLocalMsg(localMsg["msgId"], result, details);
}

async function monitorBridge() {
    const currentHeight = await requestHeight();

    if (currentHeight > 0 && currentHeight > process.env.BEAM_MIN_CONFIRMATIONS) {
        try {
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
                saveSettings(++msgId);
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
                            ,UNIQUE(msgId));`;

    await db.exec(createTableSql);

    program.option("-m, --msgId <number>", "start message id");
    program.parse(process.argv);

    const options = program.opts();

    if (options.msgId !== undefined) {
        msgId = options.msgId;
        saveSettings(msgId);
    } else {
        try {
            const data = fs.readFileSync(process.env.BEAM2ETH_SETTINGS_FILE);
            const obj = JSON.parse(data);
            msgId = obj["startMsgId"];
        } catch (e) { }
    }

    await monitorBridge();
})();
