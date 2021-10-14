require('dotenv').config();

const beam = require('./../utils/beam_utils.js');
const eth_utils = require('./../utils/eth_utils.js');
const Web3 = require('web3');
const PipeContract = require('./../utils/Pipe.json');
const ERC20Abi = require("human-standard-token-abi");

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const tokenContract = new web3.eth.Contract(
    ERC20Abi,
    process.env.ETH_TOKEN_CONTRACT
);
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const {program} = require('commander');

program.option('-a, --amount <number>', 'amount of tokens to send', 5000000000);
program.option('-f, --fee <number>', 'relayer fee', 100000000);

program.parse(process.argv);

const options = program.opts();

lockToken = async (amount, pubkey, relayerFee) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_TOKEN_SENDER)
    const approveTx = tokenContract.methods.approve(process.env.ETH_PIPE_CONTRACT_ADDRESS, amount + relayerFee);
    const lockTx = pipeContract.methods.sendFunds(amount, relayerFee, pubkey);

    await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_TOKEN_CONTRACT, 
        process.env.ETH_SENDER_PRIVATE_KEY, 
        approveTx.encodeABI());
    let lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_SENDER_PRIVATE_KEY, 
        lockTx.encodeABI());

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const amount = options.amount;
    const relayerFee = options.fee;

    // lock 'tokens' on Ethereum chain
    let receipt = await lockToken(amount, process.env.BEAM_PUBLIC_KEY, relayerFee);

    //console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();
