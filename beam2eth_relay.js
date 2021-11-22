require('dotenv').config();

const beam = require('./utils/beam_utils.js');
const eth = require('./utils/eth_utils.js');
const {program} = require('commander');

let fs = require('fs');
let msgId = 1;

function currentTime() {
    return "[" + (new Date()).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + "] ";
}

function saveSettings(value) {
    try {
        fs.writeFileSync(process.env.BEAM2ETH_SETTINGS_FILE, JSON.stringify({
            'startMsgId': value
        }));
    } catch (e) {}
}

async function requestHeight() {
    try {
        let status = await beam.walletStatus();
        return status['current_height'];
    } catch (e) {
        // output to log
        console.log('There is Beam wallet status problem');
        console.log(e);
    }
    return 0;
}

function isValidRelayerFee(relayerFee) {
    return true;
}

async function monitorBridge() {
    let currentHeight = await requestHeight();

    if (currentHeight > 0 && currentHeight > process.env.BEAM_CONFIRMATIONS) {
        try {
            let count = await beam.getLocalMsgCount();
            
            while (msgId <= count) {
                let localMsg = await beam.getLocalMsg(msgId);

                if (localMsg['height'] > currentHeight - process.env.BEAM_CONFIRMATIONS) {
                    break;
                }

                let amount = localMsg['amount'].toString();
                let relayerFee = localMsg['relayerFee'].toString();

                if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
                    const diff = process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS;
                    amount = amount.padEnd(amount.length + diff, '0');
                    relayerFee = relayerFee.padEnd(relayerFee.length + diff, '0');
                }

                if (isValidRelayerFee(relayerFee)) {
                    console.log(currentTime(), "Processing of a new message has started. Message ID - ", msgId);

                    await eth.processRemoteMessage(msgId, amount, localMsg['receiver'], relayerFee);

                    console.log(currentTime(), "The message was successfully transferred to the Ethereum. Message ID - ", msgId);
                } else {
                    console.log(currentTime(), "Relayer fee is small! Message ID - ", msgId, ", realyerFee = ", relayerFee);
                }
                saveSettings(++msgId);
            }
        } catch (e) {
            console.log('Error:');
            console.log(e);
        }        
    }

    setTimeout(monitorBridge, process.env.BEAM_BLOCK_CREATION_PERIOD);
}

(async () => {
    program.option('-m, --msgId <number>', 'start message id');
    program.parse(process.argv);

    const options = program.opts();

    if (options.msgId !== undefined) {
        msgId = options.msgId;
        saveSettings(msgId);
    } else {
        try {
            let data = fs.readFileSync(process.env.BEAM2ETH_SETTINGS_FILE);
            let obj = JSON.parse(data);
            msgId = obj['startMsgId'];
        } catch (e) { }
    }

    await monitorBridge();
})();
