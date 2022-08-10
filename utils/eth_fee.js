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

    const gasPriceJson = await getGasPrice(useHttps);
    const ethRateJson = await getCurrencyRate(ETH_RATE_ID, useHttps);
    const gasPrice = parseFloat(gasPriceJson["FastGasPrice"]);
    if (!isFinite(gasPrice)) {
        throw new TypeError("Wrong gas price");
    }
    const ethRate = parseFloat(ethRateJson[ETH_RATE_ID]["usd"]);
    if (!isFinite(ethRate)) {
        throw new TypeError("Wrong ethereum rate");
    }
    const relayCosts = 
        (RELAY_COSTS_IN_GAS * gasPrice * ethRate) / Math.pow(10, 9);
    const currRateJson = await getCurrencyRate(rateId, useHttps);
    const currRate = parseFloat(currRateJson[rateId]["usd"])

    if (!isFinite(currRate) || currRate == 0) {
        throw new TypeError(`Wrong ${rateId} rate`);
    }

    return relayCosts / currRate;
}

export {
    calcCurrentRelayerFee
}