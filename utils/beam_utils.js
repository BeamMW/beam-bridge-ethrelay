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