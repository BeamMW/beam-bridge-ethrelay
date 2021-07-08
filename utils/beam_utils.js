const Net = require('net');
const http = require('http');

exports.readMessages = () => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/vault/app.wasm',
                        "args": 'role=my_account,action=view,cid=' + process.env.CID
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            resolve(data);
            client.destroy();
        });

        client.on('close', function() {
            console.log('Connection closed');
        });

        client.on('error', reject);
    });
};

function baseFunction(contractFile, args, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        let options = {
            host: process.env.BEAM_HOST,
            path: process.env.HTPP_API_PATH,
            port: process.env.BEAM_PORT,
            method: 'POST'
        };

        let callback = (response) => {
            response.on('data', (chunk) => {
                accumulated += chunk;
            });

            response.on('end', () => {
                resolve(processResult(accumulated));
            });

            response.on('error', reject);
        }

        let request = http.request(options, callback);

        request.write(JSON.stringify(
            {
                jsonrpc: '2.0',
                id: 123,
                method: 'invoke_contract',
                params: {
                    "contract_file": contractFile,
                    "args": args
                }
            }) + '\n');

        request.end();
    });
}

exports.readPk = () => {
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
        'role=manager,action=generatePK,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['pubkey'];
        }
    );
};

// TODO: use msg(event) as arg instead of amount, pubkey..
exports.importMsg = (amount, pubkey, block, proof, datasetCount, txIndex, receiptProof) => {
    let args = 'role=manager,action=importMsg,cid=' + process.env.CID;
    args += ',amount=' + amount + ',pubkey=' + pubkey;
    args += ',parentHash=' + block.parentHash.substring(2);
    args += ',uncleHash=' + block.sha3Uncles.substring(2);
    args += ',coinbase=' + block.miner.substring(2);
    args += ',root=' + block.stateRoot.substring(2);
    args += ',txHash=' + block.transactionsRoot.substring(2);
    args += ',receiptHash=' + block.receiptsRoot.substring(2);
    args += ',bloom=' + block.logsBloom.substring(2);
    args += ',extra=' + block.extraData.substring(2);
    args += ',difficulty=' + block.difficulty;
    args += ',number=' + block.number;
    args += ',gasLimit=' + block.gasLimit;
    args += ',gasUsed=' + block.gasUsed;
    args += ',time=' + block.timestamp;
    args += ',nonce=' + BigInt(block.nonce).toString();
    args += ',proof=' + proof;
    args += ',datasetCount=' + datasetCount;
    args += ',txIndex=' + txIndex;
    args += ',receiptProof=' + receiptProof;

    let contractFile = process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm';
    return baseFunction(contractFile, args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

exports.genearateSeed = (block) => {
    let args = 'role=manager,action=generateSeed';
    args += ',parentHash=' + block.parentHash.substring(2);
    args += ',uncleHash=' + block.sha3Uncles.substring(2);
    args += ',coinbase=' + block.miner.substring(2);
    args += ',root=' + block.stateRoot.substring(2);
    args += ',txHash=' + block.transactionsRoot.substring(2);
    args += ',receiptHash=' + block.receiptsRoot.substring(2);
    args += ',bloom=' + block.logsBloom.substring(2);
    args += ',extra=' + block.extraData.substring(2);
    args += ',difficulty=' + block.difficulty;
    args += ',number=' + block.number;
    args += ',gasLimit=' + block.gasLimit;
    args += ',gasUsed=' + block.gasUsed;
    args += ',time=' + block.timestamp;
    args += ',nonce=' + BigInt(block.nonce).toString();
    
    let contractFile = process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm';

    return baseFunction(contractFile, args, (data) => {
        let res = JSON.parse(data);
        let output = JSON.parse(res['result']['output']);
        return output['seed'];
    });
};

exports.finalizeMsg = () => {
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
        'role=manager,action=finalizeMsg,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            return res['result']['txid'];
        }
    );
};

exports.unlock = () => {
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
        'role=manager,action=unlock,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            return res['result']['txid'];
        }
    );
};

exports.getStatusTx = (txId) => {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        let options = {
            host: process.env.BEAM_HOST,
            path: process.env.HTPP_API_PATH,
            port: process.env.BEAM_PORT,
            method: 'POST'
        };

        let callback = (response) => {
            response.on('data', (chunk) => {
                accumulated += chunk;
            });

            response.on('end', () => {
                let res = JSON.parse(accumulated);
                resolve(res);
            });

            response.on('error', reject);
        }

        let request = http.request(options, callback);

        request.write(JSON.stringify(
            {
                jsonrpc: '2.0',
                id: 123,
                method: 'tx_status',
                params: {
                    "txId": txId
                }
            }) + '\n');

        request.end();
    });
};

exports.bridgePushRemote = (msgId, contractReceiver, contractSender, msgBody, block, powProof, datasetCount, txIndex, receiptProof) => {
    let args = 'role=manager,action=pushRemote,cid=' + process.env.CID;
    args += ',msgId=' + msgId;
    args += ',contractReceiver=' + contractReceiver.substring(2);
    args += ',contractSender=' + contractSender.substring(2);
    args += ',msgBody=' + msgBody.substring(2);
    // eth header
    args += ',parentHash=' + block.parentHash.substring(2);
    args += ',uncleHash=' + block.sha3Uncles.substring(2);
    args += ',coinbase=' + block.miner.substring(2);
    args += ',root=' + block.stateRoot.substring(2);
    args += ',txHash=' + block.transactionsRoot.substring(2);
    args += ',receiptHash=' + block.receiptsRoot.substring(2);
    args += ',bloom=' + block.logsBloom.substring(2);
    args += ',extra=' + block.extraData.substring(2);
    args += ',difficulty=' + block.difficulty;
    args += ',number=' + block.number;
    args += ',gasLimit=' + block.gasLimit;
    args += ',gasUsed=' + block.gasUsed;
    args += ',time=' + block.timestamp;
    args += ',nonce=' + BigInt(block.nonce).toString();
    // POWProof
    args += ',powProof=' + powProof;
    args += ',datasetCount=' + datasetCount;
    // ReceiptProof
    args += ',txIndex=' + txIndex;
    args += ',receiptProof=' + receiptProof;

    let contractFile = process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm';
    return baseFunction(contractFile, args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

exports.getUserPubkey = () => {
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/mirrortoken/app.wasm',
        'role=user,action=get_pk,cid=' + process.env.BEAM_PIPE_USER_CID,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['pk'];
        }
    );
};

exports.waitTx = async (txId) => {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        let result = await this.getStatusTx(txId);
        let status = result['result']['status'];

        if (status == 3 || status == 4) break;
        await sleep(15000);
    } while(true)
}

exports.getLocalMsgCount = () => {
    let args = 'role=manager,action=getLocalMsgCount,cid=' + process.env.BEAM_BRIDGE_CID;
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
        args,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['count'];
        }
    );
};

exports.getLocalMsg = (msgId) => {
    let args = 'role=manager,action=getLocalMsg,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    return baseFunction(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
        args,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return {
                'sender': output['sender'],
                'receiver': output['receiver'],
                'body': output['body']
            };
        }
    );
};