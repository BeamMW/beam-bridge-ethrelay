import Web3 from 'web3';
import PipeContract from "./EthPipeContractABI.js";

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

export const requestToContract = async (sender, receiver, privateKey, abi, gasLimit, total = 0) => {
    let nonce = await web3.eth.getTransactionCount(sender);
    let signedTx = await web3.eth.accounts.signTransaction({
        from: sender,
        to: receiver,
        data: abi,
        value: total,
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

export const processRemoteMessage = async (msgId, amount, receiver, relayerFee) => {
    const tmpReceiver = '0x' + receiver;
    const pushRemote = pipeContract.methods.processRemoteMessage(msgId, relayerFee, amount, tmpReceiver);

    await requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        pushRemote.encodeABI(),
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT);
}

