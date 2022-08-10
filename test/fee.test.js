import dotenv from "dotenv";

dotenv.config();
import http from "http";
import {calcCurrentRelayerFee} from "./../utils/eth_fee.js"
import assert from "assert";

describe("", () => {
    before(() => {
        process.env.COINGECKO_CURRENCY_RATE_API_URL = "http://127.0.0.1:9998";
        process.env.GAS_PRICE_API_URL = "http://127.0.0.1:9999";
    });

    it("normal case", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(200);
            if (req.url.includes('ethereum')) {
                res.end(`{ "ethereum": { "usd": 1715.93 } }`);
            } else {
                res.end(`{ "tether": { "usd": 1.002 } }`);
            }
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(200);
            res.end(`{
                "FastGasPrice": 37
              }`);
        });

        etherscan.listen(9999);

        const fee = await calcCurrentRelayerFee("tether", false);
        assert.ok(fee > 7 && fee < 8);

        coingecko.close();
        etherscan.close();
    });

    it("divide by zero", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(200);
            if (req.url.includes('ethereum')) {
                res.end(`{ "ethereum": { "usd": 1715.93 } }`);
            } else {
                res.end(`{ "tether": { "usd": 0 } }`);
            }
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(200);
            res.end(`{
                "FastGasPrice": 37
              }`);
        });

        etherscan.listen(9999);

        const fee = await calcCurrentRelayerFee("tether", false);

        console.log(fee);
        
        coingecko.close();
        etherscan.close();
    });

    it("empty response of coingecko", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(404);
            res.end("");
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(200);
            res.end(`{
                "FastGasPrice": 37
              }`);
        });

        etherscan.listen(9999);

        await assert.rejects(calcCurrentRelayerFee("tether", false), SyntaxError);

        coingecko.close();
        etherscan.close();
    });

    it("empty response of etherscan", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(200);
            if (req.url.includes('ethereum')) {
                res.end(`{ "ethereum": { "usd": 1715.93 } }`);
            } else {
                res.end(`{ "tether": { "usd": 1.002 } }`);
            }
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(404);
            res.end("");
        });

        etherscan.listen(9999);

        await assert.rejects(calcCurrentRelayerFee("tether", false), SyntaxError);

        coingecko.close();
        etherscan.close();
    });

    // it("wrong ethereum rate", async() => {
    //     const coingecko = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         if (req.url.includes('ethereum')) {
    //             res.end(`{ "ethereum": { "usd": "test" } }`);
    //         } else {
    //             res.end(`{ "tether": { "usd": 1.002 } }`);
    //         }
    //     });

    //     coingecko.listen(9998);

    //     const etherscan = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         res.end(`{
    //             "FastGasPrice": 37
    //           }`);
    //     });

    //     etherscan.listen(9999);

    //     const fee = await calcCurrentRelayerFee("tether", false);

    //     const expectedMinimumFee = Math.trunc(
    //         Math.pow(10, process.env.ETH_SIDE_DECIMALS) * fee
    //     );

    //     console.log(fee);
    //     console.log(expectedMinimumFee);
    //     const t = BigInt(expectedMinimumFee);
        
    //     coingecko.close();
    //     etherscan.close();
    // });

    // it("wrong tether rate", async() => {
    //     const coingecko = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         if (req.url.includes('ethereum')) {
    //             res.end(`{ "ethereum": { "usd": 1715.93 } }`);
    //         } else {
    //             res.end(`{ "tether": { "usd": "test" } }`);
    //         }
    //     });

    //     coingecko.listen(9998);

    //     const etherscan = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         res.end(`{
    //             "FastGasPrice": 37
    //           }`);
    //     });

    //     etherscan.listen(9999);

    //     const fee = await calcCurrentRelayerFee("tether", false);

    //     const expectedMinimumFee = Math.trunc(
    //         Math.pow(10, process.env.ETH_SIDE_DECIMALS) * fee
    //     );

    //     console.log(fee);
    //     console.log(expectedMinimumFee);
    //     const t = BigInt(expectedMinimumFee);
        
    //     coingecko.close();
    //     etherscan.close();
    // });

    // it("wrong etherscan gas price", async() => {
    //     const coingecko = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         if (req.url.includes('ethereum')) {
    //             res.end(`{ "ethereum": { "usd": 1715.93 } }`);
    //         } else {
    //             res.end(`{ "tether": { "usd": 1.002 } }`);
    //         }
    //     });

    //     coingecko.listen(9998);

    //     const etherscan = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         res.end(`{
    //             "FastGasPrice": "test"
    //           }`);
    //     });

    //     etherscan.listen(9999);

    //     const fee = await calcCurrentRelayerFee("tether", false);

    //     const expectedMinimumFee = Math.trunc(
    //         Math.pow(10, process.env.ETH_SIDE_DECIMALS) * fee
    //     );

    //     console.log(fee);
    //     console.log(expectedMinimumFee);
    //     const t = BigInt(expectedMinimumFee);
        
    //     coingecko.close();
    //     etherscan.close();
    // });

    it("other currency", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(200);
            if (req.url.includes('ethereum')) {
                res.end(`{ "btc": { "usd": 1715.93 } }`);
            } else {
                res.end(`{ "tether": { "usd": 1.002 } }`);
            }
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(200);
            res.end(`{
                "FastGasPrice": 37
              }`);
        });

        etherscan.listen(9999);

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
        
        coingecko.close();
        etherscan.close();
    });

    it("other currency 2", async() => {
        const coingecko = http.createServer((req, res) => {
            res.writeHead(200);
            if (req.url.includes('ethereum')) {
                res.end(`{ "ethereum": { "usd": 1715.93 } }`);
            } else {
                res.end(`{ "btc": { "usd": 1.002 } }`);
            }
        });

        coingecko.listen(9998);

        const etherscan = http.createServer((req, res) => {
            res.writeHead(200);
            res.end(`{
                "FastGasPrice": 37
              }`);
        });

        etherscan.listen(9999);

        await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
        
        coingecko.close();
        etherscan.close();
    });

    // it("'FastGasPrice' is absent", async() => {
    //     const coingecko = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         if (req.url.includes('ethereum')) {
    //             res.end(`{ "ethereum": { "usd": 1715.93 } }`);
    //         } else {
    //             res.end(`{ "tether": { "usd": 1.002 } }`);
    //         }
    //     });

    //     coingecko.listen(9998);

    //     const etherscan = http.createServer((req, res) => {
    //         res.writeHead(200);
    //         res.end(`{
    //             "test": 37
    //           }`);
    //     });

    //     etherscan.listen(9999);
    //     const fee = await calcCurrentRelayerFee("tether", false);

    //     console.log('fee= ', fee);

    //     //await assert.rejects(calcCurrentRelayerFee("tether", false), TypeError);
        
    //     coingecko.close();
    //     etherscan.close();
    // });
});