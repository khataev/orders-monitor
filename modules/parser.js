const $ = require('cheerio');
const { DateTime } = require('luxon');
const util = require('./util');

let historyManager, settings_global;

function getColumnText(order_row, column_number) {
  return $(order_row).children('td').eq(column_number).text();
};

function getOrderNumber(order_row) {
  return getColumnText(order_row, 1);
};

function filterOnlyOrders (i, elem) {
  return i > 0;
};

function filterByTime (i, elem) {
  let from_hour = settings_global.get('orders.filter_hours.from'),
    to_hour = settings_global.get('orders.filter_hours.to');

  if (!(from_hour && to_hour))
    return true;

  try {
    let dt_string = $(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);
    return hour >= from_hour && hour <= to_hour;
  } catch (e) {
    return true;
  }
};

function filterByStatus (i, elem) {
  // TODO: фильтр по статусу заказа
  return true;
};

function filterByHistory (i, elem) {
  let order_number = getOrderNumber(elem);

  return !historyManager.dayHistoryIncludes(order_number);
};

function filterOrders (i, elem) {
  return filterOnlyOrders(i, elem) &&
    filterByTime(i, elem) &&
    filterByStatus(i, elem) &&
    filterByHistory(i, elem);
};

seizeOrderUrl = function (orderNumber) {
  // TODO: move to settings
  return `http://ultima.uk.to/sched.php?id=${orderNumber}`;
};

let parser = function (history_manager, request, settings, logger) {
  historyManager = history_manager;
  settings_global = settings;

  this.getOrdersUpdates = function (attempt, callback, date = DateTime.local()) {
    data = {
      url: settings.get('orders.url'),
      qs: { 'date': util.formatDate(date) }
    };
    let start_time = DateTime.local();
    request.get(data, function (error, response, body) {
      if (error) {
        logger.log('error:', error); // Print the error if one occurred
        logger.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        return null;
      }
      let end_time = DateTime.local();
      request_duration = end_time.diff(start_time, ['seconds', 'milliseconds']);
      logger.log(`request attempt ${attempt} duration: ${request_duration.toFormat('s.SS')}`);
      let $$ = $.load(body);
      selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

      $orders_tbody = $$(selector);
      $orders = $orders_tbody.children('tr');
      // historyManager.readOrdersHistory(date);
      // logger.log(`getOrdersUpdates. before filter: ${$orders.length}`);
      $orders = $orders.filter(filterOrders);
      // logger.log(`getOrdersUpdates. after filter: ${$orders.length}`);

      callback(attempt, settings, $orders, date);
    });
  };

  this.getColumnText = function (order_row, column_number) {
    return getColumnText(order_row, column_number);
  };

  this.getOrderNumber = function(order_row) {
    return getOrderNumber(order_row);
  };

  // TODO: do we need link to status page?
  this.renderOrderData = function (order) {
    // 1, 3, 6, 7, 5, 2
    let $order = $(order);
    let orderNumber = this.getColumnText($order, 1),
      metro = this.getColumnText($order, 3),
      address = this.getColumnText($order, 6),
      client = this.getColumnText($order, 7),
      problem = this.getColumnText($order, 5),
      time = this.getColumnText($order, 2);

    return `м. ${metro}, ${address}; ${client}; ${problem}, ${time}, ${orderNumber}`
  };

  this.getReplyMarkup = function (orderNumber) {
    return {
      inline_keyboard: [
        [{ text: 'Забрать заказ', url: seizeOrderUrl(orderNumber)}]
      ]
    };
  };

  this.getReplyMarkupBotApi = function (orderNumber) {
    return {
      "reply_markup": {
        "inline_keyboard": [
          [{ "text": 'Забрать заказ', "url": seizeOrderUrl(orderNumber)}]
        ]
      }
    };
  };
};

module.exports = parser;