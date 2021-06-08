const Net = require('net');

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

function baseFunction(args, processResult) {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        let accumulated = '';
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/bridge/app.wasm',
                        "args": args
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            accumulated += data;
            if (data.indexOf('\n') != -1) {
                resolve(processResult(accumulated));
                client.destroy();
            }
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
}

exports.readPk = () => {
    return baseFunction(
        'role=manager,action=generatePK,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['pubkey'];
        }
    );
};

exports.importMsg = (amount, pubkey, block, proof) => {
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
    args += ',difficulty=' + block.totalDifficulty;
    args += ',number=' + block.number;
    args += ',gasLimit=' + block.gasLimit;
    args += ',gasUsed=' + block.gasUsed;
    args += ',time=' + block.timestamp;
    args += ',nonce=' + block.nonce.substring(2);
    args += ',proof=' + proof;

    return baseFunction(args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

exports.finalizeMsg = () => {
    return baseFunction(
        'role=manager,action=finalizeMsg,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            return res['result']['txid'];
        }
    );
};

exports.unlock = () => {
    return baseFunction(
        'role=manager,action=unlock,cid=' + process.env.CID,
        (data) => {
            let res = JSON.parse(data);
            return res['result']['txid'];
        }
    );
};

exports.getStatusTx = (txId) => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'tx_status',
                    params: {
                        "txId": txId
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            let res = JSON.parse(data);
            //console.log(res);
            resolve(res);
            client.destroy();
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
};