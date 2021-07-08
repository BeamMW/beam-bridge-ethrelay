require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');

(async () => {
    let result = await beam.getUserPubkey();
    console.log('pub key: ', result);

    let count = await beam.getLocalMsgCount();
    console.log('count = ', count);

    result = await beam.getLocalMsg(count);
    console.log('msg: ', result);

    //await eth.pushRemoteMessage(2, result['sender'], result['receiver'], result['body']);
    result = await beam.getLocalMsgProof(count);
    console.log('proof: ', result);

    let blockDetails = await beam.getBlockDetails(result['height']);
    console.log('block details: ', blockDetails);
})();
