// TODO: how to store several scripts in one file?
const logger = require('./logger');
const settings = require('./config');
const history = require('./history');

let historyManager = new history(settings, logger);

function purgeHistory() {
  historyManager.purgeHistory();
}

purgeHistory();