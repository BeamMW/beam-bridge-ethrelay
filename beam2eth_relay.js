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
const RESULTS_TABLE = "results";
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
    return relayerFee >= estimatedRelayerFee;
}

async function addResult(msgId, details) {
    const insertSql = `INSERT OR REPLACE INTO ${RESULTS_TABLE} (msgId, details) VALUES(?,?);`;
    try {
        return db.run(insertSql, [
            msgId,
            details
        ]);
    } catch (err) {
        logger.error(`Failed to save result - ${err.message}`);
        throw err;
    }
}

async function processLocalMsg(msgId, currentHeight) {
    let details;

    for (let i = 1; i < 2; i++) {
        details = 'success';
        try {
            const localMsg = await beam.getLocalMsg(msgId);

            if (
                localMsg["height"] >
                currentHeight - process.env.BEAM_MIN_CONFIRMATIONS
            ) {
                return false;
            }

            let amount = localMsg["amount"].toString();
            let relayerFee = localMsg["relayerFee"].toString();

            if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
                const diff = process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS;
                amount = amount.padEnd(amount.length + diff, "0");
                relayerFee = relayerFee.padEnd(relayerFee.length + diff, "0");
            } else if (process.env.ETH_SIDE_DECIMALS < beam.BEAM_MAX_DECIMALS) {
                const diff = beam.BEAM_MAX_DECIMALS - process.env.ETH_SIDE_DECIMALS;
                // check that amount contains this count of zeros at the end
                let endedStr = "0".repeat(diff);
                if (!amount.endsWith(endedStr) || !relayerFee.endsWith(endedStr)) {
                    details = `Unexpected amounts. Message ID - ${msgId}. Amount = ${amount}`;
                    logger.error(details);
                    break;
                }
                // remove zeros
                amount = amount.slice(0, -diff);
                relayerFee = relayerFee.slice(0, -diff);
            }

            logger.info('before isValidRelayerFee');

            if (await isValidRelayerFee(relayerFee)) {
                logger.info(`Processing of a new message has started. Message ID - ${msgId}`);

                await eth.processRemoteMessage(
                    msgId,
                    amount,
                    localMsg["receiver"],
                    relayerFee
                );

                logger.info(`The message was successfully transferred to the Ethereum. Message ID - ${msgId}`);
            } else {
                details = `Relayer fee is small! Message ID - ${msgId}, realyerFee = ${relayerFee}`;
                logger.error(details);
            }

            break;
        } catch (err) {
            details = `Failed to push remote message #${msgId}. Attempt #${i}. Details: ${err}`;
            logger.error(details);
            console.log(err);
        }
    }

    await addResult(msgId, details);
    return true;
}

async function monitorBridge() {
    const currentHeight = await requestHeight();

    if (currentHeight > 0 && currentHeight > process.env.BEAM_MIN_CONFIRMATIONS) {
        try {
            const count = await beam.getLocalMsgCount();

            while (msgId <= count) {
                const processed = await processLocalMsg(msgId, currentHeight);

                if (!processed) {
                    break;
                }
                saveSettings(++msgId);
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

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${RESULTS_TABLE} 
                            (msgId INTEGER NOT NULL
                            ,details TEXT NOT NULL
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
