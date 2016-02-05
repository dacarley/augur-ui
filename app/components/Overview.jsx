var React = require("react");
var _ = require("lodash");
var abi = require("augur-abi");
var keys = require("keythereum");
let Navigation = require("react-router/lib/Navigation");
let Link = require("react-router/lib/components/Link");

let FluxMixin = require("fluxxor/lib/flux_mixin")(React);
let StoreWatchMixin = require("fluxxor/lib/store_watch_mixin");
let Button = require('react-bootstrap/lib/Button');
let Table = require('react-bootstrap/lib/Table');
let ListGroup = require('react-bootstrap/lib/ListGroup');
let ListGroupItem = require('react-bootstrap/lib/ListGroupItem');

var utilities = require("../libs/utilities");
var constants = require("../libs/constants");

var ImportAccountModal = require("./ImportAccount");
var CloseMarketModal = require("./CloseMarket").CloseMarketModal;
let MarketRow = require("./markets-page/MarketRow");
var Branch = require("./Branch");

var Overview = React.createClass({

  mixins: [
    FluxMixin,
    StoreWatchMixin('market', 'config', 'branch'),
    Navigation
  ],

  getInitialState: function () {
    return {
      importAccountModalOpen: false,
      importKeystore: null
    };
  },

  getStateFromFlux: function () {
    var flux = this.getFlux();
    var account = flux.store('config').getAccount();
    var currentBranch = flux.store('branch').getCurrentBranch();
    return {
      account: account,
      privateKey: flux.store('config').getPrivateKey(),
      asset: flux.store('asset').getState(),
      config: flux.store('config').getState(),
      trendingMarkets: flux.store('market').getTrendingMarkets(9, currentBranch),
      authoredMarkets: flux.store('market').getMarketsByAuthor(account),
      reportPeriod: flux.store('branch').getState().currentVotePeriod,
      currentBranch: currentBranch,
      holdings: flux.store('market').getMarketsHeld()
    }
  },

  toggleImportAccountModal: function (event) {
    this.setState({importAccountModalOpen: !this.state.importAccountModalOpen});
  },

  importAccount: function (event) {
    var self = this;
    if (event.target && event.target.files && event.target.files.length) {
      var keystoreFile = event.target.files[0];
      var reader = new FileReader();
      reader.onload = (function (f) {
        return function (e) {
          try {
            var keystore = JSON.parse(e.target.result);
            self.setState({importKeystore: keystore});
            self.toggleImportAccountModal();
          } catch (exc) {
            console.error("Overview.importAccount: couldn't parse account file:", exc);
          }
        };
      })(keystoreFile);
      reader.readAsText(keystoreFile);
    }
  },

  render: function () {
    var importAccountButton = (
      <div className="col-sm-3">
        <label
          htmlFor="importAccountId"
          className="send-button btn-info btn btn-default">
          Import Account
        </label>
        <input
          id="importAccountId"
          type="file"
          onChange={this.importAccount} />
      </div>
    );
    if (!this.state.account) {
      var trendingMarketsSection = <span />;
      if (this.state.trendingMarkets) {
        trendingMarketsSection = (
          <div>
            <h4 className="trending">Trending Markets</h4>
            <div className='row'>
              <div className="col-xs-12">
                  {_.map(this.state.trendingMarkets, market => {
                    return <MarketRow key={market.id} market={market} />;
                  })}
              </div>
            </div>
          </div>
        );
      }
      return (
        <div id="overview">
          <div className="account-info">
            <h4>Account</h4>
            <div className="row">
              {importAccountButton}
            </div>
          </div>
          <div className='row'>
            <div className="col-xs-12">
              {trendingMarketsSection}
            </div>
          </div>
          <ImportAccountModal
            params={{keystore: this.state.importKeystore}}
            show={this.state.importAccountModalOpen}
            onHide={this.toggleImportAccountModal} />
        </div>
      );
    }

    var cashBalance = this.state.asset.cash ? +this.state.asset.cash.toFixed(2) : '-';
    var repBalance = this.state.asset.reputation ? +this.state.asset.reputation.toFixed(2) : 0;

    var holdings = _
      .filter(this.state.holdings, market => {
        return market.outcomes.some((outcome) => outcome.sharesHeld && outcome.sharesHeld.toNumber() > 0);
      })
      .map(function (market) {
        return <MarketRow key={market.id} market={market} contentType="holdings"/>;
      });

    var exportAccountButton = (
      <div className="col-sm-3">
        <Button
          disabled
          className="send-button btn-success">
          Export Account
        </Button>
      </div>
    );
    if (this.state.privateKey) {
      var keystore = this.getFlux().augur.web.exportKey();
      if (keystore) {
        var accountFilename = "UTC--" + new Date().toISOString() + "--" + keystore.address;
        var accountUrl = URL.createObjectURL(new Blob([
          JSON.stringify(keystore)
        ], {type: "application/json"}));
        exportAccountButton = (
          <div className="col-sm-3">
            <a
              download={accountFilename}
              href={accountUrl}
              className="send-button btn-success btn btn-default">
              Export Account
            </a>
          </div>
        );
      }
    }

    var accountSection = <span />
    if (this.state.account) {
      accountSection = (
        <div className="account-info">
          <h4>Account</h4>
          <div className="row">
            <div className="col-sm-6">
              <span className="account">{this.state.account}</span>
            </div>
            {exportAccountButton}
            {importAccountButton}
          </div>
        </div>
      );
    }

    var holdingsSection = <span />
    if (holdings.length) {
      holdingsSection = (
        <div>
          <h4>Current Holdings</h4>
          <ListGroup className='holdings'>
            { holdings }
          </ListGroup>
        </div>
      );
    }

    var cashFaucetDisabled = this.state.cashFaucetDisabled ? true : false;
    var repFaucetDisabled = this.state.repFaucetDisabled ? true : false;

    var authoredMarketsSection = <span />;
    if (_.isEmpty(this.state.authoredMarkets)) {
      if (this.state.trendingMarkets) {
        authoredMarketsSection = (
          <div>
            <h4 className="trending">Trending Markets</h4>
            <div className='row'>
              <div className="col-xs-12">
                {_.map(this.state.trendingMarkets, market => {
                  return <MarketRow key={market.id} market={market} />;
                })}
              </div>
            </div>
          </div>
        );
      }
    } else {
      var authoredMarkets = [];
      authoredMarkets.push(
        <div key="authoredMarkets-header" className="row markets-list-header">
          <div className="col-sm-5"><b>Market</b></div>
          <div className="price col-sm-1"><b>Price</b></div>
          <div className="col-sm-1"><b>Volume</b></div>
          <div className="col-sm-1"><b>Fee</b></div>
          <div className="col-sm-2"><b>Created</b></div>
          <div className="col-sm-2"><b>Expires</b></div>
        </div>
      );
      for (var marketId in this.state.authoredMarkets) {
        if (!this.state.authoredMarkets.hasOwnProperty(marketId)) continue;
        var market = this.state.authoredMarkets[marketId];
        var className = "";
        var linked;
        if (market.pending) {
          className = 'pending';
          linked = false;
        } else if (!market.loaded) {
          className = 'loading';
          linked = false;
        } else if (market.invalid) {
          className = 'invalid';
          linked = true;
        } else if (this.state.currentBranch &&
                   this.state.currentBranch.currentPeriod >= market.tradingPeriod) {
          className = 'matured';
        }
        var outstandingShares = _.reduce(market.outcomes, function (outstandingShares, outcome) {
          if (outcome) return outstandingShares + abi.number(outcome.outstandingShares);
        }, 0);
        var id = marketId.toString(16);
        authoredMarkets.push(
          <div key={id} className="row markets-list-row">
            <Link
              key={id+"-link"}
              to="market"
              params={{marketId: market.id.toString(16)}}
              className={className}>
              <div key={id+"-description"} className="col-sm-5">{market.description}</div>
              <div key={id+"-price"} className="price col-sm-1">{(abi.number(market.price)).toFixed(4)}</div>
              <div key={id+"-shares"} className="col-sm-1">{+outstandingShares.toFixed(2)}</div>
              <div key={id+"-tradingFee"} className="col-sm-1">{(market.tradingFee.times(100)).toFixed(2)}%</div>
              <div key={id+"-created"} className="col-sm-2">{market.creationDate.fromNow()}</div>
              <div key={id+"-expires"} className="col-sm-2">{market.endDate.fromNow()}</div>
            </Link>
          </div>
        );
      }
      authoredMarketsSection = (
        <div>
          <h4>My Markets</h4>
          <div className="markets-list">
            {authoredMarkets}
          </div>
        </div>
      );
    }

    return (
      <div id="overview">
        <div className='row'>
          <div className="col-xs-12">
            {accountSection}
            {authoredMarketsSection}
            {holdingsSection}
          </div>
        </div>
        <ImportAccountModal
          params={{keystore: this.state.importKeystore}}
          show={this.state.importAccountModalOpen}
          onHide={this.toggleImportAccountModal} />
      </div>
    );
  }
});

module.exports = Overview;
