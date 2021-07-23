const Net = require('net');
const http = require('http');

function baseRequest(method, params, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        let options = {
            host: process.env.BEAM_HOST,
            path: process.env.BEAM_HTPP_API_PATH,
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

const bridgePushRemote = (msgId, contractReceiver, contractSender, msgBody, block, powProof, datasetCount, txIndex, receiptProof) => {
    let args = 'role=manager,action=pushRemote,cid=' + process.env.BEAM_BRIDGE_CID;
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
    if (block.baseFeePerGas !== undefined) {
        args += ',baseFeePerGas=' + BigInt(block.baseFeePerGas).toString();
    }
    // POWProof
    args += ',powProof=' + powProof;
    args += ',datasetCount=' + datasetCount;
    // ReceiptProof
    args += ',txIndex=' + txIndex;
    args += ',receiptProof=' + receiptProof;

    let contractFile = process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm';
    return baseShaderRequest(contractFile, args, (data) => {
        let res = JSON.parse(data);
        return res['result']['txid'];
    });
};

const getUserPubkey = () => {
    return baseShaderRequest(
        process.env.BEAM_SHADERS_PATH + '/mirrortoken/app.wasm',
        'role=user,action=get_pk,cid=' + process.env.BEAM_BRIDGE_USER_CID,
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
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
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

const getLocalMsgProof = (msgId) => {
    let args = 'role=manager,action=getLocalMsgProof,cid=' + process.env.BEAM_BRIDGE_CID;
    args += ',msgId=' + msgId;
    return baseShaderRequest(
        process.env.BEAM_SHADERS_PATH + '/bridge/app.wasm',
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
    getUserPubkey,
    waitTx,
    getLocalMsgCount,
    getLocalMsg,
    getLocalMsgProof
}