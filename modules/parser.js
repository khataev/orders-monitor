const $ = require('cheerio');
const { DateTime } = require('luxon');
const util = require('./util');
const constants = require('./constants');

let historyManager, orders_url, hour_from, hour_to;

function getColumnText(order_row, column_number) {
  return $(order_row).children('td').eq(column_number).text();
};

function getOrderNumber(order_row) {
  return getColumnText(order_row, 1);
};

function filterOnlyOrders (i, elem) {
  return i > 0;
};

function filterLocked (i, elem) {
  return !historyManager.checkProcessingOrder(getOrderNumber(elem));
};

function filterByTime (i, elem) {
  if (!(hour_from && hour_to))
    return true;

  try {
    let dt_string = $(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);
    return hour >= hour_from && hour <= hour_to;
  } catch (e) {
    return true;
  }
};

function filterByStatus (settings, logger, request, orders, date, positive_callback) {
  $(orders).each((i, order) => {
    // console.log('GET ORDER STATUS', getOrderNumber(elem));
    getOrderStatus(settings, logger, request, order, date, positive_callback)
  });
};

function filterByHistory (i, elem, date) {
  let order_number = getOrderNumber(elem);

  return !historyManager.dayHistoryIncludes(date, order_number);
};

function filterOrders (i, elem, date) {
  return filterOnlyOrders(i, elem) &&
    filterLocked(i, elem) &&
    filterByTime(i, elem) &&
    filterByHistory(i, elem, date);
};

function seizeOrderUrl (orderNumber) {
  return `${orders_url}?id=${orderNumber}`;
};

function lockProcessingOrderRows(orders_element) {
  // assume cheerio element
  orders_element.each((i, order_row) => {
    historyManager.lockProcessingOrder(getOrderNumber(order_row))
  });
}

function getOrderStatus (settings, logger, request, order, date, positive_callback) {
  let orderNumber = getOrderNumber(order);
  data = {
    url: settings.get('orders.details_url'),
    qs: { 'id': orderNumber }
  };
  let start_time = DateTime.local();
  request.get(data, function (error, response, body) {
    if (error) {
      util.log_request_error(error, response);
      return;
    }
    util.printDuration(
      0,
      start_time,
      DateTime.local(),
      `order (${orderNumber}) status query`
    );
    let $$ = $.load(body);
    selector = '#body > table:nth-child(12) > tbody > tr > td > h3';

    $details_header = $$(selector);
    header_text = $details_header.text().toLowerCase();
    statuses = settings.get('orders.statuses');
    result = statuses.some(status => header_text.includes(status.toLowerCase()));

    if (result)
    {
      logger.log(`POSITIVE STATUS: ${orderNumber}, ${result}, ${header_text}`);
      positive_callback(order, date);
    }
  });
};

let parser = function (history_manager, request, settings, logger) {
  historyManager = history_manager,
    orders_url = settings.get('orders.url'),
    hour_from = settings.get('orders.filter_hours.from'),
    hour_to = settings.get('orders.filter_hours.to');

  this.getOrdersUpdates = function (attempt, callback, date = DateTime.local()) {
    data = {
      url: orders_url,
      qs: { 'date': util.formatDateForOrdersQuery(date) }
    };
    let start_time = DateTime.local();
    request.get(data, function (error, response, body) {
      if (error) {
        util.log_request_error(error, response);
        return;
      }
      util.printDuration(
        attempt,
        start_time,
        DateTime.local(),
        `getOrdersUpdates(${util.formatDateForOrdersQuery(date)})`
      );
      let $$ = $.load(body);
      selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

      $orders_tbody = $$(selector);
      $orders = $orders_tbody.children('tr');
      logger.log(`current orders attempt ${attempt} for ${date.toFormat(constants.DATE_FORMAT)} (${$orders.length})`);
      $orders = $orders.filter((i, elem) => { return filterOrders(i, elem, date); });

      lockProcessingOrderRows($orders);
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

  this.filterByStatus =
    (orders, date, positive_callback) =>
      filterByStatus(
        settings,
        logger,
        request,
        orders,
        date,
        positive_callback
      );
};

module.exports = parser;