const querystring = require('querystring');
const $ = require('cheerio');
const util = require('./util');
const constants = require('./constants');

let historyManager, orders_url, hour_from, hour_to;

function getColumnText(order_row, column_number) {
  return $(order_row).children('td').eq(column_number).text();
}

function getColumnHref(order_row, column_number) {
  return $(order_row).children('td').eq(column_number).find('a').attr('href');
}

function getOrderEid(order_row) {
  let href = getColumnHref(order_row, 1);
  let qs = href.split('?')[1];
  let obj = querystring.parse(qs);

  return obj['eid'];
}

function getOrderNumber(order_row) {
  return getColumnText(order_row, 1);
}

function filterOnlyOrders(i, elem) {
  return i > 0;
}

function filterLocked(i, elem) {
  return !historyManager.checkProcessingOrder(getOrderNumber(elem));
}

function filterByTime(i, elem) {
  if (!(hour_from && hour_to))
    return true;

  try {
    let dt_string = $(elem).children('td').eq(2).text();
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);
    return hour >= hour_from && hour <= hour_to;
  } catch (e) {
    return true;
  }
}

function filterByStatus(settings, logger, request, attempt, orders, date, positive_callback, negative_callback) {
  $(orders).each((i, order) => {
    // console.log('GET ORDER STATUS', getOrderNumber(elem));
    getOrderStatus(
      settings,
      logger,
      request,
      attempt,
      order,
      date,
      positive_callback,
      negative_callback
    );
  });
}

function filterByHistory(i, elem, date) {
  let order_number = getOrderNumber(elem);

  return !historyManager.dayHistoryIncludes(date, order_number);
}

function filterCurrentOrders(i, elem) {
  return filterOnlyOrders(i, elem) && filterByTime(i, elem);
}

function filterNewOrders(i, elem, date) {
  return filterLocked(i, elem) && filterByHistory(i, elem, date);
}

function seizeOrderUrl(orderEid) {
  return `${orders_url.trim()}?eid=${orderEid}`;
}

function lockProcessingOrderRows(orders_element) {
  // assume cheerio element
  orders_element.each((i, order_row) => {
    historyManager.lockProcessingOrder(getOrderNumber(order_row))
  });
}

function getOrderNumbers(orders_element) {
  return orders_element.map((i, order_row) => {
    return getOrderNumber(order_row);
  }).get();
}

function logAbsentOrdersBody(logger, attempt, body) {
  logger.info(`ABSENT ORDERS TABLE attempt: ${attempt}`);
  logger.debug(`attempt: ${attempt}, body is empty: ${body === ''}`);
  logger.debug(`attempt: ${attempt}, body is undefined: ${body === undefined}`);
  logger.debug(`attempt: ${attempt}, body is null: ${body === null}`);
  logger.debug(body);
}

function getOrderStatus(settings, logger, request, attempt, order, date, positive_callback, negative_callback) {
  let orderEid = getOrderEid(order);
  let orderNumber = getOrderNumber(order);
  let data = {
    url: settings.get('orders.details_url'),
    qs: { 'eid': orderEid }
  };
  let start_time = util.getNowDate();
  request.get(data, function (error, response, body) {
    if (error) {
      util.log_request_error(error, response);
      return;
    }
    util.printDuration(
      attempt,
      start_time,
      util.getNowDate(),
      `order (${orderNumber}) status query`
    );
    let $$ = $.load(body);

    logger.debug('------ Order details BODY STARTS ---------');
    logger.debug(body);
    logger.debug('------ Order details BODY ENDS ---------');

    let selector = '#body > table:nth-child(12) > tbody > tr > td > h3';
    let $details_header = $$(selector);
    let header_text = $details_header.text().toLowerCase();
    let statuses = settings.get('orders.statuses');
    let result = statuses.some(status => header_text.includes(status.toLowerCase()));

    logger.debug(`statuses: ${statuses}`);
    logger.debug(`order status text: ${header_text}`);

    if (result) {
      logger.log(`POSITIVE STATUS: ${orderNumber}, ${result}, ${header_text}`);
      positive_callback(order, date);
    }
    else {
      negative_callback(order);
    }
  });
}

let parser = function (history_manager, request, settings, logger) {
  historyManager = history_manager,
    orders_url = settings.get('orders.url'),
    hour_from = settings.get('orders.filter_hours.from'),
    hour_to = settings.get('orders.filter_hours.to');

  this.getOrdersUpdates = function (attempt, date = util.getNowDate()) {
    return new Promise((resolve, reject) => {
      logger.warn(`getOrdersUpdates, attempt: ${attempt}, for: ${util.formatDateForOrdersQuery(date)}`);
      let data = {
        url: orders_url,
        qs: { 'date': util.formatDateForOrdersQuery(date) }
      };
      let start_time = util.getNowDate();
      request.get(data, function (error, response, body) {
        if (error) {
          util.log_request_error(error, response);
          reject(error);
          return;
        }
        if (response && response.statusCode !== 200) {
          reject(`getOrdersUpdates, attempt: ${attempt}, for: ${util.formatDateForOrdersQuery(date)}, response code unsuccessful: ${response.statusCode}`);
          return;
        }

        util.printDuration(
          attempt,
          start_time,
          util.getNowDate(),
          `getOrdersUpdates(${util.formatDateForOrdersQuery(date)})`
        );
        let $$ = $.load(body);
        let selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';
        let $orders_tbody = $$(selector);

        if ($orders_tbody.length === 0) {
          logAbsentOrdersBody(logger, attempt, body);
        }

        let $orders = $orders_tbody.children('tr');
        $current_orders = $orders.filter((i, elem) => { return filterCurrentOrders(i, elem, date); });
        logger.log(
          `current orders attempt ${attempt} for ${date.toFormat(constants.DATE_FORMAT)} (${$current_orders.length})`
        );
        $orders = $current_orders.filter((i, elem) => { return filterNewOrders(i, elem, date); });

        resolve({ current_orders: $current_orders, new_orders: $orders });
      });
    });
  };

  this.checkSeizeResult = function (request, order_number, jar) {
    return new Promise((resolve, reject) => {
      logger.warn(`checkSeizeResult, order_number: ${order_number}`);
      const req = request.defaults({ jar: jar });
      // HINT: use the same base url as for order details
      let details_url = settings.get('orders.details_url');
      let start_time = util.getNowDate();

      req.get(details_url, function (error, response, body) {
        logger.debug(`---------------- ${order_number} ------------`);
        logger.debug(body);
        if (error) {
          util.log_request_error(error, response);
          reject(error);
          return;
        }
        util.printDuration(
          0,
          start_time,
          util.getNowDate(),
          `checkSeizeResult(${order_number})`
        );
        let $$ = $.load(body);
        let selector = '#body > table:nth-child(12) > tbody > tr > td > table.active-orders > tbody';
        let $orders_tbody = $$(selector);
        let $orders = $orders_tbody.children('tr');
        $orders = $orders.filter((i, elem) => { return getColumnText(elem, 0) == order_number; });
        resolve($orders.length > 0);
      });
    });
  };

  this.getColumnText = function (order_row, column_number) {
    return getColumnText(order_row, column_number);
  };

  this.getOrderNumber = function (order_row) {
    return getOrderNumber(order_row);
  };

  this.getOrderEid = function (order_row) {
    return getOrderEid(order_row);
  };

  this.seizeOrderUrl = function (order_number) {
    return seizeOrderUrl(order_number);
  };

  this.renderOrderData = function (order) {
    // 2, 3, 5, 6, 7
    let emptyAgeRegexp = /, Возраст: /i;
    let $order = $(order);
    let orderNumber = this.getColumnText($order, 1),
      time = this.getColumnText($order, 2),
      metro = this.getColumnText($order, 3),
      problem = this.getColumnText($order, 5),
      address = this.getColumnText($order, 6),
      client = this.getColumnText($order, 7).replace(emptyAgeRegexp, '');

    return `${time}; ${problem}; м.${metro}; ${address}; ${client}; ${orderNumber}`;
  };

  this.getReplyMarkup = function (orderEid) {
    return {
      inline_keyboard: [
        [{ text: 'Забрать заказ', url: seizeOrderUrl(orderEid) }]
      ]
    };
  };

  this.getOrderNumbers = getOrderNumbers;

  this.filterByStatus =
    (attempt, orders, date, positive_callback, negative_callback) =>
      filterByStatus(
        settings,
        logger,
        request,
        attempt,
        orders,
        date,
        positive_callback,
        negative_callback
      );

  this.lockProcessingOrderRows = lockProcessingOrderRows;

  this.getOrderNumberFromCallback = function (body) {
    let result,
      data = body && body.callback_query && body.callback_query.data;
    if (data) {
      let tokens = data.split('_');
      if (tokens.length == 2 && tokens[0] == 'seizeOrder')
        result = tokens[1];
    }

    return result;
  };

  this.getChatIdFromCallback = function (body) {
    return body &&
      body.callback_query &&
      body.callback_query.from &&
      body.callback_query.from.id;
  };

  this.getCallbackQueryIdFormCallback = function (body) {
    return body &&
      body.callback_query &&
      body.callback_query.id;
  };
};

module.exports = parser;