Create two wallets on each side. The first wallet for deploy and call it "Owner", the second for management - "Manager".
After all the contracts are deposited and configured, the wallet "Owner" is no longer used.

Fetch the code from the repository:
```
git clone https://github.com/BeamMW/beam-bridge-ethrelay.git
```

Go to the beam-bridge-ethrelay folder. A separate branch has been created for each beem network. 
```
main - masternet
dappnet - dappnet
mainnet - mainnet
```

Switch to the branch we choose:
```
git checkout <branch>
```

Using the docker.env.example file as an example, create docker.env.
In the "Beam side config" section, let's enter the sido and password for the manager wallet BEAM_WALLET_API_SEED_PHRASE and BEAM_WALLET_API_PASS, respectively.

In the "ETH side config" section, you must fill in all the parameters:

+ BEAM_PIPE_CID is the cid of the Pipe contract.
+ ETH_PIPE_CONTRACT_ADDRESS is the Pipe contract address in the Ether network.
+ ETH_RELAYER_ADDRESS is the address of the manager wallet
+ ETH_RELAYER_PRIVATE_KEY is the private key of the "Manager" wallet
+ ETH_TOKEN_CONTRACT is the address of the token on the ether that the bridge works with
+ ETH_SIDE_DECIMALS - how many decimal places the token supports
+ ETH_COINGECKO_CURRENCY_RATE_ID=ethereum
+ ETH_HTTP_PROVIDER - http address of data provider for ether
+ ETH_WEBSOCKET_PROVIDER - websocket address of data provider for air
+ ETH_PIPE_CONTRACT_ABI - specify "EthPipe.json" if the bridge is with ether, but "EthERC20Pipe.json" if it is with token

Build the containers:
```
docker-compose --profile api --env-file docker.env build
```

Running the relay:
```
docker-compose --profile api --env-file docker.env up -d
```
