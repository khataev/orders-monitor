const yaml = require('js-yaml');
const requestGlobal = require('request');
let request = requestGlobal.defaults({jar: true});
const fs = require('fs');
const { DateTime } = require('luxon');
const cheerio = require('cheerio');
const DATE_FORMAT = 'dd-LL-yyyy';

// TODO: разнести по файлам
// TODO: алгоритм поиска обновлений с запоминанием последней заявки на дату в файле
// TODO: обработка разлогинивания раз в час
function run() {
  let settings = readSettings();

  // TODO(khataev): kill task longer than threshold time
  if (settings) {
    logIn(settings, getUpdates)
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readSettings() {
  let settings;
  try {
    settings = yaml.safeLoad(fs.readFileSync('settings.yml', 'utf8'));
  } catch (e) {
    console.log(e);
  }

  return settings;
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
    console.log('error:', error); // Print the error if one occurred
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // console.log('body:', body); // Print the HTML for the Google homepage.
    writeToFile(body, 'files/login.html');

    callback(settings);
  });
}

async function getUpdates(settings) {
  update_interval = settings.update_interval * 1000;
  tomorrow = DateTime.local().plus({ days: 1 });
  while(true) {
    dt_string = DateTime.local().toISO();
    console.log(`getting updates at ${dt_string}`);
    getOrdersUpdates(settings);
    getOrdersUpdates(settings, tomorrow);
    await Promise.all([sleep(update_interval)]);
  }
}

function formatDate(date) {
  return date.toFormat(DATE_FORMAT);
}

function filterOnlyOrders(i, elem) {
  // return cheerio(elem).children('td').eq(1).attr('class') !== 'th';
  return i > 0;
}

function filterByTime(i, elem) {
  try {
    let dt_string = cheerio(elem).children('td').eq(2).text();
    // dt = DateTime.fromFormat(dt_string, 'dd-LL HH:mm');
    let hour = Number.parseInt(dt_string.split(' ')[1].split(':')[0]);

    return hour > 7 && hour < 23;
  } catch (e) {
    return true;
  }
}

function filterByStatus(i, elem) {
  // TODO
  return true;
}

function filterOrders(i, elem) {
  return filterOnlyOrders(i, elem) && filterByTime(i, elem) && filterByStatus(i, elem);
}

function getOrdersUpdates(settings, date = DateTime.local()) {
  data = {
    url: settings.orders_page,
    qs: { 'date': formatDate(date) }
  }
  request.get(data, function (error, response, body) {
    console.log('error:', error); // Print the error if one occurred
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // console.log('body:', body); // Print the HTML for the Google homepage.
    writeToFile(body, 'files/sched.html');

    let $ = cheerio.load(body);
    // selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';
    selector = '#body > table:nth-child(2) > tbody > tr > td > table:nth-child(6) > tbody';

    $orders_tbody = $(selector);
    $orders = $orders_tbody.children('tr');
    console.log($orders.length);
    $orders.filter(filterOrders).each(function(i, elem){
      sendToTelegram(settings, renderOrderData($(elem)));
    });

    writeToFile($orders.html(), 'files/result.html');

  });
}

function renderOrderData(order) {
  function getColumnText(row, colNum) {
    return row.children('td').eq(colNum).text()
  }

  // 1, 3, 6, 7, 5, 2
  let orderNumber = getColumnText(order, 1),
    metro = getColumnText(order, 3),
    address = getColumnText(order, 6),
    client = getColumnText(order, 7),
    problem = getColumnText(order, 5),
    time = getColumnText(order, 2);

  return `${orderNumber} ${metro} ${address} ${client} ${problem} ${time}`
}

function writeToFile(text, file_name) {
  fs.writeFile(file_name, text, function(err) {
    if(err) {
      return console.log(err);
    }
    console.log("The file was saved!");
  });
}

// TODO: определение chat_id по имени канала
function sendToTelegram(settings, text) {
  api_token = settings.credentials.telegram_bot.api_token;
  chat_id   = settings.credentials.telegram_bot.chat_id;
  cond = true

  text = encodeURI(text);
  url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${text}`;

  request.post({
    url: url
  }, function(error, response, body) {
    if (error) {
      console.log('error:', error); // Print the error if one occurred
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    }
  });
}

run();