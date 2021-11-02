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

async function requestHeight() {
    try {
        let status = await beam.walletStatus();
        return status['current_height'];
    } catch {
        // output to log
    }
    return 0;
}

function isValidRelayerFee(relayerFee) {
    return true;
}

async function monitorBridge() {
    let currentHeight = await requestHeight();

    if (currentHeight > 0 || currentHeight < process.env.BEAM_CONFIRMATIONS) {
        try {
            let count = await beam.getLocalMsgCount();
            
            while (msgId <= count) {
                let localMsg = await beam.getLocalMsg(msgId);

                if (localMsg['height'] > currentHeight - process.env.BEAM_CONFIRMATIONS) {
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

    setTimeout(monitorBridge, process.env.BEAM_BLOCK_CREATION_PERIOD);
}

(async () => {
    await monitorBridge();
})();
