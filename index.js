var request = require('request');
var fs = require('fs');
request.post({
	url: 'https://passport.yandex.ru/passport',
	followAllRedirects: true,
	jar: true,
	form: {login:'', password:''}
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
  // if (error) {
  //       console.log(error);
  //   } else {
  //       console.log(body, response.statusCode);
  //       request(response.headers['location'], function(error, response, html) {
  //           console.log(html);
  //       });
  //   }
});
