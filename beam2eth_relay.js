require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');

(async () => {
    let promise = beam.readMessages();
    let result = await promise;

    console.log('after request');

    await eth.sendMessages(result);
    console.log('after sync');
})();
