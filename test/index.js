const expect = require('chai').expect;
const nock = require('nock');

const Client = require('../src/index');

const defaultPort = 5579;
const testingPort = process.env.TESTING_PORT || 8888;
const mockServerUrl = "http://localhost:" + testingPort;

describe('ClockClient', function () {

    it('should create a new client object', function () {
        let cli = new Client(mockServerUrl);
        expect(cli).to.be.an('object');
    });

    it('should use ' + defaultPort + ' as default port', function () {
        let cli = new Client('http://localhost');
        expect(cli.serverPort).to.be.equal(defaultPort);
    });

    it('should correctly parse passed url', function () {
        let cli = new Client(mockServerUrl);
        expect(cli.serverHost).to.be.equal('localhost');
        expect(cli.serverPort).to.be.equal(testingPort);
    });

    const mockTargetPrecision = 15,
        mockMinReadingDelay = 5,
        mockClockDrift = 0.003;

    it('should use provided options instead of defaults', function () {
        let cli = new Client(mockServerUrl, {
            targetPrecision: mockTargetPrecision,
            minReadingDelay: mockMinReadingDelay,
            clockDrift: mockClockDrift,
        });
        expect(cli.targetPrecision).to.be.equal(mockTargetPrecision);
        expect(cli.minReadingDelay).to.be.equal(mockMinReadingDelay);
        expect(cli.clockDrift).to.be.eql(mockClockDrift);
    });

    it('should correctly calculate timeout delay', function () {
        let cli = new Client(mockServerUrl, {
            targetPrecision: mockTargetPrecision,
            minReadingDelay: mockMinReadingDelay,
            clockDrift: mockClockDrift,
        });
        expect(cli.timeoutDelay).to.be.eql(39.76);
    });

    describe('#verifyUpperBound(upperBound, minUpperBound)', function () {
        it('should be true if upper bound greater or equal to min upper bound', function () {
            let cli = new Client(mockServerUrl, {
                targetPrecision: mockTargetPrecision,
                minReadingDelay: mockMinReadingDelay,
                clockDrift: mockClockDrift,
            });
            expect(cli.verifyUpperBound(3, 2)).to.be.true;
            expect(cli.verifyUpperBound(2, 2)).to.be.true;
            expect(cli.verifyUpperBound(1, 2)).to.be.false;
        });
    });

    describe('#calcUpperBound()', function () {
        it('should be [(1-(2*clockDrift)) * (targetPrecision + minReadingDelay)]', function () {
            let cli = new Client(mockServerUrl, {
                targetPrecision: mockTargetPrecision,
                minReadingDelay: mockMinReadingDelay,
                clockDrift: mockClockDrift,
            });
            expect(cli.calcUpperBound()).to.be.eql(
                (1-(2*mockClockDrift)) * (mockTargetPrecision + mockMinReadingDelay)
            );
        })
    });

    describe('#mimimumUpperBound()', function () {
        it('should be minReadingDelay * (1 + clockDrift)', function () {
            let cli = new Client(mockServerUrl, {
                targetPrecision: mockTargetPrecision,
                minReadingDelay: mockMinReadingDelay,
                clockDrift: mockClockDrift,
            });
            expect(cli.calcMinUpperBound()).to.be.eql(mockMinReadingDelay * (1 + mockClockDrift));
        })
    });

    describe('#calcTimeoutDelay(upperBound)', function () {
        it('should be twice the upperBound', function () {
            let cli = new Client(mockServerUrl);
            expect(cli.calcTimeoutDelay(5)).to.be.eql(10);
            expect(cli.calcTimeoutDelay(15)).to.be.eql(30);
        });
    });

    describe('#isReadingSuccessful(halfRound)', function () {
        it('should be false when 2*halfRound > timeoutDelay', function () {
            let cli = new Client(mockServerUrl, {
                targetPrecision: mockTargetPrecision,
                minReadingDelay: mockMinReadingDelay,
                clockDrift: mockClockDrift,
            });
            expect(cli.isReadingSuccessful((cli.timeoutDelay + 1) / 2)).to.be.false;
            expect(cli.isReadingSuccessful((cli.timeoutDelay - 1) / 2)).to.be.true;
        });
    });

    describe('#calculateAdjust(halfRound, remoteTimestamp, localRecvTimestamp)', function () {
        it('should return (remoteTimestamp + halfRound) - localRecvTimestamp', function () {
            let cli = new Client(mockServerUrl, {
                targetPrecision: mockTargetPrecision,
                minReadingDelay: mockMinReadingDelay,
                clockDrift: mockClockDrift,
            });

            expect(cli.calculateAdjust(10, 1469993341000, 1469993343000)).to.be.eql(-1990);
        })
    });


    describe("#sync()", function () {

        it('should return promise', function () {
            let cli = new Client(mockServerUrl);
            expect(cli.sync()).to.be.a('promise');
        });

    });

    describe('#calcHalfRoundTrip(sent, received)', function () {
        it('should return half of range between sent and received time', function () {
            let cli = new Client(mockServerUrl);
            let mockTimeSent = 1469985602000,
                mockTimeRecv = 1469985606000;
            let range = mockTimeRecv - mockTimeSent;
            let half = range / 2;
            expect(cli.calcHalfRoundTrip(mockTimeSent, mockTimeRecv)).to.be.equal(half);
        });
    });

    describe('#sendClock(cb)', function () {
        var testBeginStamp;

        beforeEach(function () {
            testBeginStamp = Date.now();
        });

        it('should send local and receive remote timestamp', function (done) {
            let cli = new Client(mockServerUrl);
            let mockResponseClock = 1469978865700;
            nock(mockServerUrl)
                .get('/')
                .reply(function (uri, requestBody, cb) {
                    let clientStamp = this.req.headers['x-client-timestamp'];
                    cb(null, [200, clientStamp + ',' + mockResponseClock]);
                });
            cli.sendClock(testBeginStamp, (err, remoteClock) => {
                expect(remoteClock).to.be.equal(mockResponseClock);
                done(err);
            });
        });

        it('should raise an error upon invalid request', function (done) {
            let cli = new Client('http://crazyinvalidurl123123fjfq.ug:9919');
            cli.sendClock(testBeginStamp, (err, remoteClock) => {
                expect(err).to.be.an('error');
                expect(err.code).to.be.equal('ENOTFOUND');
                expect(remoteClock).to.be.undef;
                done();
            });
        });

        it('should raise error upon code 400', function (done) {
            let cli = new Client(mockServerUrl);
            nock(mockServerUrl)
                .get('/')
                .socketDelay(100)
                .reply(400);
            cli.sendClock(testBeginStamp, (err, remoteClock) => {
                expect(err).to.be.an('error');
                expect(remoteClock).to.be.undef;
                done();
            });
        });

        it('should raise error if response check stamp doesn\t match', function (done) {
            let cli = new Client(mockServerUrl);
            nock(mockServerUrl)
                .get('/')
                .socketDelay(100)
                .reply(200, '123456' + ',' + Date.now());
            cli.sendClock(testBeginStamp, (err, remoteClock) => {
                expect(err).to.be.an('error');
                expect(remoteClock).to.be.undef;
                done();
            });
        });
    });

});
