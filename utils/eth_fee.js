import dotenv from "dotenv";

dotenv.config();

import http from "http";
import https from "https";

function baseGetRequest(url, processResult, useHttps = true) {
    return new Promise((resolve, reject) => {
        let accumulated = "";

        const callback = (response) => {
            // same as above
            response.on("data", (chunk) => {
                accumulated += chunk;
            });

            response.on("end", () => {
                try {
                    resolve(processResult(accumulated));
                } catch (err) {
                    reject(err);
                }
            });

            response.on("error", reject);
        };

        if (useHttps) {
            https.get(url, callback).on("error", reject);
        } else {
            http.get(url, callback).on("error", reject);
        }
    });
}

async function getCurrencyRate(rateId, useHttps = true) {
    const url = `${process.env.COINGECKO_CURRENCY_RATE_API_URL}?ids=${rateId}&vs_currencies=usd`;
    return baseGetRequest(url, JSON.parse, useHttps);
}

async function getGasPrice(useHttps = true) {
    return baseGetRequest(process.env.GAS_PRICE_API_URL, JSON.parse, useHttps);
}

async function calcCurrentRelayerFee(rateId, useHttps = true) {
    const RELAY_COSTS_IN_GAS = 120000;
    const ETH_RATE_ID = "ethereum";

    const gasPrice = await getGasPrice(useHttps);
    const ethRate = await getCurrencyRate(ETH_RATE_ID, useHttps);
    const relayCosts =
        (RELAY_COSTS_IN_GAS *
            parseFloat(gasPrice["FastGasPrice"]) *
            parseFloat(ethRate[ETH_RATE_ID]["usd"])) /
        Math.pow(10, 9);
    const currRate = await getCurrencyRate(rateId, useHttps);

    return relayCosts / parseFloat(currRate[rateId]["usd"]);
}

export {
    calcCurrentRelayerFee
}