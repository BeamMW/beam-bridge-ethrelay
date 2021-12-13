import dotenv from "dotenv";

dotenv.config();

import fs from "fs";

const PipeContract = JSON.parse(fs.readFileSync(process.cwd() + '/utils/' + process.env.ETH_PIPE_CONTRACT_ABI));

export default PipeContract;
