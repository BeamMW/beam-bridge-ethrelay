require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const ethash_utils = require('./utils/ethash_utils.js');
const Web3 = require('web3');

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
    let pubkey = await beam.readPk();
    
    //console.log(pubkey);

    let blockHeight = await web3.eth.getBlockNumber();
    console.log('block height = ', blockHeight);

    let block = await web3.eth.getBlock(blockHeight);

    console.log('block = ', block);

    let seed = ethash_utils.generateSeed(block);

    let epoch = Math.floor(block.number / 30000);
    //let seed2 = await beam.genearateSeed(block);
    let [proof, datasetCount] = await ethash_utils.requestProof(epoch, seed);

    console.log('epoch = ', epoch);
    console.log('seed = ', seed);
    //console.log('seed2 = ', seed2);
    //console.log('proof = ', proof);

    console.log('import message');
    let importMsgTxID = await beam.importMsg(4000000, pubkey, block, proof, datasetCount);
    await waitTx(importMsgTxID);

    console.log('finalize message');
    let finalizeMsgTxID = await beam.finalizeMsg();
    await waitTx(finalizeMsgTxID);

    console.log('mint coin');
    let unlockTxID = await beam.unlock();
    await waitTx(unlockTxID);
})();
