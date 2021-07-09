require('dotenv').config();

const Web3 = require('web3');
const eth_utils = require('./../utils/eth_utils.js');
const PipeContract = require('./../utils/Pipe.json');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

const setRemote = async (remoteContractId) => {
    const setRemoteTx = pipeContract.methods.setRemote(remoteContractId);

    let receipt = await eth_utils.requestToContract(
        process.env.ETH_TOKEN_SENDER, 
        process.env.ETH_PIPE_CONTRACT_ADDRESS, 
        process.env.ETH_SENDER_PRIVATE_KEY, 
        setRemoteTx.encodeABI());
    
    return receipt;
}

(async () => {
    console.log("Calling 'setRemote' of Pipe contract:");
    
    let receipt = await setRemote('0x' + process.env.BEAM_BRIDGE_CID);

    console.log("TX receipt: ", receipt);
    console.log("'setRemote' is finished.")
})();
