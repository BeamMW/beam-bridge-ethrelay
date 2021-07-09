require('dotenv').config();

const pipe = require('./eth_Pipe_setRemote.js');
const pipeUser = require('./eth_PipeUser_setRemote.js');

(async () => {
    console.log("Start linking of bridges");
    
    await pipe.setRemote('0x' + process.env.BEAM_BRIDGE_CID);
    await pipeUser.setRemote('0x' + process.env.BEAM_BRIDGE_USER_CID);

    console.log("The bridges are successfully linked.")
})();