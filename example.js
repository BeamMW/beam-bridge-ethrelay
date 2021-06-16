require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const BN = Web3.utils.BN;
const RLP = require('rlp');
const keccak256 = require('keccak256');
const keccak512 = require('js-sha3').keccak512;
const Net = require('net');

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

const changeEndianness = (string) => {
    string = string.replace(/^0x/i, '');
    const result = [];
    let len = string.length - 2;
    while (len >= 0) {
      result.push(string.substr(len, 2));
      len -= 2;
    }
    return result.join('');
}

function generateSeed(block) {
    // look at https://github.com/pantos-io/ethrelay/blob/master/utils/utils.js
    let encoded = RLP.encode([
        block.parentHash,
        block.sha3Uncles,
        block.miner,
        block.stateRoot,
        block.transactionsRoot,
        block.receiptsRoot,
        block.logsBloom,
        new BN(block.difficulty),
        new BN(block.number),
        block.gasLimit,
        block.gasUsed,
        block.timestamp,
        block.extraData
    ]);
    let prePoWBlockHash = keccak256(encoded).toString('hex');
    let tmp = prePoWBlockHash + changeEndianness(block.nonce);
    
    return keccak512(Buffer.from(tmp, 'hex'));
}

function requestProof(number, seed) {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        let acc = '';
        
        client.connect(process.env.ETHASH_SERVICE_PORT, process.env.ETHASH_SERVICE_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'get_proof',
                    params: {
                        "epoch": number,
                        "seed": seed
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            acc += data;

            if (data.indexOf('\n') != -1) {
                let res = JSON.parse(acc);
                resolve([res['result']['proof'], res['result']['dataset_count']]);
                client.destroy();
            }
        });

        client.on('close', function() {
            console.log('Connection closed');
        });

        client.on('error', reject);
    });
};

(async () => {
    let pubkey = await beam.readPk();
    
    //console.log(pubkey);

    let blockHeight = await web3.eth.getBlockNumber();
    console.log('block height = ', blockHeight);

    let block = await web3.eth.getBlock(blockHeight);

    console.log('block = ', block);

    let seed = generateSeed(block);

    let epoch = Math.floor(block.number / 30000);
    //let seed2 = await beam.genearateSeed(block);
    let [proof, datasetCount] = await requestProof(epoch, seed);

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
