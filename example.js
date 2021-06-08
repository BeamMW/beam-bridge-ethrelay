require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');
const keccak256 = require('keccak256');
const Net = require('net');

let web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8543'));

async function waitTx(txId) {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        let promise = beam.getStatusTx(txId);
        let result = await promise;
        let status = result['result']['status'];

        if (status == 3 || status == 4) break;
        await sleep(60000);
    } while(true)
}

function generateSeed(block) {
    let ls = [];

    ls.push(Buffer.from(block.parentHash, 'hex'));
    ls.push(Buffer.from(block.sha3Uncles, 'hex'));
    ls.push(Buffer.from(block.miner, 'hex'));
    ls.push(Buffer.from(block.stateRoot, 'hex'));
    ls.push(Buffer.from(block.transactionsRoot, 'hex'));
    ls.push(Buffer.from(block.receiptsRoot, 'hex'));
    ls.push(Buffer.from(block.logsBloom, 'hex'));
    ls.push(0 + block.totalDifficulty);
    ls.push(block.number);
    ls.push(block.gasLimit);
    ls.push(block.gasUsed);
    ls.push(block.timestamp);
    ls.push(Buffer.from(block.extraData, 'hex'));

    let encoded = RLP.encode(ls);
    return keccak256(encoded).toString('hex');
}

function requestProof(number, seed) {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        let acc = '';
        
        client.connect(30000, '127.0.0.1', () => {
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
                resolve(res['result']['proof']);
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
    let promise = beam.readPk();
    let result = await promise;
    
    //console.log(result);

    let blockHeight = await web3.eth.getBlockNumber();

    console.log('block height = ', blockHeight);

    let block = await web3.eth.getBlock(blockHeight);

    console.log('block = ', block);

    let seed = generateSeed(block);

    promise = requestProof(Math.floor(block.number / 30000), seed);
    let proof = await promise;

    console.log('import message')
    promise = beam.importMsg(4000000, result, block, proof);
    result = await promise;
    await waitTx(result);

    console.log('finalize message')
    promise = beam.finalizeMsg();
    result = await promise;
    await waitTx(result);

    console.log('mint coin')
    promise = beam.unlock();
    result = await promise;
    await waitTx(result);
})();
