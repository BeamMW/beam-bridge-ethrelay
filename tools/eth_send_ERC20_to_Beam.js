require('dotenv').config();

const eth_utils = require('./../utils/eth_utils.js');
const Web3 = require('web3');
const PipeContract = require('./../utils/EthPipeContractABI.js');
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

const { program } = require('commander');

program.option('-a, --amount <number>', 'amount of tokens to send', 200);
program.option('-f, --fee <number>', 'relayer fee', 10);

program.parse(process.argv);

const options = program.opts();

lockToken = async (amount, pubkey, relayerFee) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_RELAYER_ADDRESS)
    const approveTx = tokenContract.methods.approve(process.env.ETH_PIPE_CONTRACT_ADDRESS, amount + relayerFee);
    const lockTx = pipeContract.methods.sendFunds(amount, relayerFee, pubkey);

    await eth_utils.requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_TOKEN_CONTRACT,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        approveTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT);
    let lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        lockTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT);

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const multiplier = BigInt(Math.pow(10, process.env.ETH_SIDE_DECIMALS));
    const amount = BigInt(options.amount) * multiplier;
    const relayerFee = BigInt(options.fee) * multiplier;

    // lock 'tokens' on Ethereum chain
    let receipt = await lockToken(amount, process.env.BEAM_PIPE_USER_PUBLIC_KEY, relayerFee);

    //console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();
