import dotenv from "dotenv";

dotenv.config();

import * as eth_utils from "./../utils/eth_utils.js";
import Web3 from "web3";
import PipeContract from "./../utils/EthPipeContractABI.js";

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const { program } = require('commander');

program.option('-a, --amount <number>', 'amount of 10 Gwei to send', 500000000);
program.option('-f, --fee <number>', 'relayer fee of 10 Gwei', 100000000);

program.parse(process.argv);

const options = program.opts();

lockEthereum = async (amount, pubkey, relayerFee) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_RELAYER_ADDRESS)
    // convert to wei
    const total = web3.utils.toWei((10 * (amount + relayerFee)).toString(), 'gwei');

    const lockTx = pipeContract.methods.sendFunds(amount.toString(), relayerFee.toString(), pubkey);

    let lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        lockTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT,
        total);

    //console.log(lockTxReceipt);
    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const amount = options.amount;
    const relayerFee = options.fee;

    // lock Ethereums' on Ethereum chain
    let receipt = await lockEthereum(amount, process.env.BEAM_PIPE_USER_PUBLIC_KEY, relayerFee);

    //console.log("TX receipt: ", receipt);
    console.log("'sendFunds' is finished.")
})();