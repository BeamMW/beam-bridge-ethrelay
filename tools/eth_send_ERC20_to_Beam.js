require('dotenv').config();

const beam = require('./../utils/beam_utils.js');
const eth_utils = require('./../utils/eth_utils.js');
const Web3 = require('web3');
const PipeUserContract = require('./../utils/PipeUser.json');
const ERC20Abi = require("human-standard-token-abi");

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const tokenContract = new web3.eth.Contract(
    ERC20Abi,
    process.env.ETH_TOKEN_CONTRACT
);
const pipeUserContract = new web3.eth.Contract(
    PipeUserContract.abi,
    process.env.ETH_PIPE_USER_CONTRACT_ADDRESS
);

const {program} = require('commander');

program.option('-a, --amount <number>', 'amount of tokens to send', 7000000);

program.parse(process.argv);

const options = program.opts();

lockToken = async (value, pubkey) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_TOKEN_SENDER)
    const approveTx = tokenContract.methods.approve(process.env.ETH_PIPE_USER_CONTRACT_ADDRESS, value);
    const lockTx = pipeUserContract.methods.sendFunds(value, pubkey);

    await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_TOKEN_CONTRACT, 
        process.env.ETH_SENDER_PRIVATE_KEY, 
        approveTx.encodeABI());
    let lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_USER_CONTRACT_ADDRESS,
        process.env.ETH_SENDER_PRIVATE_KEY, 
        lockTx.encodeABI());

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of PipeUser contract:");
    const amount = options.amount;

    // lock 'tokens' on Ethereum chain
    let receipt = await lockToken(amount, process.env.BEAM_PUBLIC_KEY);

    //console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();