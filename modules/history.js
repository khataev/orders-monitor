const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const constants = require('./constants');
const util = require('./util');
const database = require('./../config/database');

let logger;
let sequelize;
let Order;
let OrderBackup;

let global_history = {};
let processing_orders = {};

function lockProcessingOrder(orderNumber) {
  logger.log(`LOCK ProcessingOrder: ${orderNumber}`, 'debug');
  processing_orders[orderNumber] = true;
}

function releaseProcessingOrder(orderNumber) {
  logger.log(`RELEASE ProcessingOrder: ${orderNumber}`, 'debug');
  delete processing_orders[orderNumber];
}

function checkProcessingOrder(orderNumber) {
  let result = !!processing_orders[orderNumber];
  logger.log(`CHECK ProcessingOrder: ${orderNumber}, ${result}`, 'debug');

  return result;
}

function printHistory(history) {
  logger.log('printing history');
  for (let property in history) {
    if (history.hasOwnProperty(property)){
      let order = history[property];
      logger.log(`${property} - ${order.orderNumber}`);
    }
  }
}

async function markSeizedOrders(order_numbers, date) {
  let result = [],
    date_key = getHistoryDateKey(date),
    date_for_log = date.toFormat(constants.DATE_FORMAT),
    mapped_order_numbers = order_numbers.map(
      orderNumber => getHistoryKeySimple(date_key, orderNumber)
    );
  let properties = Object
    .getOwnPropertyNames(global_history)
    .filter(property => property.startsWith(date_key));

  logger.log(`markSeizedOrders. mapped_order_numbers for ${date_for_log}: ${mapped_order_numbers.length}`, 'debug');
  logger.log(`markSeizedOrders. properties for ${date_for_log}: ${properties.length}`, 'debug');

  let date_orders = properties
    .filter(property => !mapped_order_numbers.includes(property));
  await util.asyncForEach(
    date_orders,
    async (index, property) => {
      let order = global_history[property];
      if (!order.seized) {
        order.seized = true;
        await order.save();
        result.push(order);
        logger.log(`order seized: ${property}`);
      }
  });

  logger.log(`markSeizedOrders. return result for ${date_for_log}, count: ${result.length}`, 'debug');
  return result;
}

function getHistoryDateKey(date) {
  return date.toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
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

function deleteOldHistory(cutoff_date = util.getNowDate()) {
  return Order.destroy({
    where: {
      date: {
        [Op.lt]: cutoff_date.toJSDate()
      }
    }
  });
};

function buildOrder(date_key, order_number, message_ids) {
  return Order.build(
    {
      date: date_key,
      orderNumber: order_number,
      message_ids: message_ids
    }
  );
}

function saveOrderToHistory(orderNumber, date, message_ids) {
  date_key = getHistoryDateKey(date);
  history_key = getHistoryKeySimple(date_key, orderNumber);
  // logger.log(`check before save history ${history_key} ${global_history[history_key] && global_history[history_key].orderNumber}`);
  if (!global_history[history_key]) {
    order = buildOrder(date_key, orderNumber, message_ids);
    global_history[history_key] = order;
    // logger.log(`save to history ${history_key}: ${order.orderNumber}`);
    order.save();
  }
}

function dayHistoryIncludes(date, order_number) {
  date_key = getHistoryDateKey(date);
  result = !!global_history[getHistoryKeySimple(date_key, order_number)];
  // console.log('HISTORY SEARCH', getHistoryKeySimple(date_key, order_number), result);
  return result;
}

let history = function(settings, log) {
  logger = log;
  sequelize = new Sequelize(database[settings.get('env')]);
  // TODO: import all models at once
  Order = sequelize.import("./../models/order");
  OrderBackup = sequelize.import("./../models/orderbackup");

  this.initOrdersHistory = initOrdersHistory;

  this.saveOrderToHistory = saveOrderToHistory;

  // TODO: call once a day
  this.deleteOldHistory = deleteOldHistory;

  this.purgeHistory = function() {
    return Order.destroy({
      where: {},
      truncate: true
    });
  };

  this.purgeHistoryBackup = function() {
    return OrderBackup.destroy({
      where: {},
      truncate: true
    });
  };

  this.backupHistory = function() {
    return this.purgeHistoryBackup()
      .then(() => {
        sequelize.query(
          'INSERT INTO "OrderBackups" (date, "orderNumber", "createdAt", "updatedAt") SELECT date, "orderNumber", "createdAt", "updatedAt" FROM "Orders"'
        ).spread((results, metadata) => {});
      });
  };

  this.restoreHistory = function () {
    return this.purgeHistory()
      .then(() => {
        sequelize.query(
          'INSERT INTO "Orders" (date, "orderNumber", "createdAt", "updatedAt") SELECT date, "orderNumber", "createdAt", "updatedAt" FROM "OrderBackups"'
        ).spread((results, metadata) => {});
      });
  };

  this.closeConnections = function() {
    sequelize.close();
  };

  this.dayHistoryIncludes = dayHistoryIncludes;

  this.printGlobalHistory = printGlobalHistory;

  this.lockProcessingOrder = lockProcessingOrder;

  this.releaseProcessingOrder = releaseProcessingOrder;

  this.checkProcessingOrder = checkProcessingOrder;

  this.markSeizedOrders = markSeizedOrders;
};

module.exports = history;