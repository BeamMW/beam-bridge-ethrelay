require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const ethash_utils = require('./utils/ethash_utils.js');
const eth_utils = require('./utils/eth_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');
const fs = require('fs');

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
    } catch (e) {}
}

async function processEvent(event) {
    console.log(currentTime(), "Processing of a new message has started. Message ID - ", event["returnValues"]["msgId"]);

    let block = await web3.eth.getBlock(event['blockNumber']);
    //console.log('block = ', block);

    let pushRemoteTxID = await beam.bridgePushRemote(
        event["returnValues"]["msgId"],
        event["returnValues"]["msgContractReceiver"],
        event["returnValues"]["msgContractSender"],
        event["returnValues"]["amount"],
        event["returnValues"]["receiver"],
        block.number,
        block.timestamp);

    await beam.waitTx(pushRemoteTxID);

    let finalizeMsgTxID = await beam.finalizeRemoteMsg(event["returnValues"]["msgId"]);

    await beam.waitTx(finalizeMsgTxID);
    console.log(currentTime(), "The message was successfully transferred to the Beam. Message ID - ", event["returnValues"]["msgId"]);
    saveSettings(block.number + 1);
}

const {program} = require('commander');

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
    } catch (e) { }
}

// subscribe to Pipe.NewLocalMessage
pipeContract.events.NewLocalMessage({
    fromBlock: startBlock
}, function(error, event) { /*console.log(event);*/ })
.on("connected", function(subscriptionId) {
    console.log('subscription id: ', subscriptionId);
})
.on('data', function(event) {
    //console.log("New event: ", event);
    // TODO: wait enough confirmations?
    processEvent(event);
})
.on('changed', function(event) {
    // remove event from local database
    console.log("event changed!");
})
.on('error', function(error, receipt) { // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
    console.log("Error: ", error);
    if (receipt) {
        console.log("receipt: ", receipt);
    }
});
