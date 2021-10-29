require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const fs = require('fs');
const {program} = require('commander');
const sqlite3 = require('sqlite3')

const PipeContract = require('./utils/Pipe.json');

const EVENTS_TABLE = 'events';

let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_WEBSOCKET_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

// TODO roman.strilets 
function currentTime() {
    return "[" + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + "] ";
}

program.option('-b, --startBlock <number>', 'start block');
program.parse(process.argv);

const options = program.opts();
let startBlock = 0;

if (options.startBlock !== undefined) {
    startBlock = options.startBlock;
} else {
    // load min unprocessed block
    try {
        // TODO
    } catch (error) {
        console.log(currentTime(), "Failed to load startBlock - ", error);
    }
}

// open the database
let db = new sqlite3.Database('./eth2beam.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const createTableSql = `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} 
                        (block INTEGER NOT NULL
                        ,txHash TEXT NOT NULL
                        ,processed INTEGER NOT NULL DEFAULT 0
                        ,body TEXT NOT NULL);`;

db.run(createTableSql);

async function addEvent(event) {
    return new Promise((resolve, reject) => {
        const insertSql = `INSERT INTO ${EVENTS_TABLE} (block, txHash, body) VALUES(?,?,?);`;
        db.run(insertSql, [event['blockNumber'], event['transactionHash'], JSON.stringify(event)],
            function(err) {
                if (err) {
                    console.log("Failed to save event - " + err.message, ' Event: ', event);
                    reject(err);
                }
                resolve({"lastID": this.lastID, "changes": this.changes});
            }
        );
    });
}

async function removeEvent(event) {
    return new Promise((resolve, reject) => {
        const deleteSql = `DELETE FROM ${EVENTS_TABLE} WHERE block=${event['blockNumber']}
                            AND txHash='${event['transactionHash']}';`;
        db.run(deleteSql,
            function(err) {
                if (err) {
                    console.log("Failed to delete event - " + err.message, ' Event: ', event);
                    reject(err);
                }
                resolve({"lastID": this.lastID, "changes": this.changes});
            }
        );
    });
}

async function onProcessedEvent(event) {
    return new Promise((resolve, reject) => {
        const updateSql = `UPDATE ${EVENTS_TABLE} SET processed=1 WHERE block=${event['blockNumber']} AND txHash='${event['transactionHash']}'`;
        db.run(updateSql, function(err) {
                if (err) {
                    console.log("Failed to update event - " + err.message, ' Event: ', event);
                    reject(err);
                }
                resolve({"lastID": this.lastID, "changes": this.changes});
            }
        );
    });
}

async function onGotNewBlock(blockHeader) {
    let filter = async () => { return new Promise((resolve, reject) => {
            const minBlockNumber = blockHeader['number'] - process.env.ETH_MIN_CONFRIMATIONS;
            const sql = `SELECT body FROM ${EVENTS_TABLE} WHERE processed = 0 AND block <= ${minBlockNumber}`;

            db.all(sql, (err, rows) => {
                if (err) {
                    reject(err);
                }
                resolve(rows);
            });
        });
    }
    let rows = await filter();

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

    await beam.waitTx(pushRemoteTxID);

    console.log(currentTime(), "The message was successfully transferred to the Beam. Message ID - ", event["returnValues"]["msgId"]);
    
    // Update event state
    await onProcessedEvent(event);
}

// subscribe to Pipe.NewLocalMessage
pipeContract.events.NewLocalMessage({
    fromBlock: startBlock
}, function(error, event) { /*console.log(event);*/ })
.on("connected", function(subscriptionId) {
    console.log(currentTime(), 'Pipe.NewLocalMessage: successfully subcribed, subscription id: ', subscriptionId);
})
.on('data', async function(event) {
    console.log(currentTime(), "Got new event: ", event);
    await addEvent(event);
})
.on('changed', function(event) {
    // remove event from local database
    console.log(currentTime(), "Event changed! ", event);
    removeEvent(event);
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