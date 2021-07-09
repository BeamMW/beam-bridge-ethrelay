const Web3 = require('web3');
const PipeContract = require('./Pipe.json');
const { GetAndVerify, VerifyProof } = require('eth-proof');
const { toBuffer } = require('eth-util-lite');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const requestToContract = async (sender, receiver, privateKey, abi) => {
    let nonce = await web3.eth.getTransactionCount(sender);
    let signedTx = await web3.eth.accounts.signTransaction({
        from: sender,
        to: receiver,
        data: abi,
        gas: 2000000,
        nonce: nonce,
    }, privateKey);
    let createReceipt = await web3.eth.sendSignedTransaction(
        signedTx.rawTransaction
    );

    //console.log('createReceipt: ', createReceipt);
    return createReceipt;
}

const getReceiptProof = async (untrustedTxHash, trustedBlockHash) => {
    let getAndVerify = new GetAndVerify(process.env.ETH_HTTP_PROVIDER);

    let resp = await getAndVerify.get.receiptProof(untrustedTxHash)
    let blockHashFromHeader = VerifyProof.getBlockHashFromHeader(resp.header)
    if(!toBuffer(trustedBlockHash).equals(blockHashFromHeader)) {
        throw new Error('BlockHash mismatch')
    }

    let receiptsRoot = VerifyProof.getReceiptsRootFromHeader(resp.header)
    let receiptsRootFromProof = VerifyProof.getRootFromProof(resp.receiptProof)

    if(!receiptsRoot.equals(receiptsRootFromProof)) {
        throw new Error('ReceiptsRoot mismatch')
    }

    return resp;
};

const pushRemoteMessage = async (msgId, msgContractSender, msgContractReceiver, messageBody) => {
    const contractSender = '0x' + msgContractSender;
    const contractReceiver = '0x' + msgContractReceiver;
    const body = '0x' + messageBody;
    const pushRemote = pipeContract.methods.pushRemoteMessage(msgId, contractSender, contractReceiver, body);

    await requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.ETH_SENDER_PRIVATE_KEY, 
        pushRemote.encodeABI());
}

const validateRemoteMessage = async (msgId, proof, blockDetails) => {
    const func = pipeContract.methods.validateRemoteMessage(
        msgId, 
        '0x' + blockDetails['previous_block'],
        '0x' + blockDetails['chainwork'],
        '0x' + blockDetails['kernels'],
        '0x' + blockDetails['definition'],
        blockDetails['height'],
        blockDetails['timestamp'],
        '0x' + blockDetails['pow'],
        '0x' + blockDetails['rules_hash'],
        '0x' + proof);

    await requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.ETH_SENDER_PRIVATE_KEY, 
        func.encodeABI());
}

module.exports = {
    requestToContract,
    getReceiptProof,
    pushRemoteMessage,
    validateRemoteMessage
}
