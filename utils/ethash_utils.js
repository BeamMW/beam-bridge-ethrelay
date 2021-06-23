const Web3 = require('web3');
const BN = Web3.utils.BN;
const RLP = require('rlp');
const keccak256 = require('keccak256');
const keccak512 = require('js-sha3').keccak512;
const Net = require('net');

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

exports.generateSeed = (block) => {
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

exports.requestProof = (number, seed) => {
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
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
}