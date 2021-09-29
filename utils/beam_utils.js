const Net = require('net');
const http = require('http');

function baseRequest(method, params, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        let options = {
            host: process.env.BEAM_HOST,
            path: process.env.BEAM_HTPP_API_PATH,
            port: process.env.BEAM_PORT,
            method: 'POST',
            timeout: 5000,
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
                method: method,
                params: params
            }) + '\n');

        request.end();
    });
}

function baseShaderRequest(contractFile, args, processResult) {
    return baseRequest(
        'invoke_contract',
        {
            "contract_file": contractFile,
            "args": args
        },
        processResult);
}

const getStatusTx = (txId) => {
    return baseRequest(
        'tx_status', 
        {
            txId: txId
        },
        (data) => {
            return JSON.parse(data);
        }
    )
}

const getBlockDetails = (height) => {
    return baseRequest(
        'block_details', 
        {
            height: height
        },
        (data) => {
            return JSON.parse(data)['result'];
        }
    )
}

const bridgePushRemote = (msgId, contractReceiver, contractSender, amount, receiver, blockHeight, blockTimestamp) => {
    let args = 'action=push_remote,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    args += ',contractReceiver=' + contractReceiver.substring(2);
    args += ',contractSender=' + contractSender.substring(2);
    args += ',amount=' + amount;
    args += ',receiver=' + receiver.substring(2);
    args += ',height=' + blockHeight;
    args += ',timestamp=' + blockTimestamp;

    return baseShaderRequest(process.env.BEAM_PIPE_APP_PATH, args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

const finalizeRemoteMsg = (msgId) => {
    let args = 'action=finalize_remote_msg,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    
    return baseShaderRequest(process.env.BEAM_PIPE_APP_PATH, args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

const getUserPubkey = () => {
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        'role=user,action=get_pk,cid=' + process.env.BEAM_BRIDGE_CID,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['pk'];
        }
    );
};

const waitTx = async (txId) => {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        let result = await getStatusTx(txId);
        let status = result['result']['status'];

        if (status == 3 || status == 4) break;
        await sleep(15000);
    } while(true)
}

const getLocalMsgCount = () => {
    let args = 'role=manager,action=getLocalMsgCount,cid=' + process.env.BEAM_BRIDGE_CID;
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        args,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return output['count'];
        }
    );
};

const getLocalMsg = (msgId) => {
    let args = 'role=manager,action=getLocalMsg,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
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

const getLocalMsgProof = (msgId) => {
    let args = 'role=manager,action=getLocalMsgProof,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        args,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return {
                'proof': output['Proof']['nodes'],
                'height': output['Proof']['height']
            };
        }
    );
};

module.exports = {
    getStatusTx,
    getBlockDetails,
    bridgePushRemote,
    finalizeRemoteMsg,
    getUserPubkey,
    waitTx,
    getLocalMsgCount,
    getLocalMsg,
    getLocalMsgProof
}