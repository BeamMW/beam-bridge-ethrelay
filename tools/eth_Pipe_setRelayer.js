require('dotenv').config();

const Web3 = require('web3');
const eth_utils = require('./../utils/eth_utils.js');
const PipeContract = require('./../utils/EthPipeContractABI.js');
const {program} = require('commander');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const setRelayer = async (relayerAddress) => {
    const setRemoteTx = pipeContract.methods.setRelayer(relayerAddress);

    let receipt = await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER,
        process.env.ETH_PIPE_CONTRACT_ADDRESS,
        process.env.ETH_SENDER_PRIVATE_KEY,
        setRemoteTx.encodeABI(),
        // TODO roman.strilets change this parameter 
        process.env.PUSH_REMOTE_GAS_LIMIT);
    
    return receipt;
}

program.option('-r, --relayer <string>', 'relayer address');
program.parse(process.argv);
const options = program.opts();

if (require.main === module) {
    (async () => {
        console.log("Calling 'setRelayer' of Pipe contract:");
        const relayerAddress = options.relayer;

        let receipt = await setRelayer(relayerAddress);
    
        console.log("TX receipt: ", receipt);
        console.log("'setRelayer' is finished.")
    })();
}

module.exports = {
    setRelayer
}
