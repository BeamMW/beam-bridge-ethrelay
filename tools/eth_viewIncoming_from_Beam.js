require('dotenv').config();

const Web3 = require('web3');
const PipeUserContract = require('./../utils/PipeUser.json');

let web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
const pipeUserContract = new web3.eth.Contract(
    PipeUserContract.abi,
    process.env.ETH_PIPE_USER_CONTRACT_ADDRESS
);

(async () => {
    console.log("Calling 'viewIncoming' of PipeUser contract:");

    const result = await pipeUserContract.methods.viewIncoming().call({from: process.env.ETH_TOKEN_SENDER});

    if (result) {
        for (let i = 0; i < result[0].length; i++) {
            console.log("MsgID: ", result[0][i], " Amount: ", result[1][i]);
        }
    }

    console.log("'viewIncoming' is finished.")
})();
