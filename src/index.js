const URL = require('url');
const http = require('http');

module.exports = ClockClient;

function ClockClient(url, opts) {
    if (!(this instanceof ClockClient)) return new ClockClient(url, opts);
    opts = opts || {};
    let parsedUrl = URL.parse(url);
    this.serverHost = parsedUrl.hostname;
    this.serverPort = parseInt(parsedUrl.port) || 5579;
    this.targetPrecision = opts.targetPrecision || 50;
    this.minReadingDelay = opts.minReadingDelay || 1;
    this.clockDrift = opts.clockDrift || 0;

    let upperBound = this.calcUpperBound();
    let minUpperBound = this.calcMinUpperBound();

    if (!(this.verifyUpperBound(upperBound, minUpperBound))) {
        throwInvalidSetting();
    }

    this.timeoutDelay = this.calcTimeoutDelay(upperBound);

    console.log(`timeoutDelay=${this.timeoutDelay}, minUB=${minUpperBound}. Adjust settings to make these as close as possible`);
}

function throwInvalidSetting() {
    throw new Error('Clock client is set up incorrectly. Check client parameters.');
}

ClockClient.prototype.sync = function () {
    return new Promise((resolve, reject) => {
        let localSentStamp = Date.now();
        this.sendClock(localSentStamp, (err, remoteResponseStamp) => {
            let localRecvStamp = Date.now();
            if (err) { reject(err); }

            let halfRound = this.calcHalfRoundTrip(localSentStamp, localRecvStamp);
            let readingResult = {
                error: this.calculateReadError(halfRound),
                adjust: this.calculateAdjust(halfRound, remoteResponseStamp, localRecvStamp),
                successful: this.isReadingSuccessful(halfRound)
            };
            resolve(readingResult);
        });
    });
};

ClockClient.prototype.sendClock = function (clock, cb) {
    let localStampSent = clock;
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
            let parts = body.split(',');
            let responseStampCheck = parts[0];
            let responseStampRemote = parts[1];
            if (localStampSent !== parseInt(responseStampCheck)) {
                cb(new Error('Timestamp verification failed!'));
            }
            else {
                cb(null, parseInt(responseStampRemote));
            }
        });
    });
    request.on('error', function (err) {
        cb(err);
    });
    request.end();
};

ClockClient.prototype.calcHalfRoundTrip = function (stampSent, stampReceived) {
    return (stampReceived - stampSent) / 2;
};

ClockClient.prototype.calcUpperBound = function () {
    return (1 - (2 * this.clockDrift)) * (this.targetPrecision + this.minReadingDelay);
};

ClockClient.prototype.calcMinUpperBound = function () {
    return this.minReadingDelay * (1 + this.clockDrift);
};

ClockClient.prototype.calcTimeoutDelay = function (upperBound) {
    return 2 * upperBound;
};

ClockClient.prototype.verifyUpperBound = function (upperBound, minUpperBound) {
    return upperBound >= minUpperBound;
};

ClockClient.prototype.isReadingSuccessful = function (halfRound) {
    return (2 * halfRound) <= this.timeoutDelay;
};

ClockClient.prototype.calculateAdjust = function (halfRound, remoteTimestamp, localRecvTimestamp) {
    return (remoteTimestamp + halfRound) - localRecvTimestamp;
};

ClockClient.prototype.calculateReadError = function (halfRound) {
    let e = halfRound * (1 + (2 * this.clockDrift)) - this.minReadingDelay;
    let eMin = 3 * this.clockDrift * this.minReadingDelay;
    if (e < eMin) throw new Error('Assertion failed: e < eMin');
    return e;
};
