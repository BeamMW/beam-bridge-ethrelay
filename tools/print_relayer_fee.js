import dotenv from "dotenv";

dotenv.config();

import { calcCurrentRelayerFee } from "./../utils/eth_fee.js";
import { getWeb3, estimateFeeParams } from "./../utils/eth_gas.js";

// prints the same value that getCurrentMinRelayerFee() calculates
// in beam2eth_relay.js, together with the numbers it is built from
(async () => {
    const rateId = process.argv[2] || process.env.COINGECKO_CURRENCY_RATE_ID;
    const decimals = process.env.ETH_SIDE_DECIMALS;
    const toGwei = (value) => getWeb3().utils.fromWei(value, 'gwei');

    const feeParams = await estimateFeeParams();
    const estimatedRelayerFee = await calcCurrentRelayerFee(rateId);
    const expectedMinimumFee = Math.trunc(Math.pow(10, decimals) * estimatedRelayerFee);

    console.log('provider:             ', process.env.ETH_HTTP_PROVIDER);
    console.log('currency:             ', rateId);
    console.log('maxPriorityFeePerGas: ', toGwei(feeParams.maxPriorityFeePerGas), 'gwei');
    console.log('maxFeePerGas:         ', toGwei(feeParams.maxFeePerGas), 'gwei');
    console.log('estimatedRelayerFee:  ', estimatedRelayerFee, rateId);
    console.log(`expectedMinimumFee:   `, expectedMinimumFee, `(${decimals} decimals)`);
})().catch((err) => {
    console.error('failed:', err.message);
    process.exit(1);
});
