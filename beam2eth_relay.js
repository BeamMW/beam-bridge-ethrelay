require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');

(async () => {
    let result = await beam.getUserPubkey();
    console.log('pub key: ', result);

    result = await beam.getLocalMsgCount();
    console.log('count = ', result);

    result = await beam.getLocalMsg(2);
    console.log('msg: ', result);

    await eth.pushRemoteMessage(1, result['sender'], result['receiver'], result['body']);
})();
