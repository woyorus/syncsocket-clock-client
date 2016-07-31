const URL = require('url');
const http = require('http');

module.exports = ClockClient;

function ClockClient(url, opts) {
    if (!(this instanceof ClockClient)) return new ClockClient(url, opts);
    opts = opts || {};
    let parsedUrl = URL.parse(url);
    this.serverHost = parsedUrl.hostname;
    this.serverPort = parseInt(parsedUrl.port) || 5579;
}

ClockClient.prototype.sendClock = function (cb) {
    let localStampSent = Date.now();
    let request = http.get({
        host: this.serverHost,
        port: this.serverPort,
        path: '/',
        method: 'GET',
        headers: { 'X-Client-Timestamp': '' + localStampSent }
    }, (res) => {
        if (res.statusCode !== 200) {
            cb(new Error('Server response isn\'t 200! (it is ' + res.statusCode + ')'));
            return;
        }
        var body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
            let localStampReceived = Date.now();
            let parts = body.split(',');
            let responseStampCheck = parts[0];
            let responseStampRemote = parts[1];
            if (localStampSent !== parseInt(responseStampCheck)) {
                cb(new Error('Timestamp verification failed!'));
            }
            else {
                cb(null, {
                    sent: localStampSent,
                    received: localStampReceived,
                    remote: parseInt(responseStampRemote)
                });
            }
        });
    });
    request.on('error', function (err) {
        cb(err);
    });
    request.end();
};

