require('dotenv').config();

const beam = require('./utils/beam_utils.js');

async function waitTx(txId) {
    const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }
    do {
        let promise = beam.getStatusTx(txId);
        let result = await promise;
        let status = result['result']['status'];

        if (status == 3 || status == 4) break;
        await sleep(60000);
    } while(true)
}

(async () => {
    let promise = beam.readPk();
    let result = await promise;    
    
    //console.log(result);

    console.log('import message')
    promise = beam.importMsg(4000000, result);
    result = await promise;
    await waitTx(result);

    console.log('finalize message')
    promise = beam.finalizeMsg();
    result = await promise;
    await waitTx(result);

    console.log('mint coin')
    promise = beam.unlock();
    result = await promise;
    await waitTx(result);
})();
