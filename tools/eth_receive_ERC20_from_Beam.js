require('dotenv').config();

const eth_utils = require('./../utils/eth_utils.js');
const Web3 = require('web3');
const PipeContract = require('./../utils/Pipe.json');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const {program} = require('commander');

program.option('-m, --msgId <number>', 'message id', 1);

program.parse(process.argv);

const options = program.opts();

receiveToken = async (msgId) => {
    const receiveTx = pipeContract.methods.receiveFunds(msgId);

    let receiveTxReceipt = await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_SENDER_PRIVATE_KEY, 
        receiveTx.encodeABI());

    return receiveTxReceipt;
}

(async () => {
    console.log("Calling 'receiveFunds' of Pipe contract:");

    // receive 'tokens' on Ethereum chain from Beam msg
    const msgId = options.msgId;
    let receipt = await receiveToken(msgId);

    //console.log("TX receipt: ", receipt);
    console.log("'receiveFunds' is finished.")
})();
