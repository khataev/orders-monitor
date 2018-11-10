// HINT: deprecated api

const yaml = require('js-yaml');
const { DateTime } = require('luxon');
const fs = require('fs');
const cheerio = require('cheerio');

const constants = require('./constants');

let global_history;
let global_day_history;

function initrdersHistoryYaml(date = DateTime.local()) {
  try {
    if (!global_history) {
      if (!fs.existsSync(constants.ORDERS_HISTORY_PATH))
        fs.writeFileSync(constants.ORDERS_HISTORY_PATH, '');
      global_history = yaml.safeLoad(fs.readFileSync(constants.ORDERS_HISTORY_PATH, constants.FILE_ENCODING)) || {};
    }
  } catch (e) {
    logger.log('readOrdersHistory error');
    logger.log(e);
  }
  global_day_history = global_history[date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT)] || [];
}

function deleteOldHistoryYaml(history, cutoff_date = DateTime.local()) {
  result = {};
  for (pair of Object.entries(history)) {
    cutoff_date_start = cutoff_date.startOf('day');
    dt = DateTime.fromFormat(pair[0], constants.ORDERS_HISTORY_DATE_FORMAT).startOf('day');
    if (dt >= cutoff_date_start)
    {
      result[pair[0]] = pair[1];
    }
  }
  return result;
};

function saveOrdersToHistoryYaml(history, orders, date = DateTime.local()) {
  key = date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  if (!history[key]) {
    history[key] = orders
  }
  else {
    history[key] = Array.from(new Set(history[key].concat(orders)));
  }

  history = this.deleteOldHistory();
  this.writeHistory(history);
};

function dayHistoryIncludesYaml(order_number) {
  return global_day_history.includes(order_number);
}