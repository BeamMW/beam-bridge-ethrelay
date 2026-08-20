import Web3 from 'web3';

// defaults for the EIP-1559 fee estimation
const FEE_HISTORY_BLOCKS = 10;
const PRIORITY_FEE_PERCENTILE = 50;
// how many times the base fee is multiplied to get the maxFeePerGas headroom
const BASE_FEE_MULTIPLIER = 2;
// boundaries for the tip, in gwei
const MIN_PRIORITY_FEE = '0.01';
const MAX_PRIORITY_FEE = '3';

let web3 = undefined;

// the instance is created lazily, so that ETH_HTTP_PROVIDER can be set
// after this module is imported
export const getWeb3 = () => {
    if (web3 === undefined) {
        web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_HTTP_PROVIDER));
    }
    return web3;
}

const envNumber = (name, defaultValue) => {
    const value = Number(process.env[name]);
    return isFinite(value) && value > 0 ? value : defaultValue;
}

const median = (values) => {
    const sorted = [...values].sort((a, b) => a.cmp(b));
    return sorted[Math.floor(sorted.length / 2)];
}

// web3 1.x doesn't estimate the tip: when maxPriorityFeePerGas is omitted it
// hardcodes 2.5 gwei, which is orders of magnitude above the going rate.
// So we have to build the fee parameters ourselves.
export const estimateFeeParams = async () => {
    const utils = getWeb3().utils;
    const toBN = utils.toBN;
    const gweiToBN = (value) => toBN(utils.toWei(String(value), 'gwei'));

    const percentile = envNumber('ETH_PRIORITY_FEE_PERCENTILE', PRIORITY_FEE_PERCENTILE);
    const blocks = envNumber('ETH_FEE_HISTORY_BLOCKS', FEE_HISTORY_BLOCKS);
    const multiplier = envNumber('ETH_BASE_FEE_MULTIPLIER', BASE_FEE_MULTIPLIER);
    const minPriorityFee = gweiToBN(process.env.ETH_MIN_PRIORITY_FEE_GWEI || MIN_PRIORITY_FEE);
    const maxPriorityFee = gweiToBN(process.env.ETH_MAX_PRIORITY_FEE_GWEI || MAX_PRIORITY_FEE);

    const history = await getWeb3().eth.getFeeHistory(blocks, 'latest', [percentile]);

    // the last entry is the base fee of the block that is being built now
    const baseFees = history && history['baseFeePerGas'];
    if (!baseFees || !baseFees.length) {
        throw new TypeError('eth_feeHistory returned no baseFeePerGas');
    }
    const baseFee = toBN(baseFees[baseFees.length - 1]);

    const rewards = ((history && history['reward']) || [])
        .map((reward) => reward && reward[0])
        .filter((reward) => reward !== undefined && reward !== null)
        .map(toBN);
    let priorityFee = rewards.length ? median(rewards) : minPriorityFee;

    if (priorityFee.lt(minPriorityFee)) {
        priorityFee = minPriorityFee;
    } else if (priorityFee.gt(maxPriorityFee)) {
        priorityFee = maxPriorityFee;
    }

    return {
        maxPriorityFeePerGas: utils.toHex(priorityFee),
        // muln() accepts integers only, so the multiplier is applied with a 1/100 precision
        maxFeePerGas: utils.toHex(baseFee.muln(Math.round(multiplier * 100)).divn(100).add(priorityFee)),
    };
}

// the upper bound of the gas price that the relayer can pay, in gwei
export const estimateMaxGasPriceInGwei = async () => {
    const { maxFeePerGas } = await estimateFeeParams();
    return Number(getWeb3().utils.fromWei(maxFeePerGas, 'gwei'));
}
