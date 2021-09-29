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
let msgId = 1;

if (options.msgId !== undefined) {
    msgId = options.msgId;
    saveSettings(msgId);
} else {
    try {
        let data = fs.readFileSync(SETTINGS_FILE);
        let obj = JSON.parse(data);
        msgId = obj['startMsgId'];
    } catch (e) { }
}

async function monitorBridge() {
    let count = await beam.getLocalMsgCount();
    
    while (msgId <= count) {
        let localMsg = await beam.getLocalMsg(msgId);
        console.log(currentTime(), "Processing of a new message has started. Message ID - ", msgId);

        // TODO: check another way to get blockDetails for msg
        let msgProof = await beam.getLocalMsgProof(msgId);
        let blockDetails = await beam.getBlockDetails(msgProof['height']);

        await eth.pushRemoteMessage(msgId, localMsg['contractSender'], localMsg['contractReceiver'], blockDetails['height'],
            blockDetails['timestamp'], localMsg['amount'], localMsg['receiver']);

        await eth.validateRemoteMessage(msgId, msgProof['proof'], blockDetails);

        console.log(currentTime(), "The message was successfully transferred to the Ethereum. Message ID - ", msgId);
        saveSettings(++msgId);
    }

    setTimeout(monitorBridge, 15 * 1000);
}

(async () => {
    await monitorBridge();
    // TODO: dispute or time
    // TODO: finalyzeRemoteMessage
})();
