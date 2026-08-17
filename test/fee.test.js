import dotenv from "dotenv";

dotenv.config();
import http from "http";
import {calcCurrentRelayerFee} from "./../utils/eth_fee.js"
import assert from "assert";

const GWEI = BigInt(10) ** BigInt(9);
const toHex = (gwei) => '0x' + (BigInt(Math.round(gwei * 1000)) * GWEI / BigInt(1000)).toString(16);

// maxFeePerGas = 2 * baseFee + tip, so these values give 37 gwei
const BASE_FEE_GWEI = 18;
const TIP_GWEI = 1;

const feeHistory = (baseFeeGwei = BASE_FEE_GWEI, tipGwei = TIP_GWEI) => ({
    oldestBlock: '0x1',
    // eth_feeHistory returns one base fee more than the requested block count
    baseFeePerGas: new Array(11).fill(toHex(baseFeeGwei)),
    gasUsedRatio: new Array(10).fill(0.5),
    reward: new Array(10).fill([toHex(tipGwei)]),
});

const ETH_OK = `{ "ethereum": { "usd": 1715.93 } }`;
const TETHER_OK = `{ "tether": { "usd": 1.002 } }`;

describe("", () => {
    let coingecko;
    let node;
    // responses of the mocked servers, 'undefined' means an empty 404
    let nodeResult;
    let ethRateResponse;
    let currRateResponse;

    // the servers are shared by all the tests: closing and reopening the same
    // port between them races with the keep-alive sockets of the http provider
    before(() => {
        process.env.COINGECKO_CURRENCY_RATE_API_URL = "http://127.0.0.1:9998";
        process.env.ETH_HTTP_PROVIDER = "http://127.0.0.1:9999";

        coingecko = http.createServer((req, res) => {
            const body = req.url.includes('ethereum') ? ethRateResponse : currRateResponse;
            res.writeHead(body === undefined ? 404 : 200);
            res.end(body === undefined ? "" : body);
        });
        coingecko.listen(9998);

        // a minimal json-rpc endpoint that answers every call with 'nodeResult'
        node = http.createServer((req, res) => {
            let request = "";
            req.on("data", (chunk) => { request += chunk; });
            req.on("end", () => {
                if (nodeResult === undefined) {
                    res.writeHead(404);
                    res.end("");
                    return;
                }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    id: JSON.parse(request)["id"],
                    result: nodeResult
                }));
            });
        });
        node.listen(9999);
    });

    beforeEach(() => {
        nodeResult = feeHistory();
        ethRateResponse = ETH_OK;
        currRateResponse = TETHER_OK;
    });

    after(() => {
        coingecko.close();
        node.close();
    });

    it("normal case", async() => {
        const fee = await calcCurrentRelayerFee("tether", false);
        assert.ok(fee > 6 && fee < 7);
    });

    it("gas price follows the node", async() => {
        // twice the base fee of the "normal case" gives roughly twice the fee
        nodeResult = feeHistory(BASE_FEE_GWEI * 2, TIP_GWEI);

        const fee = await calcCurrentRelayerFee("tether", false);
        assert.ok(fee > 11 && fee < 13);
    });

    it("the tip is capped", async() => {
        // ETH_MAX_PRIORITY_FEE_GWEI defaults to 3 gwei, so 100 gwei of tips
        // must not go through: maxFeePerGas = 2 * 18 + 3 = 39 gwei
        nodeResult = feeHistory(BASE_FEE_GWEI, 100);

        const fee = await calcCurrentRelayerFee("tether", false);
        assert.ok(fee > 6 && fee < 7);
    });

    it("divide by zero", async() => {
        currRateResponse = `{ "tether": { "usd": 0 } }`;

        await assert.rejects(calcCurrentRelayerFee("tether", false));
    });

    it("empty response of coingecko", async() => {
        ethRateResponse = undefined;
        currRateResponse = undefined;

        await assert.rejects(calcCurrentRelayerFee("tether", false), SyntaxError);
    });

    it("empty response of the node", async() => {
        nodeResult = undefined;

        await assert.rejects(calcCurrentRelayerFee("tether", false));
    });

    it("'baseFeePerGas' is absent", async() => {
        nodeResult = {
            oldestBlock: '0x1',
            gasUsedRatio: [0.5],
            reward: [[toHex(TIP_GWEI)]]
        };

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
    });

    it("'reward' is absent", async() => {
        // without the tips the estimation falls back to the minimal one
        nodeResult = feeHistory();
        delete nodeResult.reward;

        const fee = await calcCurrentRelayerFee("tether", false);
        assert.ok(fee > 5 && fee < 6);
    });

    it("wrong ethereum rate", async() => {
        ethRateResponse = `{ "ethereum": { "usd": "test" } }`;

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
    });

    it("wrong tether rate", async() => {
        currRateResponse = `{ "tether": { "usd": "test" } }`;

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
    });

    it("other currency", async() => {
        ethRateResponse = `{ "btc": { "usd": 1715.93 } }`;

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
    });

    it("other currency 2", async() => {
        currRateResponse = `{ "btc": { "usd": 1.002 } }`;

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
    });
});
