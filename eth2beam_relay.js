require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const fs = require('fs');
const {program} = require('commander');
const sqlite3 = require('sqlite3')
const sqlite = require('sqlite');

const PipeContract = require('./utils/Pipe.json');

const EVENTS_TABLE = 'events';
let db = undefined;

process.on('uncaughtException', function (error) {
    console.log(error.stack);
});

// TODO roman.strilets 
function currentTime() {
    return "[" + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + "] ";
}

async function addEvent(event) {
    const insertSql = `INSERT INTO ${EVENTS_TABLE} (block, txHash, body) VALUES(?,?,?);`;
    try {
        return await db.run(insertSql, [event['blockNumber'], event['transactionHash'], JSON.stringify(event)]);
    } catch (err) {
        console.log("Failed to save event - " + err.message, ' Event: ', event);
        throw err;
    }
}

async function removeEvent(event) {
    const deleteSql = `DELETE FROM ${EVENTS_TABLE} WHERE block=${event['blockNumber']} AND txHash='${event['transactionHash']}';`;
    try {
        return await db.run(deleteSql);
    } catch (err) {
        console.log("Failed to delete event - " + err.message, ' Event: ', event);
        throw err;
    }
}

async function onProcessedEvent(event) {
    const updateSql = `UPDATE ${EVENTS_TABLE} SET processed=1 WHERE block=${event['blockNumber']} AND txHash='${event['transactionHash']}'`;
    try {
       return await db.run(updateSql);
    } catch (err) {
        console.log("Failed to update event - " + err.message, ' Event: ', event);
        throw err;
    }
}

async function onGotNewBlock(blockHeader) {
    const minBlockNumber = blockHeader['number'] - process.env.ETH_MIN_CONFRIMATIONS;
    const filterSql = `SELECT body FROM ${EVENTS_TABLE} WHERE processed = 0 AND block <= ${minBlockNumber}`;
    let rows = await db.all(filterSql);

    // TODO
    rows.forEach(async (row) => {
        const event = JSON.parse(row['body']);
        await processEvent(event);
    });
}

async function processEvent(event) {
    console.log(currentTime(), "Processing of a new message has started. Message ID - ", event["returnValues"]["msgId"]);

    let pushRemoteTxID = await beam.bridgePushRemote(
        event["returnValues"]["msgId"],
        event["returnValues"]["amount"],
        event["returnValues"]["receiver"],
        event["returnValues"]["relayerFee"]);

    const txStatus = await beam.waitTx(pushRemoteTxID);
    
    if (beam.TX_STATUS_FAILED == txStatus) {
        console.log(currentTime(), `Failed to transfer message to the Beam. Message ID - ${event["returnValues"]["msgId"]}, txID - ${pushRemoteTxID}.`);
        return;
    }

    console.log(currentTime(), "The message was successfully transferred to the Beam. Message ID - ", event["returnValues"]["msgId"]);
    
    // Update event state
    await onProcessedEvent(event);
}

async function getMinUnprocessedBlock() {
    try {
        const sql = `SELECT block FROM ${EVENTS_TABLE} WHERE processed=0 ORDER BY block ASC LIMIT 1;`;
        const row = await db.get(sql);
        return row['block'];
    } catch (err) {
        console.log(currentTime(), "Failed to load min unprocessed block - " + err.message);
        throw err;
    }
}

(async () => {
    // open the database
    db = await sqlite.open({
        filename: './eth2beam.db',
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        driver: sqlite3.Database
    });

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} 
                            (block INTEGER NOT NULL
                            ,txHash TEXT NOT NULL
                            ,processed INTEGER NOT NULL DEFAULT 0
                            ,body TEXT NOT NULL);`;

    await db.exec(createTableSql);

    program.option('-b, --startBlock <number>', 'start block');
    program.parse(process.argv);

    const options = program.opts();
    let startBlock = 0;

    if (options.startBlock !== undefined) {
        startBlock = options.startBlock;
    } else {
        try {
            startBlock = await getMinUnprocessedBlock();
        } catch (error) {
            console.log(currentTime(), "Failed to load startBlock - ", error);
        }
    }

    let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_WEBSOCKET_PROVIDER));
    const pipeContract = new web3.eth.Contract(
        PipeContract.abi,
        process.env.ETH_PIPE_CONTRACT_ADDRESS
    );
    
    // subscribe to Pipe.NewLocalMessage
    let eventSubscription = pipeContract.events.NewLocalMessage({
        fromBlock: startBlock
    }, function(error, event) { /*console.log(event);*/ })
    .on("connected", function(subscriptionId) {
        console.log(currentTime(), 'Pipe.NewLocalMessage: successfully subcribed, subscription id: ', subscriptionId);
    })
    .on('data', async function(event) {
        console.log(currentTime(), "Got new event: ", event);
        await addEvent(event);
    })
    .on('changed', async function(event) {
        // remove event from local database
        console.log(currentTime(), "Event changed! ", event);
        await removeEvent(event);
    })
    .on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
        console.log("Error: ", error);
        if (receipt) {
            console.log("receipt: ", receipt);
        }
    });
    
    let newBlockSubscription = web3.eth.subscribe('newBlockHeaders')
    .on("connected", function(subscriptionId){
        console.log(currentTime(), 'newBlockHeaders: successfully subcribed, subscription id - ', subscriptionId);
    })
    .on("data", async function(blockHeader){
        await onGotNewBlock(blockHeader);
    })
    .on("error", console.error);
    
    // // unsubscribes the newBlockSubscription
    // newBlockSubscription.unsubscribe(function(error, success){
    //     if (success) {
    //         console.log('Successfully unsubscribed!');
    //     }
    // });
})();