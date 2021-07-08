const Web3 = require('web3');
const BeamTokenContract = require('./BeamToken.json');
const DummyContract = require('./DummyUser.json');
const PipeContract = require('./Pipe.json');
const { GetAndVerify, VerifyProof } = require('eth-proof');
const { toBuffer } = require('eth-util-lite');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const tokenContract = new web3.eth.Contract(
    BeamTokenContract.abi,
    process.env.TOKEN_CONTRACT
);
const dummyContract = new web3.eth.Contract(
    DummyContract.abi,
    process.env.DUMMY_USER
);
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

const sendMessages = (messages) => {
    var res = JSON.parse(messages);
    console.log(res);
}

const lockToken = async (value, pubkey) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.TOKEN_SENDER)
    const approveTx = tokenContract.methods.approve(process.env.DUMMY_USER, value);
    const lockTx = dummyContract.methods.lock(value, pubkey);

    await requestToContract(
        process.env.TOKEN_SENDER, 
        process.env.TOKEN_CONTRACT, 
        process.env.SENDER_PRIVATE_KEY, 
        approveTx.encodeABI());
    let lockTxReceipt = await requestToContract(
        process.env.TOKEN_SENDER, 
        process.env.DUMMY_USER,
        process.env.SENDER_PRIVATE_KEY, 
        lockTx.encodeABI());

    //console.log(lockTxReceipt);
    return lockTxReceipt;
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
        process.env.TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.SENDER_PRIVATE_KEY, 
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
        process.env.TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.SENDER_PRIVATE_KEY, 
        func.encodeABI());
}

module.exports = {
    requestToContract,
    sendMessages,
    lockToken,
    getReceiptProof,
    pushRemoteMessage,
    validateRemoteMessage
}
