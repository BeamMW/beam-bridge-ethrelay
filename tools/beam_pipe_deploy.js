require('dotenv').config();
let exec = require('child_process').execFile;
const beam = require('./../utils/beam_utils.js');
const {program} = require('commander');

/**
 * Function to execute exe
 * @param {string} fileName The name of the executable file to run.
 * @param {string[]} params List of string arguments.
 * @param {string} path Current working directory of the child process.
 */
function execute(fileName, params, path) {
    let promise = new Promise((resolve, reject) => {
        exec(fileName, params, { cwd: path }, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });

    });
    return promise;
}

const commonParams = process.env.WALLET_ADDITIONAL_PARAMS ? [
    `--node_addr=${process.env.NODE_ADDR}`,
    `--wallet_path=${process.env.WALLET_DB_PATH}`,
    `--pass=${process.env.WALLET_PASS}`,
    ...process.env.WALLET_ADDITIONAL_PARAMS.split(';')
] : [
    `--node_addr=${process.env.NODE_ADDR}`,
    `--wallet_path=${process.env.WALLET_DB_PATH}`,
    `--pass=${process.env.WALLET_PASS}`
];

async function walletListen(fileName, path, duration = 5000) {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    const params = commonParams.concat(['listen']);

    let promise = new Promise(async (resolve, reject) => {
        let wallet = exec(fileName, params, { cwd: path }, (err, data) => {
            // TODO: check error
            resolve(data);
        });
        await sleep(duration);
        wallet.kill(2);
    });
    return promise;
}

async function deployToken(tokenName) {
    await walletListen(process.env.WALLET_CLI_PATH, process.env.WALLET_CLI_WORK_DIR);

    let params = commonParams.concat([
        `shader`,
        `--shader_app_file=${process.env.TOKEN_APP_PATH}`,
        `--shader_args=action=create,metadata=STD:SCH_VER=1;N=${tokenName} Coin;SN=${tokenName};UN=${tokenName};NTHUN=AGROTH`,
        `--shader_contract_file=${process.env.TOKEN_CONTRACT_PATH}`
    ]);

    return execute(process.env.WALLET_CLI_PATH, params, process.env.WALLET_CLI_WORK_DIR);
}

async function deployPipe(tokenCID, aid) {
    await walletListen(process.env.WALLET_CLI_PATH, process.env.WALLET_CLI_WORK_DIR);

    let params = commonParams.concat([
        `shader`,
        `--shader_app_file=${process.env.PIPE_APP_PATH}`,
        `--shader_args=action=create,tokenCID=${tokenCID},tokenAID=${aid}`,
        `--shader_contract_file=${process.env.PIPE_CONTRACT_PATH}`
    ]);

    return execute(process.env.WALLET_CLI_PATH, params, process.env.WALLET_CLI_WORK_DIR);
}

function getLastCID(shader_app) {
    return beam.baseShaderRequest(
        shader_app,
        'action=view',
        (data) => {
            let json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }

            let output = JSON.parse(json['result']['output']);
            if ('contracts' in output && output['contracts'].length) {
                let contracts = output['contracts'];
                let maxHeight = contracts[0]['Height'];
                let result = contracts[0]['cid'];
                for (const contract of contracts) {
                    if (contract['Height'] > maxHeight) {
                        maxHeight = contract['Height'];
                        result = contract['cid'];
                    }
                }
                return result;
            }
            return '';
        }
    );
}

async function shaderRequestWithTX(shader_app, args) {
    let txid = await beam.baseShaderRequest(
        shader_app,
        args,
        (data) => {
            let json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }
            return json['result']['txid']
        }
    );

    const txStatus = await beam.waitTx(txid);
        
    if (beam.TX_STATUS_FAILED == txStatus) {
        throw new Error('Invalid TX status, txid - ' + txid)
    }
}
 
async function initTokenOwnerPublicKey(tokenCID) {
    let args = 'action=init,cid=' + tokenCID;
    await shaderRequestWithTX(process.env.API_TOKEN_APP_PATH, args);
}

function getTokenAssetID(tokenCID) {
    let args = 'action=get_aid,cid=' + tokenCID;
    return beam.baseShaderRequest(
        process.env.API_TOKEN_APP_PATH,
        args,
        (data) => {
            let json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }
            
            let output = JSON.parse(json['result']['output']);
            return output['aid'];
        }
    );
}

async function changeTokenManager(tokenCID, manager) {
    let args = `action=change_manager,cid=${tokenCID},manager=${manager}`;
    await shaderRequestWithTX(process.env.API_TOKEN_APP_PATH, args);
}

function getPipePublicKey(pipeCID) {
    let args = 'action=get_pk,cid=' + pipeCID;
    return beam.baseShaderRequest(
        process.env.API_PIPE_APP_PATH,
        args,
        (data) => {
            let json = JSON.parse(data);

            if (json.hasOwnProperty('error')) {
                throw new Error(data);
            }
            
            let output = JSON.parse(json['result']['output']);
            return output['pk'];
        }
    );
}

async function setPipeRelayer(pipeCID, relayer) {
    let args = `action=set_relayer,cid=${pipeCID},relayer=${relayer}`;
    await shaderRequestWithTX(process.env.API_PIPE_APP_PATH, args);
}

(async () => {
    program.option('-t, --token <string>', 'Token name', 'bTOKEN');
    program.parse(process.argv);

    const options = program.opts();

    console.log('Start');
    // 1) deploy new Token
    let result = await deployToken(options.token);

    if (result.indexOf('Transaction completed') == -1) {
        throw new Error("Failed to deploy token!");
    }

    // 2) get last token cid
    let tokenCID = await getLastCID(process.env.API_TOKEN_APP_PATH);

    if (!tokenCID) {
        throw new Error("Failed to get tokenCID")
    }
    console.log("TokenCID: " + tokenCID);

    // 3) init owner publicKey for the token contract 
    await initTokenOwnerPublicKey(tokenCID);

    // 4) get asset id for the token contract
    let aid = await getTokenAssetID(tokenCID);
    console.log("AID: " + aid);

    // 5) deploy pipe
    result = await deployPipe(tokenCID, aid);

    if (result.indexOf('Transaction completed') == -1) {
        throw new Error("Failed to deploy pipe!");
    }

    // 6) get CID of the pipe
    let pipeCID = await getLastCID(process.env.API_PIPE_APP_PATH);
    if (!pipeCID) {
        throw new Error("Failed to get pipeCID")
    }
    console.log("PipeCID: " + pipeCID);

    // 7) setup manager of the Token 
    await changeTokenManager(tokenCID, pipeCID);

    // 8) generate relayer's publicKey
    let relayerPublicKey = await getPipePublicKey(pipeCID);
    if (!relayerPublicKey) {
        throw new Error("Failed to get relayerPublicKey")
    }
    console.log("relayerPublicKey: " + relayerPublicKey);

    // 9) setup new relayer for the Pipe
    await setPipeRelayer(pipeCID, relayerPublicKey);

    console.log('End.')
})();