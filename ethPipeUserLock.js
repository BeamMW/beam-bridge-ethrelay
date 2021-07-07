require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const Web3 = require('web3');
const BeamTokenContract = require('./utils/BeamToken.json');
const PipeUserContract = require('./utils/PipeUser.json');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const tokenContract = new web3.eth.Contract(
    BeamTokenContract.abi,
    process.env.TOKEN_CONTRACT
);
const pipeUserContract = new web3.eth.Contract(
    PipeUserContract.abi,
    process.env.ETH_PIPE_USER_CONTRACT_ADDRESS
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
    let createReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    //console.log('createReceipt: ', createReceipt);
    return createReceipt;
}

lockToken = async (value, pubkey) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.TOKEN_SENDER)
    const approveTx = tokenContract.methods.approve(process.env.ETH_PIPE_USER_CONTRACT_ADDRESS, value);
    const lockTx = pipeUserContract.methods.sendFunds(value, pubkey);

    await requestToContract(
        process.env.TOKEN_SENDER, 
        process.env.TOKEN_CONTRACT, 
        process.env.SENDER_PRIVATE_KEY, 
        approveTx.encodeABI());
    let lockTxReceipt = await requestToContract(
        process.env.TOKEN_SENDER, 
        process.env.ETH_PIPE_USER_CONTRACT_ADDRESS,
        process.env.SENDER_PRIVATE_KEY, 
        lockTx.encodeABI());

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of PipeUser contract:");
    const amount = 7000000;
    
    // get receiver's pubkey from Beam chain
    let pubkey = await beam.getUserPubkey();
    let pubkey_ = '0x' + pubkey;

    // lock 'tokens' on Ethereum chain
    let receipt = await lockToken(amount, pubkey_);

    console.log("recipient's pubkey: ", pubkey);
    console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();
