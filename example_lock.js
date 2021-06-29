require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth_utils = require('./utils/eth_utils.js');

(async () => {
    console.log("Calling 'Lock' of PipeUser contract:");
    const amount = 7000000;
    
    // get receiver's pubkey from Beam chain
    let pubkey = await beam.readPk();
    let pubkey_ = '0x' + pubkey;

    // lock 'tokens' on Ethereum chain
    let receipt = await eth_utils.lockToken(amount, pubkey_);

    console.log("recipient's pubkey: ", pubkey);
    console.log("TX receipt: ", receipt);
    console.log("'Lock' is finished.")
})();
