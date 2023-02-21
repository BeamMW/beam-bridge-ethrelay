FROM ubuntu:18.04

RUN  mkdir -p /home/beam/node/ && mkdir -p /home/beam/data/ && mkdir -p /home/beam/wallet/

ENV BEAM_NODE_BINARY=beam-node
ENV BEAM_WALLET_BINARY=beam-wallet
ENV OWNER_KEY="m6o4tcBSyWlwstgcfClsCYVh2eclN92e7wRdqF6RXQuE3pHtLZ9UhhuziMyhKqXKzfApx5iUKD4S9cZn8BNcpOqJxgslOyRRhlNHZlgdjOJZhj82k4kqUWF27hij+o7ZBuR9wWFh6KpdG9kp"
ENV BEAM_NODE_PEER=eu-nodes.mainnet.beam.mw:8100,us-nodes.mainnet.beam.mw:8100
ENV BEAM_NODE_PORT=10003
ENV BEAM_CUSTOM_NETWORK_ARGS="--FakePoW=1 --Fork1=20 --Fork2=40 --Fork3=60 --Maturity.Coinbase=60"

# Define volume & working directory.
WORKDIR /home/beam/data/

COPY treasury.bin /home/beam/node/treasury.bin
COPY ${BEAM_NODE_BINARY} /home/beam/node/${BEAM_NODE_BINARY}
COPY ${BEAM_WALLET_BINARY} /home/beam/wallet/beam-wallet
COPY init.sh /home/beam/wallet/init.sh

EXPOSE ${BEAM_NODE_PORT}

ENTRYPOINT . /home/beam/wallet/init.sh && printenv && exec /home/beam/node/${BEAM_NODE_BINARY} --port=${BEAM_NODE_PORT} --pass=${WALLET_PASS} --treasury_path=/home/beam/node/treasury.bin --owner_key=${OWNER_KEY} --peer=${BEAM_NODE_PEER} ${BEAM_CUSTOM_NETWORK_ARGS} --fast_sync on