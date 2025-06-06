import http from "http";

const TX_STATUS_PENDING = 0;
const TX_STATUS_INPROGRESS = 1;
const TX_STATUS_CANCELED = 2;
const TX_STATUS_COMPLETED = 3;
const TX_STATUS_FAILED = 4;
const TX_STATUS_REGISTERING = 5;

const BEAM_MAX_DECIMALS = 8;

function baseRequest(method, params, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        const options = {
            host: process.env.BEAM_WALLET_API_HOST,
            path: process.env.BEAM_WALLET_API_HTPP_PATH,
            port: process.env.BEAM_WALLET_API_PORT,
            method: 'POST',
            timeout: 5000,
        };

        const callback = (response) => {
            response.on('data', (chunk) => {
                accumulated += chunk;
            });

            response.on('end', () => {
                try {
                    resolve(processResult(accumulated));
                } catch (err) {
                    reject(err);
                }
            });

            response.on('error', reject);
        }

        let request = http.request(options, callback);

        request.on('error', (err) => {
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
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            return json;
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
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            return json['result'];
        }
    )
}

const walletStatus = () => {
    return baseRequest(
        'wallet_status',
        {},
        (data) => {
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            return json['result'];
        }
    )
}

const bridgePushRemote = (msgId, amount, receiver, relayerFee) => {
    const args = `action=push_remote,cid=${process.env.BEAM_PIPE_CID},msgId=${msgId},amount=${amount},receiver=${receiver},relayerFee=${relayerFee}`;

    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        args,
        (data) => {
            const res = JSON.parse(data);
            if (res.hasOwnProperty('error')) {
                // TODO roman.strilets need to check
                throw new Error(data);
            }

            const output = JSON.parse(res['result']['output']);
            let isExist = false;
            if (output.hasOwnProperty('error')) {
                if (output['error'] == 'msg is exist') {
                    isExist = true;
                } else {
                    // TODO roman.strilets need to check
                    throw new Error(output['error']);
                }
            }

            return { isExist: isExist, txid: res['result']['txid'] };
        }
    );
};

const getUserPubkey = () => {
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        `role=user,action=get_pk,cid=${process.env.BEAM_PIPE_CID}`,
        (data) => {
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            const output = JSON.parse(json['result']['output']);
            return output['pk'];
        }
    );
};

const waitTx = async (txId) => {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        // TODO roman.strilets maybe should process exception
        const result = await getStatusTx(txId);
        const status = result['result']['status'];

        if (status == TX_STATUS_COMPLETED || status == TX_STATUS_FAILED) {
            return status;
        }
        await sleep(15000);
    } while (true)
}

const getLocalMsgCount = () => {
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        `action=local_msg_count,cid=${process.env.BEAM_PIPE_CID}`,
        (data) => {
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            const output = JSON.parse(json['result']['output']);
            return output['count'];
        }
    );
};

const getLocalMsg = (msgId) => {
    return baseShaderRequest(
        process.env.BEAM_PIPE_APP_PATH,
        `role=manager,action=local_msg,cid=${process.env.BEAM_PIPE_CID},msgId=${msgId}`,
        (data) => {
            const json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            const output = JSON.parse(json['result']['output']);
            return {
                'receiver': output['receiver'],
                'amount': output['amount'],
                'relayerFee': output['relayerFee'],
                'height': output['height']
            };
        }
    );
};

export {
    baseShaderRequest,
    getStatusTx,
    getBlockDetails,
    walletStatus,
    bridgePushRemote,
    getUserPubkey,
    waitTx,
    getLocalMsgCount,
    getLocalMsg,
    TX_STATUS_COMPLETED,
    TX_STATUS_FAILED,
    BEAM_MAX_DECIMALS
}