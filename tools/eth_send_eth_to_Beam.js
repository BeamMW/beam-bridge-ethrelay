require('dotenv').config();

const eth_utils = require('./../utils/eth_utils.js');
const Web3 = require('web3');
const PipeContract = require('./../utils/EthPipeContractABI.js');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const {program} = require('commander');

program.option('-a, --amount <number>', 'amount of 10 Gwei to send', 500000000);
program.option('-f, --fee <number>', 'relayer fee of 10 Gwei', 100000000);

program.parse(process.argv);

const options = program.opts();

lockEthereum = async (amount, pubkey, relayerFee) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_SENDER)
    // convert to wei
    const total = web3.utils.toWei((10*(amount + relayerFee)).toString(), 'gwei');

    const lockTx = pipeContract.methods.sendFunds(amount.toString(), relayerFee.toString(), pubkey);

    let lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_SENDER,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_SENDER_PRIVATE_KEY,
        lockTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.PUSH_REMOTE_GAS_LIMIT,
        total);

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const amount = options.amount;
    const relayerFee = options.fee;

    // lock Ethereums' on Ethereum chain
    let receipt = await lockEthereum(amount, process.env.BEAM_PUBLIC_KEY, relayerFee);

    //console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();