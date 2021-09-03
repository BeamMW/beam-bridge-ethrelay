require('dotenv').config();

const Web3 = require('web3');
const PipeContract = require('./../utils/Pipe.json');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeContract = new web3.eth.Contract(
    PipeContract.abi,
    process.env.ETH_PIPE_CONTRACT_ADDRESS
);

(async () => {
    console.log("Calling 'viewIncoming' of Pipe contract:");

    const result = await pipeContract.methods.viewIncoming().call({from: process.env.ETH_TOKEN_SENDER});

    if (result) {
        for (let i = 0; i < result[0].length; i++) {
            console.log("MsgID: ", result[0][i], " Amount: ", result[1][i]);
        }
    }

    console.log("'viewIncoming' is finished.")
})();
