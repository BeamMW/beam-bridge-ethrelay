require('dotenv').config();

const { GetAndVerify, VerifyProof } = require('eth-proof');
const { toBuffer } = require('eth-util-lite');

(async () => {
    {
        // case 1
        let trustedBlockHash = '0x0662c18fc4ded2c36bb2a70e78be3dfdcb17e123d0a1a67c299dae399f2fb6f0';
        let untrustedTxHash = '0xe0b273adaea8e26b7fced654b78d77d02d4befb9270884ae60f1ba037e492c27';

        let resp = await getReceiptProof(untrustedTxHash, trustedBlockHash);

        console.log("TxHash: ", untrustedTxHash);
        console.log("TxIndexInBlock: ", resp.txIndex);
        console.log("ReceiptProof: ", resp.receiptProof.hex);
    }
    // {
    //     // case 2 don't work!
    //     let trustedBlockHash = '0x631dacb789f85d0531b176282616ff35ba1bbb837734dce0d1215e40fdec0d76';
    //     let untrustedTxHash = '0x4dfca68eb7e6ceef40ffddc07e6078f3484b44f930e3a5b30dfa3842ec9b3764';
    // }
    {
        // case 3
        let trustedBlockHash = '0x0a5414676279f3ac669cfe88664cd1614be0cf153880b2eb49f30f1e52c5d59b';
        let untrustedTxHash = '0x4a5b3ead8caf51c84fe0c8f7b20ddeb7f7d3c79f5e05f776093fd0134bdfa765';

        let resp = await getReceiptProof(untrustedTxHash, trustedBlockHash);

        console.log("TxHash: ", untrustedTxHash);
        console.log("TxIndexInBlock: ", resp.txIndex);
        console.log("ReceiptProof: ", resp.receiptProof.hex);
    }
    {
        // case 4
        let trustedBlockHash = '0x817f95a3ce72591e308512b8e77ad4592751de64be06aab71be295bb9119b90e';
        let untrustedTxHash = '0x5cc6f39c9060e489ca890ca8698ecbfe46a4f6e33bc5ab256e3f2aa98941db65';

        let resp = await getReceiptProof(untrustedTxHash, trustedBlockHash);

        console.log("TxHash: ", untrustedTxHash);
        console.log("TxIndexInBlock: ", resp.txIndex);
        console.log("ReceiptProof: ", resp.receiptProof.hex);
    }
})();

async function getReceiptProof(untrustedTxHash, trustedBlockHash) {
    let getAndVerify = new GetAndVerify("https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY);

    let resp = await getAndVerify.get.receiptProof(untrustedTxHash)
    let blockHashFromHeader = VerifyProof.getBlockHashFromHeader(resp.header)
    if(!toBuffer(trustedBlockHash).equals(blockHashFromHeader)) {
        throw new Error('BlockHash mismatch')
    }

    let receiptsRoot = VerifyProof.getReceiptsRootFromHeader(resp.header)
    let receiptsRootFromProof = VerifyProof.getRootFromProof(resp.receiptProof)

    if(!receiptsRoot.equals(receiptsRootFromProof)) {
        throw new Error('ReceiptsRoot mismatch')
    }

    return resp;
};