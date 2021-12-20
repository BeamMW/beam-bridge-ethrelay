import dotenv from "dotenv";

dotenv.config();

import * as beam from "./utils/beam_utils.js";
import Web3 from "web3";
import { program } from "commander";
import sqlite3 from "sqlite3";
import * as sqlite from "sqlite";
import logger from "./logger.js"
import PipeContract from "./utils/EthPipeContractABI.js";

const EVENTS_TABLE = "events";
let db = undefined;
let eventsInProgress = new Set();

async function addEvent(event) {
    // ignore if event is exist in db
    const insertSql = `INSERT OR IGNORE INTO ${EVENTS_TABLE} (block, txHash, body) VALUES(?,?,?);`;
    try {
        return db.run(insertSql, [
            event["blockNumber"],
            event["transactionHash"],
            JSON.stringify(event),
        ]);
    } catch (err) {
        logger.error("Failed to save event - " + err.message, " Event: ", event);
        throw err;
    }
}

async function removeEvent(event) {
    const deleteSql = `DELETE FROM ${EVENTS_TABLE} WHERE block=${event["blockNumber"]} AND txHash='${event["transactionHash"]}';`;
    try {
        return db.run(deleteSql);
    } catch (err) {
        logger.error("Failed to delete event - " + err.message, " Event: ", event);
        throw err;
    }
}

async function onProcessedEvent(event) {
    const updateSql = `UPDATE ${EVENTS_TABLE} SET processed=1 WHERE block=${event["blockNumber"]} AND txHash='${event["transactionHash"]}'`;
    try {
        return db.run(updateSql);
    } catch (err) {
        logger.error("Failed to update event - " + err.message, " Event: ", event);
        throw err;
    }
}

async function onGotNewBlock(blockHeader) {
    const minBlockNumber =
        blockHeader["number"] - process.env.ETH_MIN_CONFRIMATIONS;
    const filterSql = `SELECT body FROM ${EVENTS_TABLE} WHERE processed = 0 AND block <= ${minBlockNumber}`;
    const rows = await db.all(filterSql);

    // TODO

    // it will be better to use Promise all instead of for
    // /
    // const data = rows
    //   .map((r) => {
    //     const event = JSON.parse(item["body"]);
    //     return eventsInProgress.has(event["returnValues"]["msgId"])
    //       ? event
    //       : null;
    //   })
    //   .filter((r) => r);
    // await Promise.all(data.map((e) => processEvent(e)));
    // in that case tasks will run in parallel instead of one after another

    for (const item of rows) {
        const event = JSON.parse(item["body"]);
        if (eventsInProgress.has(event["returnValues"]["msgId"])) {
            continue;
        }
        await processEvent(event);
    }
}

function preprocessAmount(value) {
    if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
        const diff = process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS;
        // check that amount contains this count of zeros at the end
        const endedStr = "0".repeat(diff);
        if (value.endsWith(endedStr)) {
            // remove zeros
            return value.slice(0, -diff);
        }
    } else if (process.env.ETH_SIDE_DECIMALS < beam.BEAM_MAX_DECIMALS) {
        const diff = beam.BEAM_MAX_DECIMALS - process.env.ETH_SIDE_DECIMALS;
        return value.padEnd(value.length + diff, "0");
    } else { // process.env.ETH_SIDE_DECIMALS === beam.BEAM_MAX_DECIMALS
        return value;
    }
}

async function processEvent(event) {
    logger.info(
        "Processing of a new message has started. Message ID - ",
        event["returnValues"]["msgId"]
    );

    eventsInProgress.add(event["returnValues"]["msgId"]);
    try {
        let amount = preprocessAmount(event["returnValues"]["amount"]);
        let relayerFee = preprocessAmount(event["returnValues"]["relayerFee"]);

        if (amount === undefined) {
            throw new Error(`Unexpected amount. Amount = ${amount}`);
        }

        if (relayerFee === undefined) {
            throw new Error(`Unexpected relayer fee. relayerFee = ${relayerFee}`);
        }

        const result = await beam.bridgePushRemote(
            event["returnValues"]["msgId"],
            amount,
            event["returnValues"]["receiver"],
            relayerFee
        );

        if (!result) {
            throw new Error("Unexpected result of the beam.bridgePushRemote.");
        }

        if (result.isExist) {
            logger.info(
                "The message is exist in the Beam. Message ID - ",
                event["returnValues"]["msgId"]
            );
        } else {
            const txStatus = await beam.waitTx(result.txid);

            if (beam.TX_STATUS_FAILED == txStatus) {
                throw new Error("Invalid TX status.");
            }

            logger.info(
                "The message was successfully transferred to the Beam. Message ID - ",
                event["returnValues"]["msgId"]
            );
        }

        // Update event state
        await onProcessedEvent(event);
    } catch (err) {
        logger.error(
            `Failed to transfer message to the Beam. Message ID - ${event["returnValues"]["msgId"]}. ${err}`
        );
    } finally {
        eventsInProgress.delete(event["returnValues"]["msgId"]);
    }
}

async function getStartBlockFromDB() {
    try {
        const minUnprocessedBlockSql = `SELECT block FROM ${EVENTS_TABLE} WHERE processed=0 ORDER BY block ASC LIMIT 1;`;
        let row = await db.get(minUnprocessedBlockSql);
        if (!row) {
            const maxProcessedBlockSql = `SELECT block FROM ${EVENTS_TABLE} WHERE processed=1 ORDER BY block DESC LIMIT 1;`;
            row = await db.get(maxProcessedBlockSql);
        }
        return row["block"];
    } catch (err) {
        logger.error("Failed to get start block from DB - " + err.message);
        throw err;
    }
}

(async () => {
    // open the database
    db = await sqlite.open({
        filename: process.env.ETH2BEAM_DB_PATH,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        driver: sqlite3.Database,
    });

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} 
                            (block INTEGER NOT NULL
                            ,txHash TEXT NOT NULL
                            ,processed INTEGER NOT NULL DEFAULT 0
                            ,body TEXT NOT NULL,
                            UNIQUE(block,txHash));`;

    await db.exec(createTableSql);

    program.option("-b, --startBlock <number>", "start block");
    program.parse(process.argv);

    const options = program.opts();
    let startBlock = 0;

    if (options.startBlock !== undefined) {
        startBlock = options.startBlock;
    } else {
        try {
            startBlock = await getStartBlockFromDB();
        } catch (error) {
            logger.error("Failed to load startBlock - ", error);
        }
    }

    const web3ProviderOptions = {
        // Enable auto reconnection
        reconnect: {
            auto: true,
            delay: 5000, // ms
            maxAttempts: 5,
            onTimeout: false,
        },
    };
    let web3 = new Web3(
        new Web3.providers.WebsocketProvider(
            process.env.ETH_WEBSOCKET_PROVIDER,
            web3ProviderOptions
        )
    );
    const pipeContract = new web3.eth.Contract(
        PipeContract.abi,
        process.env.ETH_PIPE_CONTRACT_ADDRESS
    );

    // subscribe to Pipe.NewLocalMessage
    const eventSubscription = pipeContract.events
        .NewLocalMessage(
            {
                fromBlock: startBlock,
            },
            function (error, event) {
            }
        )
        .on("connected", function (subscriptionId) {
            logger.info(
                "Pipe.NewLocalMessage: successfully subcribed, subscription id: ",
                subscriptionId
            );
        })
        .on("data", async function (event) {
            logger.info("Got new event: ", event);
            await addEvent(event);
        })
        .on("changed", async function (event) {
            // remove event from local database
            logger.info("Event changed! ", event);
            await removeEvent(event);
        })
        .on("error", function (error, receipt) {
            // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
            logger.error("Error: ", error);
            if (receipt) {
                logger.info("receipt: ", receipt);
            }
        });

    const newBlockSubscription = web3.eth
        .subscribe("newBlockHeaders")
        .on("connected", function (subscriptionId) {
            logger.info(
                "newBlockHeaders: successfully subcribed, subscription id - ",
                subscriptionId
            );
        })
        .on("data", async function (blockHeader) {
            await onGotNewBlock(blockHeader);
        })
        .on("error", logger.error);

    // // unsubscribes the newBlockSubscription
    // newBlockSubscription.unsubscribe(function(error, success){
    //     if (success) {
    //         logger.info('Successfully unsubscribed!');
    //     }
    // });
})();
