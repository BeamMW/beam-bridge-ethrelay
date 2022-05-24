FROM ubuntu:18.04

RUN  mkdir -p /home/beam/wallet/ && mkdir -p /home/beam/data/

WORKDIR /home/beam/data/

ENV BEAM_WALLET_API_BINARY="wallet-api-masternet"
ENV BEAM_WALLET_BINARY="beam-wallet-masternet"

COPY ${BEAM_WALLET_API_BINARY} /home/beam/wallet/wallet-api
COPY ${BEAM_WALLET_BINARY} /home/beam/wallet/beam-wallet
COPY init.sh /home/beam/wallet/init.sh
COPY pipe_app.wasm /home/beam/wallet/pipe_app.wasm
COPY token_app.wasm /home/beam/wallet/token_app.wasm

ENV BEAM_WALLET_API_PORT=11011
ENV NODE_ADR=localhost:11003
ENV BEAM_CUSTOM_NETWORK_ARGS="--FakePoW=1 --Fork1=20 --Fork2=40 --Fork3=60 --Maturity.Coinbase=60"

EXPOSE $BEAM_WALLET_API_PORT

ENTRYPOINT /home/beam/wallet/init.sh && exec /home/beam/wallet/wallet-api -n $NODE_ADR ${BEAM_CUSTOM_NETWORK_ARGS} --pass=$WALLET_PASS --port=${BEAM_WALLET_API_PORT} --enable_assets --use_http=1