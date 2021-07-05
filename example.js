require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const ethash_utils = require('./utils/ethash_utils.js');
const eth_utils = require('./utils/eth_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');

const PipeUserContract = require('./utils/DummyUser.json');

let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.ETH_WEBSOCKET_PROVIDER));

const pipeUserContract = new web3.eth.Contract(
    PipeUserContract.abi,
    process.env.DUMMY_USER
);

async function waitTx(txId) {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        let promise = beam.getStatusTx(txId);
        let result = await promise;
        let status = result['result']['status'];

        if (status == 3 || status == 4) break;
        await sleep(15000);
    } while(true)
}

async function processEvent(event) {
    let txHash = event["transactionHash"];
    let blockHash = event["blockHash"];

    let receiptProofData = await eth_utils.getReceiptProof(txHash, blockHash);
    console.log("ReceiptProof: ", receiptProofData.receiptProof.hex);

    let block = await web3.eth.getBlock(event['blockNumber']);
    console.log('block = ', block);

    let [powProof, powDatasetCount] = await ethash_utils.GetPOWProof(block);

    let importMsgTxID = await beam.importMsg(
        event["returnValues"]["value"],
        event["returnValues"]["pubKey"],
        block, 
        powProof, 
        powDatasetCount, 
        RLP.encode(parseInt(receiptProofData.txIndex)).toString('hex'),
        receiptProofData.receiptProof.hex.substring(2));

    await waitTx(importMsgTxID);

    console.log('finalize message');
    let finalizeMsgTxID = await beam.finalizeMsg();
    await waitTx(finalizeMsgTxID);

    console.log('mint coin');
    let unlockTxID = await beam.unlock();
    await waitTx(unlockTxID);
    console.log('finished');
}

// subscribe to lockEvent
pipeUserContract.events.lockEvent({
    //fromBlock: 45345
}, function(error, event) { console.log(event); })
.on("connected", function(subscriptionId) {
    console.log(subscriptionId);
})
.on('data', function(event) {
    console.log("New event: ", event);
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
