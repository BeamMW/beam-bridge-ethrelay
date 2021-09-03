require('dotenv').config();

const pipe = require('./eth_Pipe_setRemote.js');

(async () => {
    console.log("Start linking of bridges");
    
    await pipe.setRemote('0x' + process.env.BEAM_BRIDGE_CID);

    console.log("The bridges are successfully linked.")
})();