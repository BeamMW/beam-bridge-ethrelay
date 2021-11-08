//const Net = require('net');
const http = require('http');

const TX_STATUS_PENDING = 0;
const TX_STATUS_INPROGRESS = 1;
const TX_STATUS_CANCELED = 2;
const TX_STATUS_COMPLETED = 3;
const TX_STATUS_FAILED = 4;
const TX_STATUS_REGISTERING = 5;

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

        request.on('error', (err)=> {
            reject(err);
        });

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

const walletStatus = () => {
    return baseRequest(
        'wallet_status', 
        {},
        (data) => {
            return JSON.parse(data)['result'];
        }
    )
}

const bridgePushRemote = (msgId, amount, receiver, relayerFee) => {
    let args = 'action=push_remote,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    args += ',amount=' + amount;
    args += ',receiver=' + receiver;
    args += ',relayerFee=' + relayerFee;

    return baseShaderRequest(process.env.BEAM_PIPE_APP_PATH, args, (data) => {
        let res = JSON.parse(data);
        if (res.hasOwnProperty('error')) {
            // TODO roman.strilets need to check
            throw new Error(data);
        }

        let output = JSON.parse(res['result']['output']);
        let isExist = false;
        if (output.hasOwnProperty('error')) {
            if (output['error'] == 'msg is exist') {
                isExist = true;
            } else {
                // TODO roman.strilets need to check
                throw new Error(output['error']);
            }
        }

        return {isExist: isExist, txid: res['result']['txid']};
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

        if (status == TX_STATUS_COMPLETED || status == TX_STATUS_FAILED) {
            return status;
        }
        await sleep(15000);
    } while(true)
}

const getLocalMsgCount = () => {
    let args = 'action=local_msg_count,cid=' + process.env.BEAM_BRIDGE_CID;
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
    let args = 'role=manager,action=local_msg,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        args,
        (data) => {
            let res = JSON.parse(data);
            let output = JSON.parse(res['result']['output']);
            return {
                'receiver': output['receiver'],
                'amount': output['amount'],
                'relayerFee': output['relayerFee']
            };
        }
    );
};

module.exports = {
    getStatusTx,
    getBlockDetails,
    walletStatus,
    bridgePushRemote,
    getUserPubkey,
    waitTx,
    getLocalMsgCount,
    getLocalMsg,
    TX_STATUS_COMPLETED,
    TX_STATUS_FAILED
}