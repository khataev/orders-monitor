const { DateTime } = require('luxon');
const cheerio = require('cheerio');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const constants = require('./constants');
const database = require('./../config/database');

let logger;
let sequelize;
let Order;

let global_history = {};

function printHistory(history) {
  console.log('printing');
  for (var order_number_key in history) {
    if (history.hasOwnProperty(order_number_key)){
      order = history[order_number_key];
      console.log(order.orderNumber);
    }
  }
}

// TODO: date param is unneeded
function initOrdersHistory() {
  let promise =
    Order
      .findAll({
        where: {
          // date: date
        }
      });
      // .finally(() => Order.sequelize.close());

  return promise.then((orders = []) => {
    logger.log(`initOrdersHistory, loaded: ${orders.length}`);
    orders.forEach((element) => global_history[element.orderNumber] = element);
  });
}

function writeHistory(history) {
  onFulfilled = function (result) {
    logger.log('SAVED');
  };

  onRejected = function (error) {
    logger.log(`writeHistory error ${error.message}`);
  };

  for (var date_key in history) {
    console.log(date_key);
    if (history.hasOwnProperty(date_key)) {
      day_history = history[date_key];

      for (var order_number_key in day_history) {
        if (day_history.hasOwnProperty(order_number_key)){
          order = day_history[order_number_key];
          order
            .save()
            .then(onFulfilled, onRejected);
            // .finally(() => order.sequelize.close());
        }
      }
    }
  }
};

function deleteOldHistory(cutoff_date = DateTime.local()) {
  result = Order.destroy({
    where: {
      date: {
        [Op.lt]: cutoff_date.toJSDate()
      }
    }
  });
    // .finally( () => Order.sequelize.close());

  return result;
};

function buildOrder(date_key, order_number) {
  return Order.build(
    {
      date: date_key,
      orderNumber: order_number
    }
  );
}

function createOrder(date_key, order_number) {
  buildOrder(date_key, order_number)
    .save()
    .finally((order) => Order.sequelize.close());
}

function saveOrdersToHistory(history, orders, date = DateTime.local()) {
  key = date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  if (!history)
    history = {};

  orders.forEach(function(order_number){
    if (!history[order_number]) {
      order = buildOrder(key, order_number);
      history[order_number] = order;
      console.log('save to history', order.orderNumber);
      order
        .save();
        // .finally(() => order.sequelize.close());
    }
  });
};

function dayHistoryIncludes(order_number) {
  return !!global_history[order_number];
}

let history = function(settings, log) {
  logger = log;
  sequelize = new Sequelize(database[settings.get('env')]);
  Order = sequelize.import("./../models/order");

  this.initOrdersHistory = initOrdersHistory;
  this.saveOrdersToHistory = saveOrdersToHistory;
  this.saveRawOrdersToHistory = function(orders, date = DateTime.local()) {
    let result = cheerio(orders).map(function(i, elem) {
      // logger.log(cheerio(elem).children('td').eq(1).text());
      return cheerio(elem).children('td').eq(1).text();
    });
    this.saveOrdersToHistory(global_history, Array.from(result), date);
  };
  this.writeHistory = writeHistory;
  // TODO: call once a day
  this.deleteOldHistory = deleteOldHistory;
  this.purgeHistory = function() {
    Order.destroy({
      where: {},
      truncate: true
    })
      .finally( () => Order.sequelize.close());
  };
  this.dayHistoryIncludes = dayHistoryIncludes;
  this.createOrder = createOrder;
};

module.exports = history;