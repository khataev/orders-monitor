const yaml = require('js-yaml');
const requestGlobal = require('request');
const fs = require('fs');
const { DateTime } = require('luxon');

// local files
const constants = require('./modules/constants');
const logger = require('./modules/logger');
const settings = require('./modules/config.js');
const telegram = require('./modules/telegram');
const util = require('./modules/util');
const parser = require('./modules/parser');
const history = require('./modules/history');

let request = requestGlobal.defaults({jar: true});
let telegramApi = new telegram(settings, logger);
let historyManager = new history(logger);
let parserApi = new parser(historyManager, request, settings, logger);

// TODO: обработка разлогинивания раз в час ??
function run() {
  if (settings) {
    logIn(settings, startUpdatesPolling);
  }
}

function logIn(settings, callback) {
  form = {
    login: settings.get('credentials.personal_cabinet.login'),
    pass: settings.get('credentials.personal_cabinet.password')
  };

  data = {
    url: settings.get('credentials.personal_cabinet.login_url'),
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
  let update_interval = settings.get('orders.update_interval') * 1000;
  let tomorrow = DateTime.local().plus({ days: 1 });
  while(true) {
    let dt_string = DateTime.local().toISO();
    logger.log(`getting updates at ${dt_string}`);
    parserApi.getOrdersUpdates(getOrderUpdatesCallback);
    parserApi.getOrdersUpdates(getOrderUpdatesCallback, tomorrow);

    await util.sleep(update_interval);
  }
}

async function sendOrdersToTelegram(settings, orders, date = DateTime.local()) {
  await util.asyncForEach(orders, async function(i, elem) {
    let delay = telegramApi.getDelayBetweenRequests();
    let orderNumber = parserApi.getOrderNumber(elem);
    let replyMarkup = parserApi.getReplyMarkup(orderNumber);
    let text = parserApi.renderOrderData(elem);

    telegramApi.sendToTelegram(settings, text, replyMarkup, date);
    await util.sleep(delay);
  });
}

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
// test_run();