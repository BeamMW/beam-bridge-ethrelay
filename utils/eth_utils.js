import Web3 from 'web3';
import PipeContract from "./EthPipeContractABI.js";
import logger from "./../logger.js"

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

export const requestToContract = async (sender, receiver, privateKey, abi, gasLimit, total = 0) => {
    const nonce = await web3.eth.getTransactionCount(sender);
    const signedTx = await web3.eth.accounts.signTransaction({
        from: sender,
        to: receiver,
        data: abi,
        value: total,
        gas: gasLimit,
        nonce: nonce,
    }, privateKey);

    try {
        return web3.eth.sendSignedTransaction(
            signedTx.rawTransaction
        );
    } catch (err) {
        logger.error(`requestToContract is failed`);
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

