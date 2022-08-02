
import dotenv from "dotenv";

dotenv.config();

import https from "https";

function baseGetRequest(url, processResult) {
    return new Promise((resolve, reject) => {
        let accumulated = "";

        const callback = (response) => {
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

export {
    calcCurrentRelayerFee
}