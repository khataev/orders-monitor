const { DateTime } = require('luxon');
const cheerio = require('cheerio');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const constants = require('./constants');
const database = require('./../config/database');

let logger;
let sequelize;
let Order;
let parser;

let global_history = {};
let processing_orders = {};

// TODO: refactor these parser duplicates (add html table to array converter)
function getColumnText(order_row, column_number) {
  return cheerio(order_row).children('td').eq(column_number).text();
};

function getOrderNumber(order_row) {
  return getColumnText(order_row, 1);
};

function lockProcessingOrder(orderNumber) {
  logger.log(`LOCK ProcessingOrder: ${orderNumber}`);
  processing_orders[orderNumber] = true;
}

function lockProcessingOrders(orders_element) {
  // assume cheerio element
  orders_element.each((i, order_row) => {
    lockProcessingOrder(getOrderNumber(order_row))
  });
}

function releaseProcessingOrder(orderNumber) {
  logger.log(`RELEASE ProcessingOrder: ${orderNumber}`);
  delete processing_orders[orderNumber];
}

function releaseProcessingOrderRow(order_row) {
  releaseProcessingOrder(getOrderNumber(order_row));
}

function checkProcessingOrder(orderNumber) {
  let result = !!processing_orders[orderNumber];
  logger.log(`CHECK ProcessingOrder: ${orderNumber}, ${result}`);
  return result;
}

function printHistory(history) {
  console.log('printing');
  for (var order_number_key in history) {
    if (history.hasOwnProperty(order_number_key)){
      order = history[order_number_key];
      logger.log(`${order_number_key} - ${order.orderNumber}`);
    }
  }
}

function printGlobalHistory() {
  printHistory(global_history);
}

function getHistoryKey(order) {
  // quote from Sequelize help:
  // DATEONLY now returns string in YYYY-MM-DD format rather than Date type
  return getHistoryKeySimple(order.date, order.orderNumber);
}

function getHistoryKeySimple(date_key, orderNumber) {
  return `${date_key}-${orderNumber}`;
}

function initOrdersHistory() {
  let promise =
    Order.findAll({ where: {} });
      // .finally(() => Order.sequelize.close());

  return promise.then((orders = []) => {
    logger.log(`initOrdersHistory, loaded: ${orders.length}`);
    orders.forEach(order => global_history[getHistoryKey(order)] = order);
    // printHistory(global_history);
  });
}

// TODO: unneded
// function writeHistory(history) {
//   onFulfilled = function (result) {
//     logger.log('SAVED');
//   };
//
//   onRejected = function (error) {
//     logger.log(`writeHistory error ${error.message}`);
//   };
//
//   console.log(history_key);
//   for (var order_number_key in history) {
//     if (history.hasOwnProperty(order_number_key)) {
//       order = history[order_number_key];
//       order
//         .save()
//         .then(onFulfilled, onRejected);
//       // .finally(() => order.sequelize.close());
//     }
//   }
//
// };

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

// HINT: not used anymore
function saveOrdersToHistory(history, orders, date = DateTime.local()) {
  if (!history)
    history = {};

  orders.forEach(function(order_number){
    saveOrderToHistory(order_number, date)
  });
};

function saveOrderToHistory(orderNumber, date) {
  date_key = date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  history_key = getHistoryKeySimple(date_key, orderNumber);
  logger.log(`check before save history ${history_key} ${global_history[history_key] && global_history[history_key].orderNumber}`);
  if (!global_history[history_key]) {
    order = buildOrder(date_key, orderNumber);
    global_history[history_key] = order;
    logger.log(`save to history ${history_key}: ${order.orderNumber}`);
    order
      .save();
    // .finally(() => order.sequelize.close());
  }
}

function dayHistoryIncludes(date, order_number) {
  date_key = date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  result = !!global_history[getHistoryKeySimple(date_key, order_number)];
  // console.log('HISTORY SEARCH', getHistoryKeySimple(date_key, order_number), result);
  return result;
}

let history = function(settings, log) {
  logger = log;
  sequelize = new Sequelize(database[settings.get('env')]);
  Order = sequelize.import("./../models/order");

  this.initOrdersHistory = initOrdersHistory;

  this.saveOrderToHistory = saveOrderToHistory;

  // this.saveOrdersToHistory = saveOrdersToHistory;

  // HINT: not used anymore
  this.saveRawOrdersToHistory = function(orders, date = DateTime.local()) {
    let result = cheerio(orders).map(function(i, elem) {
      // logger.log(cheerio(elem).children('td').eq(1).text());
      return cheerio(elem).children('td').eq(1).text();
    });
    this.saveOrdersToHistory(global_history, Array.from(result), date);
  };

  // this.writeHistory = writeHistory;

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

  this.printGlobalHistory = printGlobalHistory;

  this.lockProcessingOrders = lockProcessingOrders;

  // this.releaseProcessingOrder = releaseProcessingOrder;
  this.releaseProcessingOrderRow = releaseProcessingOrderRow;

  this.checkProcessingOrder = checkProcessingOrder;
};

module.exports = history;