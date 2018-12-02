#!/bin/sh

curl -n -X POST https://api.heroku.com/apps/orders-monitor/dynos/web/actions/stop \
  --user "${HEROKU_CLI_USER}:${HEROKU_CLI_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.heroku+json; version=3"

sleep 5

curl -n -X DELETE https://api.heroku.com/apps/orders-monitor/dynos/web \
  --user "${HEROKU_CLI_USER}:${HEROKU_CLI_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.heroku+json; version=3"