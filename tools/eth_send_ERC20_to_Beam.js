import dotenv from "dotenv";

dotenv.config();

import * as eth_utils from "./../utils/eth_utils.js";
import Web3 from "web3";
import PipeContract from "./../utils/EthPipeContractABI.js";
import ERC20Abi from "human-standard-token-abi";
import program from "commander";

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const tokenContract = new web3.eth.Contract(
    ERC20Abi,
    process.env.ETH_TOKEN_CONTRACT
);
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

program.option('-a, --amount <number>', 'amount of tokens to send', 200);
program.option('-f, --fee <number>', 'relayer fee', 10.123456);

program.parse(process.argv);

const options = program.opts();

let lockToken = async (amount, pubkey, relayerFee) => {
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
    const lockTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_RELAYER_ADDRESS,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_RELAYER_PRIVATE_KEY,
        lockTx.encodeABI(),
        // TODO roman.strilets change this parameter
        process.env.ETH_PIPE_PUSH_REMOTE_GAS_LIMIT);

    return lockTxReceipt;
}

(async () => {
    console.log("Calling 'sendFunds' of Pipe contract:");
    const decimals = 6;
    const multiplier = BigInt(Math.pow(10, process.env.ETH_SIDE_DECIMALS - decimals));
    const amount = BigInt(Math.trunc(options.amount * Math.pow(10, decimals))) * multiplier;
    const relayerFee = BigInt(Math.trunc(options.fee * Math.pow(10, decimals))) * multiplier;

    // lock 'tokens' on Ethereum chain
    await lockToken(amount, process.env.BEAM_PIPE_USER_PUBLIC_KEY, relayerFee);

    console.log("'sendFunds' is finished.")
})();
