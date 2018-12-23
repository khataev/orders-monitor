const logger = require('./logger');
const settings = require('./config');
const history = require('./history');
const telegram = require('./telegram');

const historyManager = new history(settings, logger);
const telegramApi = new telegram(settings, logger);


function run(script_name) {
  logger.log(`RUNNING SCRIPT: ${script_name}`);

  if (script_name === 'history:purge')
    historyManager.purgeHistory()
      .then(() => { historyManager.closeConnections() });

  if (script_name === 'history:backup')
    historyManager.backupHistory()
      .then(() => { historyManager.closeConnections() });

  if (script_name === 'history:restore')
    historyManager.restoreHistory()
      .then(() => { historyManager.closeConnections() });

  if (script_name === 'history:delete_old')
    historyManager.deleteOldHistory()
      .then(() => { historyManager.closeConnections() });

  if (script_name === 'telegram:restore_seized_messages') {
    historyManager
      .unmarkSeizedOrders()
      .then(orders => telegramApi.restoreSeizedMessages(orders))
      .then(() => { historyManager.closeConnections() });
  }
}

let script_name = process.argv[2];

if(!script_name) {
  logger.log('Script name is missing!');
}
else {
  run(script_name);
}