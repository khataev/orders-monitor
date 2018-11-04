const yaml = require('js-yaml');
const requestGlobal = require('request');
const fs = require('fs');
const { DateTime } = require('luxon');
const cheerio = require('cheerio');
// local files
const constants = require('./modules/constants');
const logger = require('./modules/logger');
const settingsManager = require('./modules/settings');
const settings = new settingsManager(logger, constants).readSettings();
const history = require('./modules/history');
const telegram = require('./modules/telegram');
const util = require('./modules/util');

let request = requestGlobal.defaults({jar: true});
let historyManager = new history(logger, constants);
let telegramApi = new telegram(settings, logger);


// TODO: $ instead of cheerio
// log(test(5));

// TODO: разнести по файлам
// TODO: обработка разлогинивания раз в час ??
// TODO: фильтр по статусу заказа
function run() {
  if (settings) {
    logIn(settings, startUpdatesPolling)
  }
}

function logIn(settings, callback) {
  form = {
    login: settings.credentials.personal_cabinet.login,
    pass: settings.credentials.personal_cabinet.password
    // password: settings.credentials.personal_cabinet.password
  };

  data = {
    url: settings.credentials.personal_cabinet.login_url,
    followAllRedirects: true,
    // jar: true,
    form: form
  };

  request.post(data, function (error, response, body) {
    logger.log('error:', error); // Print the error if one occurred
    logger.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // logger.log('body:', body); // Print the HTML for the Google homepage.
    logger.writeToFile(body, 'log/login.html');

    callback(settings);
  });
}

function getOrderUpdatesCallback(settings, orders, date) {
  logger.log(`new orders for ${date.toFormat(constants.DATE_FORMAT)} (${orders.length})`);
  // send to telega
  sendOrdersToTelegram(settings, orders, date);
  historyManager.saveRawOrdersToHistory(orders, date);
}

async function startUpdatesPolling(settings) {
  let update_interval = settings.update_interval * 1000;
  let tomorrow = DateTime.local().plus({ days: 1 });
  while(true) {
    let dt_string = DateTime.local().toISO();
    logger.log(`getting updates at ${dt_string}`);
    getOrdersUpdates(settings, getOrderUpdatesCallback);
    getOrdersUpdates(settings, getOrderUpdatesCallback, tomorrow);

    await util.sleep(update_interval);
  }
}

function formatDate(date) {
  return date.toFormat(constants.DATE_FORMAT);
}

function filterOnlyOrders(i, elem) {
  return i > 0;
}

function filterByTime(i, elem) {
  let from_hour = settings.orders_filter.from_hour,
    to_hour = settings.orders_filter.to_hour;

  if (!(from_hour && to_hour))
    return true;

  try {
    let dt_string = cheerio(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);
    return hour >= from_hour && hour <= to_hour;
  } catch (e) {
    return true;
  }
}

function filterByStatus(i, elem) {
  // TODO
  return true;
}

function filterByHistory(i, elem) {
  let order_number = cheerio(elem).children('td').eq(1).text();

  return !historyManager.dayHistoryIncludes(order_number);
}

function filterOrders(i, elem) {
  return filterOnlyOrders(i, elem) &&
    filterByTime(i, elem) &&
    filterByStatus(i, elem) &&
    filterByHistory(i, elem);
}

function getOrdersUpdates(settings, callback, date = DateTime.local()) {
  data = {
    url: settings.orders_page,
    qs: { 'date': formatDate(date) }
  };
  request.get(data, function (error, response, body) {
    if (error) {
      logger.log('error:', error); // Print the error if one occurred
      logger.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      return null;
    }

    let $ = cheerio.load(body);
    // selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';
    selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

    $orders_tbody = $(selector);
    $orders = $orders_tbody.children('tr');
    historyManager.readOrdersHistory(date);
    $orders = $orders.filter(filterOrders);

    callback(settings, $orders, date);
  });
}

function getColumnText(row, colNum) {
  return row.children('td').eq(colNum).text()
}

function renderOrderData(order) {
  // 1, 3, 6, 7, 5, 2
  let orderNumber = getColumnText(order, 1),
    metro = getColumnText(order, 3),
    address = getColumnText(order, 6),
    client = getColumnText(order, 7),
    problem = getColumnText(order, 5),
    time = getColumnText(order, 2);

  return `м. ${metro}, ${address}; ${client}; ${problem}, ${time}, ${orderNumber}`
}

function seizeOrderUrl(orderNumber) {
  return (`http://ultima.uk.to/sched.php?id=${orderNumber}`);
}

function getReplyMarkup(orderNumber) {
  return reply_markup = {
    inline_keyboard: [
      [{ text: 'Забрать заказ', url: seizeOrderUrl(orderNumber)}]
    ]
  };
}

getDelayBetweenRequests = function (){
  return settings.credentials.telegram_bot.delay_between_requests;
};

async function sendOrdersToTelegram(settings, orders, date = DateTime.local()) {
  await util.asyncForEach(orders, async function(i, elem) {
    let delay = getDelayBetweenRequests();
    let orderNumber = getColumnText(cheerio(elem), 1);
    let replyMarkup = getReplyMarkup(orderNumber);

    telegramApi.sendToTelegram(settings, renderOrderData(cheerio(elem)), replyMarkup, date);
    await util.sleep(delay);
  });
};


function test_run() {
  if (settings) {
    // telegramApi.getBotSubscribers(DateTime.local()).then(response => console.log('Today Subscribers: ', response));
    // telegramApi.getBotSubscribers(DateTime.local().plus({days: 1})).then(response => console.log('Tomorrow Subscribers: ', response));
  }

  // let dt = DateTime.fromFormat('2018-11-04', 'yyyy-LL-dd');
  // console.log(isToday(dt));

  // let text = '1   2 \n 44   5 \n ';
  // console.log(text);
  // console.log(sanitizeText(text));

}

run();
// history = getOrdersHistory();
// saveOrdersToHistory(history, [1,2]);

// test_run();