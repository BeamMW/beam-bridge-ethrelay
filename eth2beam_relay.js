require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const ethash_utils = require('./utils/ethash_utils.js');
const eth_utils = require('./utils/eth_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');

const PipeContract = require('./utils/Pipe.json');

let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_WEBSOCKET_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

async function processEvent(event) {
    console.log("Processing of a new message has started. Message ID - ", event["returnValues"]["msgId"]);

    let txHash = event["transactionHash"];
    let blockHash = event["blockHash"];
    let receiptProofData = await eth_utils.getReceiptProof(txHash, blockHash);
    //console.log("ReceiptProof: ", receiptProofData.receiptProof.hex);

    let block = await web3.eth.getBlock(event['blockNumber']);
    //console.log('block = ', block);

    let [powProof, powDatasetCount] = await ethash_utils.GetPOWProof(block);

    let pushRemoteTxID = await beam.bridgePushRemote(
        event["returnValues"]["msgId"],
        event["returnValues"]["msgContractReceiver"],
        event["returnValues"]["msgContractSender"],
        event["returnValues"]["msgBody"],
        block, 
        powProof, 
        powDatasetCount, 
        RLP.encode(parseInt(receiptProofData.txIndex)).toString('hex'),
        receiptProofData.receiptProof.hex.substring(2));

    await beam.waitTx(pushRemoteTxID);
    console.log("The message was successfully transferred to the Beam. Message ID - ", event["returnValues"]["msgId"]);
}

const {program} = require('commander');

program.option('-b, --startBlock <number>', 'start block', 0);

program.parse(process.argv);

const options = program.opts();

// subscribe to Pipe.NewLocalMessage
pipeContract.events.NewLocalMessage({
    fromBlock: options.startBlock
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
