require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const RLP = require('rlp');
const keccak256 = require('keccak256');
const keccak512 = require('js-sha3').keccak512;
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
    let ls = [];
    
    ls.push(block.parentHash);
    ls.push(block.sha3Uncles);
    ls.push(block.miner);
    ls.push(block.stateRoot);
    ls.push(block.transactionsRoot);
    ls.push(block.receiptsRoot);
    ls.push(block.logsBloom);
    ls.push(web3.utils.toHex(0 + block.difficulty));
    ls.push(web3.utils.toHex(block.number));
    ls.push(web3.utils.toHex(block.gasLimit));
    ls.push(web3.utils.toHex(block.gasUsed));
    ls.push(web3.utils.toHex(block.timestamp));
    ls.push(block.extraData);

    let encoded = RLP.encode(ls);
    let prePoWBlockHash = keccak256(encoded).toString('hex');
    let tmp = prePoWBlockHash + changeEndianness(block.nonce);
    
    return keccak512(Buffer.from(tmp, 'hex'));
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
    let promise = beam.readPk();
    let result = await promise;
    
    //console.log(result);

    let blockHeight = await web3.eth.getBlockNumber();
    console.log('block height = ', blockHeight);

    let block = await web3.eth.getBlock(blockHeight);

    console.log('block = ', block);

    //let seed = generateSeed(block);

    let epoch = Math.floor(block.number / 30000);

    promise = beam.genearateSeed(block);
    let seed = await promise;

    promise = requestProof(epoch, seed);
    let [proof, datasetCount] = await promise;

    console.log('epoch = ', epoch);
    console.log('seed = ', seed);
    //console.log('proof = ', proof);

    console.log('import message')
    promise = beam.importMsg(4000000, result, block, proof, datasetCount);
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
