import dotenv from "dotenv";

dotenv.config();

import http from "http";
import https from "https";
import { estimateMaxGasPriceInGwei } from "./eth_gas.js";
import { CurrencyRateError } from "./exceptions.js";

// how much of an unexpected response is kept in the error message
const MAX_RESPONSE_EXCERPT = 100;

function baseGetRequest(url, processResult, useHttps = true) {
    return new Promise((resolve, reject) => {
        let accumulated = "";

        const options = {
            headers: {
                'User-Agent': 'Beam-Bridge-EthRelay/1.0'
            }
        };


        const callback = (response) => {
            // same as above
            response.on("data", (chunk) => {
                accumulated += chunk;
            });

            response.on("end", () => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${accumulated.slice(0, MAX_RESPONSE_EXCERPT)}`));
                    return;
                }
                try {
                    resolve(processResult(accumulated));
                } catch (err) {
                    reject(err);
                }
            });

            response.on("error", reject);
        };

        if (useHttps) {
            https.get(url, options, callback).on("error", reject);
        } else {
            http.get(url, options, callback).on("error", reject);
        }
    });
}

function parseRateInUSD(data, rateId) {
    let json;
    try {
        json = JSON.parse(data);
    } catch (err) {
        throw new CurrencyRateError(`Unexpected response: ${data.slice(0, MAX_RESPONSE_EXCERPT)}`);
    }

    const rate = json && json[rateId] ? parseFloat(json[rateId]['usd']) : NaN;
    if (!isFinite(rate) || rate <= 0) {
        throw new CurrencyRateError(`Wrong ${rateId} rate: ${data.slice(0, MAX_RESPONSE_EXCERPT)}`);
    }
    return rate;
}

async function requestRateInUSD(apiUrl, rateId, useHttps) {
    const url = `${apiUrl}?ids=${rateId}&vs_currencies=usd`;
    try {
        return await baseGetRequest(url, (data) => parseRateInUSD(data, rateId), useHttps);
    } catch (err) {
        throw new CurrencyRateError(`Failed to get the ${rateId} rate from ${apiUrl}. ${err.message}`);
    }
}

async function getCurrencyRateInUSD(rateId, useHttps = true) {
    try {
        return await requestRateInUSD(process.env.COINGECKO_CURRENCY_RATE_API_URL, rateId, useHttps);
    } catch (err) {
        if (!process.env.RESERVE_CURRENCY_RATE_API_URL) {
            throw err;
        }
        console.log(`${err.message} Trying the reserve source.`);
        return await requestRateInUSD(process.env.RESERVE_CURRENCY_RATE_API_URL, rateId, useHttps);
    }
}

async function calcCurrentRelayerFee(rateId, useHttps = true) {
    const RELAY_COSTS_IN_GAS = 96000;
    const ETH_RATE_ID = "ethereum";

    // the same estimation that the relayer uses to send the transaction:
    // maxFeePerGas is the upper bound of the price we can actually pay
    const gasPrice = await estimateMaxGasPriceInGwei();
    if (!isFinite(gasPrice) || gasPrice == 0) {
        throw new TypeError("Wrong gas price");
    }
    // the rates are validated by getCurrencyRateInUSD: finite and positive
    const ethRate = await getCurrencyRateInUSD(ETH_RATE_ID, useHttps);
    const relayCosts = 
        (RELAY_COSTS_IN_GAS * gasPrice * ethRate) / Math.pow(10, 9);
    const currRate = await getCurrencyRateInUSD(rateId, useHttps);

    return relayCosts / currRate;
}

export {
    calcCurrentRelayerFee
}