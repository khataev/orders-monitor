require("newrelic");

const requestGlobal = require("request");
const express = require("express");
const bodyParser = require("body-parser");

// local files
const constants = require("./modules/constants");
const logger = require("./modules/logger");
const settings = require("./modules/config");
const telegram = require("./modules/telegram");
const util = require("./modules/util");
const parser = require("./modules/parser");
const history = require("./modules/history");
const packageInfo = require("./package.json");

const request = requestGlobal.defaults({ jar: true });
const telegramApi = new telegram(settings, logger, true);
const historyManager = new history(settings, logger);
const parserApi = new parser(historyManager, request, settings, logger);

let today_attempt = 0,
  tomorrow_attempt = 0;

let intermediate_interval_feature =
  settings.get("features.intermediate_interval") === "enabled";

function handleSeizeButton(req, res, bot = "today") {
  logger.log(req.body);

  let query_id = parserApi.getCallbackQueryIdFormCallback(req.body),
    order_number = parserApi.getOrderNumberFromCallback(req.body),
    chat_id = parserApi.getChatIdFromCallback(req.body);

  logger.log(`query_id: ${query_id}`);
  logger.log(`order_number: ${order_number}`);
  logger.log(`chat_id: ${chat_id}`);
  res.json({ result: `${bot} handler!` });

  if (!query_id || !order_number || !chat_id) return;

  logInAs(settings, chat_id)
    .then(jar => seizeOrder(order_number, jar))
    .then(jar => parserApi.checkSeizeResult(requestGlobal, order_number, jar))
    .then(orderSeized => {
      if (orderSeized) {
        logger.warn(`Заказ ${order_number} взят`);
        telegramApi.answerCallbackQuery(
          query_id,
          `Заказ ${order_number} взят`,
          bot
        );
      } else {
        logger.warn(`Заказ ${order_number} не взят, возможно, вас опередили`);
        telegramApi.answerCallbackQuery(
          query_id,
          `Заказ ${order_number} не взят, возможно, вас опередили`,
          bot
        );
      }
    })
    .catch(error => {
      logger.error(error);
      telegramApi.answerCallbackQuery(
        query_id,
        `Ошибка взятия заказа: ${error}`,
        bot
      );
    });
}

function start_simple_server() {
  if (settings.get("env") == "production") {
    const http = require("http");
    let port = process.env.PORT || 80;
    const server = http.createServer((request, response) => {
      logger.warn(request.url);
      response.end("Hello Node.js Server!");
    });

    server.listen(port, err => {
      if (err) {
        return logger.error(`something bad happened: ${err}`);
      }
      logger.warn(`server is listening on ${port}`);
    });
  }
}

function start_express_server() {
  if (settings.get("env") === "production") {
    logger.warn("start_express_server");
    let app = express(),
      today_token = settings.get("credentials.telegram_bot.today.api_token"),
      tomorrow_token = settings.get(
        "credentials.telegram_bot.tomorrow.api_token"
      );

    //Here we are configuring express to use body-parser as middle-ware.
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get("/", function (req, res) {
      res.json({ version: packageInfo.version });
    });

    app.post(`/${today_token}`, function (req, res) {
      handleSeizeButton(req, res);
    });

    app.post(`/${tomorrow_token}`, function (req, res) {
      handleSeizeButton(req, res, "tomorrow");
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
      "credentials.personal_cabinet.master_accounts"
    );
    logger.debug(manager_accounts);
    logger.fatal(`started with '${logger.currentLogLevel()}' log level`);

    historyManager
      .initOrdersHistory()
      .then(orders => {
        logger.warn("INIT ORDERS HISTORY COMPLETE");
      })
      .then(result => {
        // logger.log(settings.get('orders.statuses'));
        logIn(settings, startUpdatesPolling);
      });
  }
}

function logIn(settings, callback) {
  form = {
    login: settings.get("credentials.personal_cabinet.login"),
    pass: settings.get("credentials.personal_cabinet.password")
  };

  data = {
    url: settings.get("credentials.personal_cabinet.login_url"),
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
    let accounts = settings.get("credentials.personal_cabinet.master_accounts");
    let manager = accounts[telegram_chat_id];
    let login = manager && manager["login"];
    let password = manager && manager["password"];
    if (!(login && password)) {
      reject(
        `Логин и пароль для доступа к ЛК от имени chat_id=${telegram_chat_id} не указаны`
      );
    }

    let form = {
      login: accounts[telegram_chat_id]["login"],
      pass: accounts[telegram_chat_id]["password"]
    };
    let data = {
      url: settings.get("credentials.personal_cabinet.login_url"),
      followAllRedirects: true,
      form: form
    };
    const jar = requestGlobal.jar();
    const request = requestGlobal.defaults({ jar: jar });
    request.post(data, function (error, response, body) {
      if (error) {
        util.log_request_error(error, response);
        reject(error);
      }
      console.log('logInAs', 'jar', jar);
      resolve(jar);
    });
  });
}

function seizeOrder(orderNumber, jar) {
  return historyManager.findOrder(orderNumber).then(order => {
    return new Promise((resolve, reject) => {
      const seize_url = parserApi.seizeOrderUrl(order.eid);
      const request = requestGlobal.defaults({ jar: jar });
      request.get(seize_url, function (error, response, body) {
        if (error) {
          util.log_request_error(error, response);
          reject(error);
        }
        resolve(jar);
      });
    });
  });
}

// used when order is in accounting status (and should be sent to telegram)
function positiveStatusCallback(order_row, date) {
  let orderNumber = parserApi.getOrderNumber(order_row);
  let eid = parserApi.getOrderEid(order_row);
  sendOrderToTelegram(order_row, date).then(sent_messages => {
    historyManager.saveOrderToHistory(orderNumber, eid, date, sent_messages);
    historyManager.releaseProcessingOrder(orderNumber);
  });
}

// for other cases, when we ignore this order
function negativeStatusCallback(order_row) {
  historyManager.releaseProcessingOrder(parserApi.getOrderNumber(order_row));
}

function getOrderUpdatesCallback(attempt, settings, orders, date) {
  logger.log(
    `filtered orders attempt ${attempt} for ${date.toFormat(
      constants.DATE_FORMAT
    )} (${orders.length})`
  );
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
    .then(updates => {
      // process new orders
      parserApi.lockProcessingOrderRows(updates.new_orders);
      getOrderUpdatesCallback(
        today_attempt,
        settings,
        updates.new_orders,
        date
      );

      return updates;
    })
    .then(updates => processSeizedOrders(today_attempt, updates, date))
    .catch(error => logger.error(`getToday error: ${error}`));
}

function getTomorrow() {
  let date = util.getTomorrowDate();
  tomorrow_attempt++;
  parserApi
    .getOrdersUpdates(tomorrow_attempt, date)
    .then(updates => {
      parserApi.lockProcessingOrderRows(updates.new_orders);
      getOrderUpdatesCallback(
        tomorrow_attempt,
        settings,
        updates.new_orders,
        date
      );

      return updates;
    })
    .then(updates => processSeizedOrders(tomorrow_attempt, updates, date))
    .catch(error => logger.error(`getTomorrow error: ${error}`));
}

// process seized orders
function processSeizedOrders(attempt, updates, date) {
  let day = util.isToday(date) ? "TODAY" : "TOMORROW";
  let order_numbers = parserApi.getOrderNumbers(updates.current_orders);

  logger.log(`${day} CURRENT (attempt ${attempt}): ${order_numbers}`);
  logger.info(`${day} CURRENT (attempt ${attempt}): ${order_numbers.length}`);
  historyManager
    .markSeizedOrders(order_numbers, date)
    .then(async seized_orders => {
      if (seized_orders.length > 0) {
        let seized_order_numbers = seized_orders.map(
          order => order.orderNumber
        );
        logger.warn(
          `${day} SEIZED (attempt ${attempt}): ${seized_order_numbers}`
        );

        if (
          settings.get("features.seized_order_message_editing") === "enabled"
        ) {
          await util.asyncForEach(seized_orders, async (i, order) => {
            let bot = util.wasOrderSentToTodayBot(order)
              ? telegramApi.getTodayBot()
              : telegramApi.getTomorrowBot();
            await telegramApi.editMessagesInTelegramForBot(
              order.sent_messages,
              telegramApi.getEmptyReplyMarkupBotOptions(),
              bot
            );
          });
        }

        if (seized_orders.length > 5) {
          let text = `ATTENTION, MASS SEIZING! (attempt ${attempt})`;
          logger.warn(text);

          if (logger.isEqualOrHigherLevel("debug")) {
            telegramApi.sendToTelegram(
              text,
              telegramApi.getEmptyReplyMarkupBotOptions(),
              date
            );
          }
        }
      }
    })
    .catch(error => logger.error(error));
}

function startUpdatesPolling(settings) {
  let update_interval = settings.get("orders.update_interval") * 1000;
  let intermediate_interval = intermediate_interval_feature
    ? update_interval / 2
    : 1000;

  setInterval(poll, update_interval, intermediate_interval);
}

async function poll(intermediate_interval) {
  getToday();
  await util.sleep(intermediate_interval);
  getTomorrow();
}

async function sendOrderToTelegram(order_row, date) {
  const orderNumber = parserApi.getOrderNumber(order_row);
  const replyMarkup = telegramApi.getReplyMarkupBotApiOptions(orderNumber);
  const text = parserApi.renderOrderData(order_row);
  return telegramApi.sendToTelegram(text, replyMarkup, date);
}

run();
