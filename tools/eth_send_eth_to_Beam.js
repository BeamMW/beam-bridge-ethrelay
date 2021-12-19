import dotenv from "dotenv";

dotenv.config();

import * as eth_utils from "./../utils/eth_utils.js";
import Web3 from "web3";
import PipeContract from "./../utils/EthPipeContractABI.js";
import program from "commander";


let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));

const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

program.option('-a, --amount <number>', 'amount to send', 5);
program.option('-f, --fee <number>', 'relayer fee', 0.1);

program.parse(process.argv);

const options = program.opts();

const lockEthereum = async (amount, pubkey, relayerFee) => {
    console.log('provider: ', process.env.ETH_HTTP_PROVIDER)
    console.log('sender: ', process.env.ETH_RELAYER_ADDRESS)
    const total = BigInt(amount) + BigInt(relayerFee);

    console.log(total);

    const lockTx = pipeContract.methods.sendFunds(amount.toString(), relayerFee.toString(), pubkey);

    const lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        lockTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT,
        total.toString());

    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const amount = web3.utils.toWei(options.amount.toString());
    const relayerFee = web3.utils.toWei(options.fee.toString());
    
    // lock Ethereums' on Ethereum chain
    await lockEthereum(amount, process.env.BEAM_PIPE_USER_PUBLIC_KEY, relayerFee);

    console.log("'sendFunds' is finished.")
})();