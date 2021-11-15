const Web3 = require('web3');
const PipeContract = require('./EthPipeContractABI.js');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const requestToContract = async (sender, receiver, privateKey, abi, gasLimit) => {
    let nonce = await web3.eth.getTransactionCount(sender);
    let signedTx = await web3.eth.accounts.signTransaction({
        from: sender,
        to: receiver,
        data: abi,
        gas: gasLimit,
        nonce: nonce,
    }, privateKey);

    //console.log('signed tx: ', signedTx);
    try {
        let createReceipt = await web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
        );

        //console.log('createReceipt: ', createReceipt);
        return createReceipt;
    } catch (err) {
        console.log('requestToContract is failed');
        throw err;
    }
}

const processRemoteMessage = async (msgId, amount, receiver, relayerFee) => {
    const tmpReceiver = '0x' + receiver;
    const pushRemote = pipeContract.methods.processRemoteMessage(msgId, relayerFee, amount, tmpReceiver);

    await requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.ETH_SENDER_PRIVATE_KEY,
        pushRemote.encodeABI(),
        process.env.PUSH_REMOTE_GAS_LIMIT);
}

module.exports = {
    requestToContract,
    processRemoteMessage
}
