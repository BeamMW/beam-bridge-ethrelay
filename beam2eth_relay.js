require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');
const {program} = require('commander');

program.option('-m, --msgId <number>', 'start message id', 23);

program.parse(process.argv);

const options = program.opts();
let startMsgId = options.msgId;

async function monitorBridge() {
    let count = await beam.getLocalMsgCount();
    
    for (; startMsgId <= count; startMsgId++) {
        let localMsg = await beam.getLocalMsg(startMsgId);
        console.log("Processing of a new message has started. Message ID - ", startMsgId);
        //console.log('msg: ', localMsg);

        await eth.pushRemoteMessage(startMsgId, localMsg['sender'], localMsg['receiver'], localMsg['body']);
        //console.log('pushed message');
        let msgProof = await beam.getLocalMsgProof(startMsgId);
        //console.log('proof: ', msgProof);

        let blockDetails = await beam.getBlockDetails(msgProof['height']);
        //console.log('block details: ', blockDetails);

        await eth.validateRemoteMessage(startMsgId, msgProof['proof'], blockDetails);
        console.log("The message was successfully transferred to the Beam. Message ID - ", startMsgId);
    }

    setTimeout(monitorBridge, 15 * 1000);
}

(async () => {
    await monitorBridge();
})();
