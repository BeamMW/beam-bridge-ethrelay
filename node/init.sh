#!/bin/bash
trap '' INT
OWNER_KEY_FILE=owner_key.txt
BEAM_WALLET_DB_PATH=/home/beam/data/wallet.db
if [ ! -f "wallet.db" ]; then
  /home/beam/wallet/beam-wallet --pass=$WALLET_PASS --wallet_path=$BEAM_WALLET_DB_PATH restore --seed_phrase=$SEED_PHRASE
  echo
  echo 'wallet.db restore process done.'
  echo
else
  echo
  echo 'wallet.db is already restored!'
  echo
fi
if [ ! -f $OWNER_KEY_FILE ]; then
  output=$(/home/beam/wallet/beam-wallet --pass=$WALLET_PASS --wallet_path=$BEAM_WALLET_DB_PATH export_owner_key | tail -1)
  echo $output
  # skip "Owner Viewer key: " in output and save to OWNER_KEY_FILE
  outputlen=${#output}
  echo $(echo $output | awk -v var=$outputlen '{ string=substr($0, 19, var - 1); print string; }' ) > $OWNER_KEY_FILE
  echo
  echo 'owner_key successfully exported.'
  echo
fi
owner_key="$(cat $OWNER_KEY_FILE)"
echo $owner_key
export OWNER_KEY=$owner_key