require('newrelic');

const requestGlobal = require('request');
const express = require('express');
const bodyParser = require('body-parser');

// local files
const constants = require('./modules/constants');
const logger = require('./modules/logger');
const settings = require('./modules/config');
const telegram = require('./modules/telegram');
const util = require('./modules/util');
const parser = require('./modules/parser');
const history = require('./modules/history');
// const testScripts = require('./modules/test');
const packageInfo = require('./package.json');

const request = requestGlobal.defaults({jar: true});
const telegramApi = new telegram(settings, logger, true);
const historyManager = new history(settings, logger);
const parserApi = new parser(historyManager, request, settings, logger);

let today_attempt = 0,
  tomorrow_attempt = 0;

function handleSeizeButton(req, res, bot = 'today') {
  logger.log(req.body);

  let query_id = parserApi.getCallbackQueryIdFormCallback(req.body),
    order_number = parserApi.getOrderNumberFromCallback(req.body),
    chat_id = parserApi.getChatIdFromCallback(req.body);

  logger.log(`query_id: ${query_id}`);
  logger.log(`order_number: ${order_number}`);
  logger.log(`chat_id: ${chat_id}`);
  res.json({ result: `${bot} handler!` });

  if (!query_id || !order_number || !chat_id)
    return;

  logInAs(settings, chat_id)
    .then(jar => seizeOrder(order_number, jar))
    .then(jar => parserApi.checkSeizeResult(requestGlobal, order_number, jar))
    .then(orderSeized => {
      if (orderSeized) {
        logger.log(`Заказ ${order_number} взят`);
        telegramApi.answerCallbackQuery(query_id, `Заказ ${order_number} взят`, bot);
      }
      else {
        logger.log(`Заказ ${order_number} не взят, возможно, вас опередили`);
        telegramApi
          .answerCallbackQuery(
            query_id,
            `Заказ ${order_number} не взят, возможно, вас опередили`,
            bot
          );
      }
    })
    .catch(error => {
      logger.log(error);
      telegramApi.answerCallbackQuery(query_id, `Ошибка взятия заказа: ${error}`, bot);
    });
}

function start_simple_server() {
  if (settings.get('env') == 'production') {
    const http = require('http')
    let port = process.env.PORT || 80;
    const server = http.createServer((request, response) => {
      logger.log(request.url);
      response.end('Hello Node.js Server!');
    });

    server.listen(port, (err) => {
      if (err) {
        return logger.log(`something bad happened: ${err}`);
      }
      logger.log(`server is listening on ${port}`);
    })
  }
}

function start_express_server() {
  if (settings.get('env') === 'production') {
    logger.log('start_express_server');
    let app = express(),
      today_token = settings.get('credentials.telegram_bot.today.api_token'),
      tomorrow_token = settings.get('credentials.telegram_bot.tomorrow.api_token');

    //Here we are configuring express to use body-parser as middle-ware.
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get('/', function (req, res) {
      res.json({ version: packageInfo.version });
    });

    app.post(`/${today_token}`, function (req, res) {
      handleSeizeButton(req, res);
    });

    app.post(`/${tomorrow_token}`, function (req, res) {
      handleSeizeButton(req, res, 'tomorrow');
    });

    let server = app.listen(process.env.PORT, function () {
      let host = server.address().address;
      let port = server.address().port;

      console.log(`Server started at http://${host}:${port}`);
    });
  }
}

function run() {
  if (settings) {
    start_express_server();

    let manager_accounts = settings.get(
      'credentials.personal_cabinet.master_accounts'
    );
    logger.log(manager_accounts, 'debug');

    historyManager
      .initOrdersHistory()
      .then(orders => { logger.log('INIT ORDERS HISTORY COMPLETE'); })
      .then(result => {
        // logger.log(settings.get('orders.statuses'));
        logIn(settings, startUpdatesPolling);
      });
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
    if (error) {
      util.log_request_error(error, response);
      return;
    }
    callback(settings);
  });
}

function logInAs(settings, telegram_chat_id) {
  return new Promise((resolve, reject) => {
    let accounts = settings.get('credentials.personal_cabinet.master_accounts');
    let manager = accounts[telegram_chat_id];
    let login = manager && manager['login'];
    let password = manager && manager['password'];
    if (!(login && password)) {
      reject(`Логин и пароль для доступа к ЛК от имени chat_id=${telegram_chat_id} не указаны`);
      return;
    }

    let form = {
      login: accounts[telegram_chat_id]['login'],
      pass: accounts[telegram_chat_id]['password']
    };
    let data = {
      url: settings.get('credentials.personal_cabinet.login_url'),
      followAllRedirects: true,
      form: form
    };
    const jar = requestGlobal.jar();
    const request = requestGlobal.defaults({jar: jar});
    request.post(data, function (error, response, body) {
      if (error) {
        util.log_request_error(error, response);
        reject(error);
      }
      resolve(jar);
    });
  });
}

function seizeOrder(order_number, jar) {
  return new Promise((resolve, reject) => {
    const seize_url = parserApi.seizeOrderUrl(order_number);
    const request = requestGlobal.defaults({jar: jar});
    // const request = requestGlobal.defaults({});
    request.get(seize_url, function (error, response, body) {
      if (error) {
        util.log_request_error(error, response);
        reject(error);
        return;
      }
      resolve(jar);
    });
  });
}

// used when order is in accounting status (and should be sent to telegram)
function positiveStatusCallback(order_row, date) {
  let orderNumber = parserApi.getOrderNumber(order_row);
  sendOrderToTelegram(order_row, date)
    .then((message_ids) => {
        // historyManager.saveMessageIdsForOrder(orderNumber, message_ids)
        historyManager.saveOrderToHistory(
          orderNumber,
          date,
          message_ids
        );
        historyManager.releaseProcessingOrder(orderNumber);
      }
    );
}

// for other cases, when we ignore this order
function negativeStatusCallback(order_row) {
  historyManager.releaseProcessingOrder(
    parserApi.getOrderNumber(order_row)
  );
}

function getOrderUpdatesCallback(attempt, settings, orders, date) {
  logger.log(`filtered orders attempt ${attempt} for ${date.toFormat(constants.DATE_FORMAT)} (${orders.length})`);
  parserApi.filterByStatus(
    attempt,
    orders,
    date,
    positiveStatusCallback,
    negativeStatusCallback
  );
}

function getToday() {
  let date = util.getNowDate();
  today_attempt++;
  parserApi
    .getOrdersUpdates(today_attempt, date)
    .then((updates) => {
      // process new orders
      parserApi.lockProcessingOrderRows(updates.new_orders);
      getOrderUpdatesCallback(today_attempt, settings, updates.new_orders, date);

      return updates;
    })
    .then(updates => processSeizedOrders(today_attempt, updates, date))
    .catch(error => logger.log(`getToday error: ${error}`));
}

function getTomorrow() {
  let date = util.getTomorrowDate();
  tomorrow_attempt++;
  parserApi
    .getOrdersUpdates(tomorrow_attempt, date)
    .then((updates) => {
      parserApi.lockProcessingOrderRows(updates.new_orders);
      getOrderUpdatesCallback(tomorrow_attempt, settings, updates.new_orders, date);

      return updates;
    })
    .then(updates => processSeizedOrders(tomorrow_attempt, updates, date))
    .catch(error => logger.log(`getTomorrow error: ${error}`));
}

// process seized orders
function processSeizedOrders(attempt, updates, date) {
  let day = util.isToday(date) ? 'TODAY' : 'TOMORROW';
  let order_numbers = parserApi.getOrderNumbers(updates.current_orders);

  logger.log(`${day} CURRENT (attempt ${attempt}): ${order_numbers}`);
  historyManager.markSeizedOrders(order_numbers, date)
    .then((seized_orders) => {
      if (seized_orders.length > 0) {
        let seized_order_numbers = seized_orders.map(order => order.orderNumber);
        let message_ids = seized_orders.flatMap(order => order.message_ids);
        logger.log(`${day} SEIZED (attempt ${attempt}): ${seized_order_numbers}`);

        if (settings.get('features.seized_order_message_editing') === 'enabled') {
          telegramApi
            .editMessagesInTelegram(message_ids, telegramApi.getEmptyReplyMarkupBotOptions(), date);
        }

        if (seized_orders.length > 5) {
          let text = `ATTENTION, MASS SEIZING! (attempt ${attempt})`;
          logger.log(text);

          if (logger.isEqualOrHigherLevel('debug')) {
            telegramApi.sendToTelegram(
              settings,
              text,
              telegramApi.getEmptyReplyMarkupBotOptions(),
              date
            );
          }
        }
      }
    })
    .catch(error => logger.log(error));
}

async function startUpdatesPolling(settings) {
  let update_interval = settings.get('orders.update_interval') * 1000;
  let attempt = 0;

  setInterval(getToday, update_interval);
  await util.sleep(update_interval/2);
  setInterval(getTomorrow, update_interval);
}

async function sendOrderToTelegram (order_row, date) {
  const orderNumber = parserApi.getOrderNumber(order_row);
  const replyMarkup = telegramApi.getReplyMarkupBotApiOptions(orderNumber);
  const text = parserApi.renderOrderData(order_row);

  return telegramApi.sendToTelegram(settings, text, replyMarkup, date);
}

run();
// testScripts.test_run();