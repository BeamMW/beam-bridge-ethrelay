require("dotenv").config();

const beam = require("./utils/beam_utils.js");
const eth = require("./utils/eth_utils.js");
const { program } = require("commander");
const https = require("https");

/*
if you add   "type": "module" in package.json you will be able to use
imports instead of require. Require is an outdated way of modules import.
 */

let fs = require("fs");

/*
it is not necessary to use let if you will not reassign variable
 */
let msgId = 1;

function currentTime() {
  return (
    "[" +
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) +
    "] "
  );
}

function saveSettings(value) {
  try {
    fs.writeFileSync(
      process.env.BEAM2ETH_SETTINGS_FILE,
      JSON.stringify({
        startMsgId: value,
      })
    );
  } catch (e) {}
}

async function requestHeight() {
  try {
    let status = await beam.walletStatus();
    /*
    it is not necessary to use let if you will not reassign variable
    */
    return status["current_height"];
  } catch (e) {
    // output to log
    console.log("There is Beam wallet status problem");
    console.log(e);
  }
  return 0;
}

function baseGetRequest(url, processResult) {
  return new Promise((resolve, reject) => {
    let accumulated = "";

    let callback = (response) => {
      // same as above
      response.on("data", (chunk) => {
        accumulated += chunk;
      });

      response.on("end", () => {
        resolve(processResult(accumulated));
      });

      response.on("error", reject);
    };

    https.get(url, callback).on("error", reject);
  });
}

async function getCurrencyRate(rateId) {
  const url = `${process.env.COINGECKO_CURRENCY_RATE_API_URL}?ids=${rateId}&vs_currencies=usd`;
  return baseGetRequest(url, JSON.parse);
}

async function getGasPrice() {
  return baseGetRequest(process.env.GAS_PRICE_API_URL, JSON.parse);
}

async function calcCurrentRelayerFee(rateId) {
  const RELAY_COSTS_IN_GAS = 120000;
  const ETH_RATE_ID = "ethereum";

  const gasPrice = await getGasPrice();
  const ethRate = await getCurrencyRate(ETH_RATE_ID);
  const relayCosts =
    (RELAY_COSTS_IN_GAS *
      parseFloat(gasPrice["FastGasPrice"]) *
      parseFloat(ethRate[ETH_RATE_ID]["usd"])) /
    Math.pow(10, 9);
  const currRate = await getCurrencyRate(rateId);

  return relayCosts / parseFloat(currRate[rateId]["usd"]);
}

async function isValidRelayerFee(relayerFee) {
  const estimatedRelayerFee = await calcCurrentRelayerFee(
    process.env.COINGECKO_CURRENCY_RATE_ID
  );
  return relayerFee >= estimatedRelayerFee;
}

async function monitorBridge() {
  let currentHeight = await requestHeight();

  if (currentHeight > 0 && currentHeight > process.env.BEAM_CONFIRMATIONS) {
    try {
      let count = await beam.getLocalMsgCount();

      while (msgId <= count) {
        let localMsg = await beam.getLocalMsg(msgId);

        if (
          localMsg["height"] >
          currentHeight - process.env.BEAM_CONFIRMATIONS
        ) {
          break;
        }

        let amount = localMsg["amount"].toString();
        let relayerFee = localMsg["relayerFee"].toString();

        if (process.env.ETH_SIDE_DECIMALS > beam.BEAM_MAX_DECIMALS) {
          const diff = process.env.ETH_SIDE_DECIMALS - beam.BEAM_MAX_DECIMALS;
          amount = amount.padEnd(amount.length + diff, "0");
          relayerFee = relayerFee.padEnd(relayerFee.length + diff, "0");
        } else if (process.env.ETH_SIDE_DECIMALS < beam.BEAM_MAX_DECIMALS) {
          const diff = beam.BEAM_MAX_DECIMALS - process.env.ETH_SIDE_DECIMALS;
          // check that amount contains this count of zeros at the end
          let endedStr = "0".repeat(diff);
          if (!amount.endsWith(endedStr) || !relayerFee.endsWith(endedStr)) {
            throw new Error(`Unexpected amounts. Message ID - ${msgId}`);
          }
          // remove zeros
          amount = amount.slice(0, -diff);
          relayerFee = relayerFee.slice(0, -diff);
        }

        if (await isValidRelayerFee(relayerFee)) {
          console.log(
            currentTime(),
            "Processing of a new message has started. Message ID - ",
            msgId
          );

          await eth.processRemoteMessage(
            msgId,
            amount,
            localMsg["receiver"],
            relayerFee
          );

          console.log(
            currentTime(),
            "The message was successfully transferred to the Ethereum. Message ID - ",
            msgId
          );
        } else {
          console.log(
            currentTime(),
            "Relayer fee is small! Message ID - ",
            msgId,
            ", realyerFee = ",
            relayerFee
          );
        }
        saveSettings(++msgId);
      }
    } catch (e) {
      console.log("Error:");
      console.log(e);
    }
  }

  setTimeout(monitorBridge, process.env.BEAM_BLOCK_CREATION_PERIOD);
}

(async () => {
  program.option("-m, --msgId <number>", "start message id");
  program.parse(process.argv);

  const options = program.opts();

  if (options.msgId !== undefined) {
    msgId = options.msgId;
    saveSettings(msgId);
  } else {
    try {
      let data = fs.readFileSync(process.env.BEAM2ETH_SETTINGS_FILE);
      let obj = JSON.parse(data);
      msgId = obj["startMsgId"];
    } catch (e) {}
  }

  await monitorBridge();
})();
