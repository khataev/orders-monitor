let yaml = require('js-yaml');
let request = require('request');
let fs = require('fs');

// Get document, or throw exception on error
try {
  let doc = yaml.safeLoad(fs.readFileSync('settings.yml', 'utf8'));

// setBreakpoint();

  request.post({
    url: 'https://passport.yandex.ru/passport',
    followAllRedirects: true,
    jar: true,
    form: { login: doc.credentials.personal_cabinet.login, password: doc.credentials.personal_cabinet.password }
  }, function (error, response, body) {
    console.log('error:', error); // Print the error if one occurred
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    // console.log('body:', body); // Print the HTML for the Google homepage.

    fs.writeFile('response.html', body, function(err) {
      if(err) {
          return console.log(err);
      }
      console.log("The file was saved!");
    });

    api_token = doc.credentials.telegram_bot.api_token;
    chat_id   = doc.credentials.telegram_bot.chat_id;

    for (let i of [1, 2, 3, 4, 5]) {
      text      = `text ${i}`
      url = `https://api.telegram.org/bot${api_token}/sendMessage?chat_id=${chat_id}&text=${text}`

      request.post({
        url: url
      }, function(error, response, body) {
        console.log('error:', error); // Print the error if one occurred
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      });
    }
    // if (error) {
    //       console.log(error);
    //   } else {
    //       console.log(body, response.statusCode);
    //       request(response.headers['location'], function(error, response, html) {
    //           console.log(html);
    //       });
    //   }
  });

} catch (e) {
  console.log(e);
}
