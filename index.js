const requestGlobal = require('request');
const { DateTime } = require('luxon');
const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');

// local files
const constants = require('./modules/constants');
const logger = require('./modules/logger');
const settings = require('./modules/config');
const telegram = require('./modules/telegram');
const util = require('./modules/util');
const parser = require('./modules/parser');
const history = require('./modules/history');
const packageInfo = require('./package.json');

let request = requestGlobal.defaults({jar: true});
let telegramApi = new telegram(settings, logger);
let historyManager = new history(settings, logger);
let parserApi = new parser(historyManager, request, settings, logger);
let today_attempt = 0,
  tomorrow_attempt = 0;

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

// TODO: khataev: change version
function start_express_server() {
  if (settings.get('env') == 'production') {
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
      let query_id = parserApi.getCallbackQueryIdFormCallback(req.body),
        order_number = parserApi.getOrderNumberFromCallback(req.body),
        chat_id = parserApi.getChatIdFromCallback(req.body);

      logger.log(`query_id: ${query_id}`);
      logger.log(`orderNumber: ${order_number}`);
      logger.log(`chat_id: ${chat_id}`);
      logger.log(req.body);
      res.json({ result: 'today handler!' });
      telegramApi.answerCallbackQueryToday(query_id, chat_id, order_number);
    });

    app.post(`/${tomorrow_token}`, function (req, res) {
      let query_id = parserApi.getCallbackQueryIdFormCallback(req.body),
        order_number = parserApi.getOrderNumberFromCallback(req.body),
        chat_id = parserApi.getChatIdFromCallback(req.body);

      logger.log(`query_id: ${query_id}`);
      logger.log(`orderNumber: ${order_number}`);
      logger.log(`chat_id: ${chat_id}`);
      logger.log(req.body);
      res.json({ result: 'tomorrow handler!' });
    });

    let server = app.listen(process.env.PORT, function () {
      let host = server.address().address;
      let port = server.address().port;

      console.log(`Server started at http://${host}:${port}`);
    });
  }
}

function start_express_https_server() {
  if (settings.get('env') == 'production') {
    const https = require('https');
    logger.log('start_express_https_server');
    let app = express(),
      today_token = settings.get('credentials.telegram_bot.today.api_token'),
      tomorrow_token = settings.get('credentials.telegram_bot.tomorrow.api_token');

    app.get('/', function (req, res) {
      res.json({ version: packageInfo.version });
    });

    app.get(`/${today_token}`, function (req, res) {
      res.json({ result: 'today handler!' });
    });

    app.get(`/${tomorrow_token}`, function (req, res) {
      res.json({ result: 'tomorrow handler!' });
    });

    let env = settings.get('env');

    let options = {
      key: fs.readFileSync(`certs/${env}/server.key`),
      cert: fs.readFileSync(`certs/${env}/server.crt`),
      requestCert: false,
      rejectUnauthorized: false
    };

    let server =
      https
        .createServer(options, app)
        .listen(process.env.PORT, function () {
          let host = server.address().address;
          let port = server.address().port;

          logger.log(`Server started at https://${host}:${port}`);
        });
  }
}

function run() {
  if (settings) {
    start_express_server();

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
      // TODO: shutdown function
    }
    callback(settings);
  });
}

// used when order is in accounting status (and should be sent to telegram)
function positiveStatusCallback(order_row, date) {
  sendOrderToTelegram(order_row, date);
  historyManager.saveOrderToHistory(
    parserApi.getOrderNumber(order_row),
    date
  );
  historyManager.releaseProcessingOrder(
    parserApi.getOrderNumber(order_row)
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
  let now = DateTime.local();
  today_attempt++
  parserApi.getOrdersUpdates(today_attempt, getOrderUpdatesCallback, now);
}

function getTomorrow() {
  let tomorrow = DateTime.local().plus({ days: 1 });
  tomorrow_attempt++
  parserApi.getOrdersUpdates(tomorrow_attempt, getOrderUpdatesCallback, tomorrow);
}

async function startUpdatesPolling(settings) {
  let update_interval = settings.get('orders.update_interval') * 1000;
  let attempt = 0;

  setInterval(getToday, update_interval);
  await util.sleep(update_interval/2);
  setInterval(getTomorrow, update_interval);
}

async function startUpdatesPollingOld(settings) {
  let update_interval = settings.get('orders.update_interval') * 1000;
  let attempt = 0;
  while(true) {
    attempt = attempt + 1;
    let now = DateTime.local();
    let tomorrow = DateTime.local().plus({ days: 1 });
    let dt_string = now.toISO();
    logger.log(`today: ${now}, tomorrow: ${tomorrow}`);
    logger.log(`GETTING UPDATES, attempt ${attempt} at: ${dt_string}`);
    // historyManager.printGlobalHistory();
    parserApi.getOrdersUpdates(attempt, getOrderUpdatesCallback, now);
    await util.sleep(update_interval);

    parserApi.getOrdersUpdates(attempt, getOrderUpdatesCallback, tomorrow);
    await util.sleep(update_interval);
  }
}

async function sendOrderToTelegram (order_row, date) {
  let orderNumber = parserApi.getOrderNumber(order_row);
  const replyMarkup = parserApi.getReplyMarkupBotApi(orderNumber);
  let text = parserApi.renderOrderData(order_row);

  await telegramApi.sendToTelegram(settings, text, replyMarkup, date);
}

function test_run() {
  if (settings) {

    logIn(settings, (settings) => {parserApi.getOrderStatus(47703698);});

    // const Sequelize = require('sequelize');
    // const database = require('./config/database');
    // sequelize = new Sequelize(database[settings.get('env')]);
    // Order = sequelize.import("./models/order");
    //
    // historyManager
    //   .initOrdersHistory()
    //   .then(orders => { console.log('INIT COMPLETE'); })
    //   .then(result => {
    //
    //
    //     result = historyManager.dayHistoryIncludes('47653830');
    //     console.log('result', result)
    //     console.log('exit');
    //   });

    // console.log(DateTime.local().toJSDate());
    key = DateTime.local().toFormat(constants.ORDERS_HISTORY_DATE_FORMAT);
  }
}

run();
// test_run();