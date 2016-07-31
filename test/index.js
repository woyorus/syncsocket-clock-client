const expect = require('chai').expect;
const nock = require('nock');

const Client = require('../src/index');

const defaultPort = 5579;
const testingPort = process.env.TESTING_PORT || 8888;
const mockServerUrl = "http://localhost:" + testingPort;

describe('ClockClient', function () {

    it('should create a new client object', function () {
        let cli = Client(mockServerUrl);
        expect(cli).to.be.an('object');
    });

    it('should use ' + defaultPort + ' as default port', function () {
        let cli = Client('http://localhost');
        expect(cli.serverPort).to.be.equal(defaultPort);
    });

    it('should correctly parse passed url', function () {
        let cli = Client(mockServerUrl);
        expect(cli.serverHost).to.be.equal('localhost');
        expect(cli.serverPort).to.be.equal(testingPort);
    });

    describe('#sendClock()', function () {

        it('should send local and receive remote timestamp', function (done) {
            let cli = Client(mockServerUrl);
            let testBeginStamp = Date.now();
            let responseStamp = 1469978865700;
            nock(mockServerUrl)
                .get('/')
                .socketDelay(100)
                .reply(function (uri, requestBody, cb) {
                    let clientStamp = this.req.headers['x-client-timestamp'];
                    cb(null, [200, clientStamp + ',' + responseStamp]);
                });
            cli.sendClock((err, stamps) => {
                let testEndStamp = Date.now();
                expect(stamps.sent).to.be.at.least(testBeginStamp);
                expect(stamps.received).to.be.at.most(testEndStamp);
                expect(stamps.remote).to.be.equal(responseStamp);
                done(err);
            });
        });

        it('should raise an error upon invalid request', function (done) {
            let cli = Client('http://crazyinvalidurl123123fjfq.ug:9919');
            cli.sendClock((err, stamps) => {
                expect(err).to.be.an('error');
                expect(err.code).to.be.equal('ENOTFOUND');
                expect(stamps).to.be.undef;
                done();
            });
        });

        it('should raise error upon code 400', function (done) {
            let cli = Client(mockServerUrl);
            nock(mockServerUrl)
                .get('/')
                .socketDelay(100)
                .reply(400);
            cli.sendClock((err, stamps) => {
                expect(err).to.be.an('error');
                expect(stamps).to.be.undef;
                done();
            });
        });

        it('should raise error if response check stamp doesn\t match', function (done) {
            let cli = Client(mockServerUrl);
            nock(mockServerUrl)
                .get('/')
                .socketDelay(100)
                .reply(200, '123456' + ',' + Date.now());
            cli.sendClock((err, stamps) => {
                expect(err).to.be.an('error');
                expect(stamps).to.be.undef;
                done();
            });
        });

    });
});
