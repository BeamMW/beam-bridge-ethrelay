require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const fs = require('fs');
const {program} = require('commander');

const PipeContract = require('./utils/Pipe.json');
const SETTINGS_FILE = './eth2beam_settings.json';

let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_WEBSOCKET_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

// TODO roman.strilets 
function currentTime() {
    return "[" + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + "] ";
}

function saveSettings(value) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
            'startBlock': value
        }));
    } catch (error) {
        console.log(currentTime(), "Faield to save settings - ", error);
    }
}

program.option('-b, --startBlock <number>', 'start block');
program.parse(process.argv);

const options = program.opts();
let startBlock = 0;

if (options.startBlock !== undefined) {
    startBlock = options.startBlock;
    saveSettings(startBlock);
} else {
    try {
        let data = fs.readFileSync(SETTINGS_FILE);
        let obj = JSON.parse(data);
        startBlock = obj['startBlock'];
    } catch (error) {
        console.log(currentTime(), "Failed to load settings - ", error);
    }
}

// TOOD: switch to DB?
let events = new Map();

function addEvent(event) {
    if (!events.has(event['blockNumber'])) {
        events.set(event['blockNumber'], new Map());
    }
    events.get(event['blockNumber']).set(event['transactionHash'], event);
}

function removeEvent(event) {
    if (events.has(event['blockNumber'])) {
        events.get(event['blockNumber']).delete(event['transactionHash']);
    }
}

async function onGotNewBlock(blockHeader) {
    const minBlockNumber = blockHeader['number'] - process.env.ETH_MIN_CONFRIMATIONS;
    for (const blockNumber of events.keys()) {
        if (blockNumber <= minBlockNumber) {
            for (const event of events.get(blockNumber).values()) {
                processEvent(event);
            }
        }
    }
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
    saveSettings(event['blockNumber'] + 1);
}

// subscribe to Pipe.NewLocalMessage
pipeContract.events.NewLocalMessage({
    fromBlock: startBlock
}, function(error, event) { /*console.log(event);*/ })
.on("connected", function(subscriptionId) {
    console.log(currentTime(), 'Pipe.NewLocalMessage: successfully subcribed, subscription id: ', subscriptionId);
})
.on('data', function(event) {
    console.log(currentTime(), "Got new event: ", event);
    addEvent(event);
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
.on("data", function(blockHeader){
    onGotNewBlock(blockHeader);
})
.on("error", console.error);

// // unsubscribes the newBlockSubscription
// newBlockSubscription.unsubscribe(function(error, success){
//     if (success) {
//         console.log('Successfully unsubscribed!');
//     }
// });