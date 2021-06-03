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

exports.readPk = () => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/bridge/app.wasm',
                        "args": 'role=manager,action=generatePK,cid=' + process.env.CID
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);


            resolve(output['pubkey']);
            client.destroy();
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
};

exports.importMsg = (amount, pubkey, block) => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();

        let params = ',amount=' + amount + ',pubkey=' + pubkey;
        params += ',parentHash=' + block.parentHash.substring(2);
        params += ',uncleHash=' + block.sha3Uncles.substring(2);
        params += ',coinbase=' + block.miner.substring(2);
        params += ',root=' + block.stateRoot.substring(2);
        params += ',txHash=' + block.transactionsRoot.substring(2);
        params += ',receiptHash=' + block.receiptsRoot.substring(2);
        params += ',bloom=' + block.logsBloom.substring(2);
        params += ',extra=' + block.extraData.substring(2);
        params += ',difficulty=' + block.totalDifficulty;
        params += ',number=' + block.number;
        params += ',gasLimit=' + block.gasLimit;
        params += ',gasUsed=' + block.gasUsed;
        params += ',time=' + block.timestamp;
        params += ',nonce=' + block.nonce.substring(2);
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/bridge/app.wasm',
                        "args": 'role=manager,action=importMsg,cid=' + process.env.CID + params
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            let res = JSON.parse(data);
            //console.log(res);
            resolve(res['result']['txid']);
            client.destroy();
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
};

exports.finalizeMsg = () => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/bridge/app.wasm',
                        "args": 'role=manager,action=finalizeMsg,cid=' + process.env.CID
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            let res = JSON.parse(data);
            //console.log(res);
            resolve(res['result']['txid']);
            client.destroy();
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
};

exports.unlock = () => {
    return new Promise((resolve, reject) => {
        let client = new Net.Socket();
        
        client.connect(process.env.BEAM_PORT, process.env.BEAM_HOST, () => {
            client.write(JSON.stringify(
                {
                    jsonrpc: '2.0',
                    id: 123,
                    method: 'invoke_contract',
                    params: {
                        "contract_file": 'shaders/bridge/app.wasm',
                        "args": 'role=manager,action=unlock,cid=' + process.env.CID
                    }
                }) + '\n');
        });

        client.on('data', function(data) {
            let res = JSON.parse(data);
            //console.log(res);
            resolve(res['result']['txid']);
            client.destroy();
        });

        client.on('close', function() {
            //console.log('Connection closed');
        });

        client.on('error', reject);
    });
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