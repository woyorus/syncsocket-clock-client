const URL = require('url');
const http = require('http');

module.exports = ClockClient;

function ClockClient(url, opts) {
    opts = opts || {};
    var parsedUrl = URL.parse(url);
    this.serverHost = parsedUrl.hostname;
    this.serverPort = parseInt(parsedUrl.port) || 5579;
    this.targetPrecision = opts.targetPrecision || 50;
    this.minReadingDelay = opts.minReadingDelay || 0.2;
    this.clockDrift = opts.clockDrift || 0.0001;

    var upperBound = this.calcUpperBound();
    var minUpperBound = this.calcMinUpperBound();

    if (!(this.verifyUpperBound(upperBound, minUpperBound))) {
        throwInvalidSetting();
    }

    this.timeoutDelay = this.calcTimeoutDelay(upperBound);
}

function throwInvalidSetting() {
    throw new Error('Clock client is set up incorrectly. Check client parameters.');
}

ClockClient.prototype.sync = function () {
    var that = this;
    return new Promise(function (resolve, reject) {
        var localSentStamp = Date.now();
        that.sendClock(localSentStamp, function (err, remoteResponseStamp) {
            var localRecvStamp = Date.now();
            if (err) {
                reject(err);
                return;
            }

            var halfRound = that.calcHalfRoundTrip(localSentStamp, localRecvStamp);
            var readingResult = {
                error: that.calculateReadError(halfRound),
                adjust: that.calculateAdjust(halfRound, remoteResponseStamp, localRecvStamp),
                successful: that.isReadingSuccessful(halfRound)
            };
            resolve(readingResult);
        });
    });
};

ClockClient.prototype.sendClock = function (clock, cb) {
    var localStampSent = clock;
    var request = http.get({
        host: this.serverHost,
        port: this.serverPort,
        path: '/',
        method: 'GET',
        headers: { 'X-Client-Timestamp': '' + localStampSent },
        withCredentials: false
    }, function (res) {
        if (res.statusCode !== 200) {
            cb(new Error('Server response isn\'t 200! (it is ' + res.statusCode + ')'));
            return;
        }
        var body = '';
        res.on('data', function (d) { body += d });
        res.on('end', function () {
            var parts = body.split(',');
            var responseStampCheck = parts[0];
            var responseStampRemote = parts[1];
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
    var e = halfRound * (1 + (2 * this.clockDrift)) - this.minReadingDelay;
    var eMin = 3 * this.clockDrift * this.minReadingDelay;
    if (e < eMin) throw new Error('Assertion failed: e < eMin');
    return e;
};
