const yaml = require('js-yaml');
const { DateTime } = require('luxon');
const fs = require('fs');
const cheerio = require('cheerio');

// TODO: how to avoid global var?
let global_history;
let global_day_history;

let history = function(logger, constants) {
  this.readOrdersHistory = function(date = DateTime.local()) {
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
  };

  this.saveOrdersToHistory = function(history, orders, date = DateTime.local()) {
    key = date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
    if (!history[key]) {
      history[key] = orders
    }
    else {
      history[key] = Array.from(new Set(history[key].concat(orders)));
    }
    history = this.deleteOldHistory(history);
    this.writeHistory(history);
  };

  this.saveRawOrdersToHistory = function(orders, date = DateTime.local()) {
    let result = cheerio(orders).map(function(i, elem) {
      // logger.log(cheerio(elem).children('td').eq(1).text());
      return cheerio(elem).children('td').eq(1).text();
    });
    this.saveOrdersToHistory(global_history, Array.from(result), date);
  };

  this.writeHistory = function(history) {
    try {
      yaml_contents = yaml.safeDump(history);
      fs.writeFileSync(constants.ORDERS_HISTORY_PATH, yaml_contents, function(error) {
        if (error)  {
          logger.log('writeHistory error');
          logger.log(error);
        }
      })
    } catch (e) {
      logger.log('writeHistory error');
      logger.log(e);
    }
  };

  this.deleteOldHistory = function(history, cutoff_date = DateTime.local()) {
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

  this.dayHistoryIncludes = function(order_number) {
    return global_day_history.includes(order_number);
  };
};

module.exports = history;