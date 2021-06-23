require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const ethash_utils = require('./utils/ethash_utils.js');
const eth_utils = require('./utils/eth_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));

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

(async () => {
    const amount = 7000000;
    let pubkey = await beam.readPk();
    let pubkey_ = '0x' + pubkey;
    let receipt = await eth_utils.lockToken(amount, pubkey_);

    console.log(pubkey);
    let resp = await eth_utils.getReceiptProof(receipt['transactionHash'], receipt['blockHash']);

    //console.log('receipt proof: ', resp);
    console.log("ReceiptProof: ", resp.receiptProof.hex);

    let blockHeight = receipt['blockNumber']; //await web3.eth.getBlockNumber();
    console.log('block height = ', blockHeight);

    let block = await web3.eth.getBlock(blockHeight);

    console.log('block = ', block);

    let seed = ethash_utils.generateSeed(block);

    let epoch = Math.floor(block.number / 30000);
    let [proof, datasetCount] = await ethash_utils.requestProof(epoch, seed);

    console.log('epoch = ', epoch);
    console.log('seed = ', seed);
    console.log('import message');

    let importMsgTxID = await beam.importMsg(
        amount,
        pubkey,
        block, 
        proof, 
        datasetCount, 
        RLP.encode(parseInt(resp.txIndex)).toString('hex'),
        resp.receiptProof.hex.substring(2));

    await waitTx(importMsgTxID);

    console.log('finalize message');
    let finalizeMsgTxID = await beam.finalizeMsg();
    await waitTx(finalizeMsgTxID);

    console.log('mint coin');
    let unlockTxID = await beam.unlock();
    await waitTx(unlockTxID);
})();
