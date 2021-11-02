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

const UPDATING_PERIOD = 15 * 1000; // this value for test
const CONFIRMATIONS_AMOUNT = 1; // this value for test
let currentHeight = 0;

async function requestHeight() {
    try {
        let status = await beam.walletStatus();
        currentHeight = status['current_height'];
    } catch {
        // output to log
    }
    setTimeout(requestHeight, UPDATING_PERIOD);
}

function isValidRelayerFee(relayerFee) {
    return true;
}

async function monitorBridge() {
    if (currentHeight > 0 || currentHeight < CONFIRMATIONS_AMOUNT) {
        try {
            let count = await beam.getLocalMsgCount();
            
            while (msgId <= count) {
                let localMsg = await beam.getLocalMsg(msgId);

                if (localMsg['height'] > currentHeight - CONFIRMATIONS_AMOUNT) {
                    break;
                }

                if (isValidRelayerFee(localMsg['relayerFee'])) {
                    console.log(currentTime(), "Processing of a new message has started. Message ID - ", msgId);

                    await eth.processRemoteMessage(msgId, localMsg['amount'], localMsg['receiver'], localMsg['relayerFee']);

                    console.log(currentTime(), "The message was successfully transferred to the Ethereum. Message ID - ", msgId);
                } else {
                    // output to log
                }
                saveSettings(++msgId);
            }
        } catch {
            // output to log
        }        
    }

    setTimeout(monitorBridge, UPDATING_PERIOD);
}

(async () => {
    await requestHeight();
    await monitorBridge();
})();
