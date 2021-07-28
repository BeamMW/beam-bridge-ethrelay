require('dotenv').config();

let fs = require('fs');

function currentTime() {
    return "[" + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + "] ";
}

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');
const {program} = require('commander');
const SETTINGS_FILE = './beam2eth_settings.json';

function saveSettings(value) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
            'startMsgId': value
        }));
    } catch (e) {}
}

program.option('-m, --msgId <number>', 'start message id');

program.parse(process.argv);

const options = program.opts();
let startMsgId = 1;

if (options.msgId !== undefined) {
    startMsgId = options.msgId;
    saveSettings(startMsgId);
} else {
    try {
        let data = fs.readFileSync(SETTINGS_FILE);
        let obj = JSON.parse(data);
        startMsgId = obj['startMsgId'];
    } catch (e) { }
}

async function monitorBridge() {
    let count = await beam.getLocalMsgCount();
    
    while (startMsgId <= count) {
        let localMsg = await beam.getLocalMsg(startMsgId);
        console.log(currentTime(), "Processing of a new message has started. Message ID - ", startMsgId);
        //console.log('msg: ', localMsg);

        await eth.pushRemoteMessage(startMsgId, localMsg['sender'], localMsg['receiver'], localMsg['body']);
        //console.log('pushed message');
        let msgProof = await beam.getLocalMsgProof(startMsgId);
        //console.log('proof: ', msgProof);

        let blockDetails = await beam.getBlockDetails(msgProof['height']);
        //console.log('block details: ', blockDetails);

        await eth.validateRemoteMessage(startMsgId, msgProof['proof'], blockDetails);
        console.log(currentTime(), "The message was successfully transferred to the Ethereum. Message ID - ", startMsgId);
        saveSettings(++startMsgId);
    }

    setTimeout(monitorBridge, 15 * 1000);
}

(async () => {
    await monitorBridge();
})();
