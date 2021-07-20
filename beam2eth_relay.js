require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');

let startMsgId = 1;

async function monitorBridge() {
    let count = await beam.getLocalMsgCount();
    console.log('count = ', count);

    for (; startMsgId <= count; startMsgId++) {
        let localMsg = await beam.getLocalMsg(count);
        console.log('msg: ', localMsg);

        await eth.pushRemoteMessage(count, localMsg['sender'], localMsg['receiver'], localMsg['body']);
        console.log('pushed message');
        let msgProof = await beam.getLocalMsgProof(count);
        console.log('proof: ', msgProof);

        let blockDetails = await beam.getBlockDetails(msgProof['height']);
        console.log('block details: ', blockDetails);

        await eth.validateRemoteMessage(startMsgId, msgProof['proof'], blockDetails);
        console.log('validated message');
    }
}

(async () => {
    await monitorBridge();

    setInterval(monitorBridge, 15 * 1000); // every 15 seconds
})();
