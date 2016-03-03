"use strict";

var _ = require("lodash");
var abi = require("augur-abi");
var constants = require("../libs/constants");
var utilities = require("../libs/utilities");

module.exports = {
  
  loadBranches: function () {
    var self = this;
    this.flux.augur.getBranches(function (branches) {
      if (branches && !branches.error) {
        self.dispatch(constants.branch.LOAD_BRANCHES_SUCCESS, {
          branches: branches
        });
      }
    });
  },

  setCurrentBranch: function (branchId) {
    var self = this;
    branchId = branchId || process.env.AUGUR_BRANCH_ID;
    this.flux.augur.getPeriodLength(branchId, function (periodLength) {
      if (periodLength && !periodLength.error) {
        self.dispatch(constants.branch.SET_CURRENT_BRANCH_SUCCESS, {
          id: branchId,
          periodLength: abi.number(periodLength)
        });
        self.flux.actions.branch.updateCurrentBranch();
      } else {
        console.error("augur.periodLength error:", periodLength);
        console.trace();
      }
    });
  },

  updateCurrentBranch: function () {
    var self = this;
    this.flux.augur.rpc.blockNumber(function (currentBlock) {
      currentBlock = parseInt(currentBlock);
      self.dispatch(constants.network.UPDATE_NETWORK, {
        blockNumber: currentBlock
      });
      var currentBranch = self.flux.store("branch").getCurrentBranch();
      console.log("Updating branch:", currentBranch);
      var currentPeriod = Math.floor(currentBlock / currentBranch.periodLength);
      var percentComplete;
      if (currentBranch.periodLength) {
        percentComplete = (currentBlock % currentBranch.periodLength) / currentBranch.periodLength * 100;
      }

      self.flux.augur.getReportPeriod(currentBranch.id, function (result) {
        if (!result || result.error) {
          return console.error("augur.getReportPeriod error:", result);
        }
        var reportPeriod = abi.number(result);

        self.flux.actions.report.submitQualifiedReports(function (err, res) {
          if (err) console.error("ReportsPage.submitQualifiedReports:", err);
          if (res) console.log("submitted reports:", res);
        });

        // if this is a new report period, load events to report
        if (reportPeriod > currentBranch.reportPeriod) {
          console.log("New report period! Loading events to report...");
          self.flux.actions.report.loadEventsToReport();
        }
        // if (!currentBranch.calledPenalizeNotEnoughReports) {
        //   self.flux.augur.penalizeNotEnoughReports({
        //     branch: currentBranch.id,
        //     onSent: function (res) {
        //       console.log("penalizeNotEnoughReports sent:", res);
        //       var updatedBranch = self.flux.store("branch").getCurrentBranch();
        //       updatedBranch.calledPenalizeNotEnoughReports = true;
        //       self.dispatch(constants.branch.UPDATE_CURRENT_BRANCH_SUCCESS, {updatedBranch})
        //     },
        //     onSuccess: function (res) {
        //       console.log("penalizeNotEnoughReports success:", res);
        //     },
        //     onFailed: function (err) {
        //       console.error("penalizeNotEnoughReports error:", err);
        //       var updatedBranch = self.flux.store("branch").getCurrentBranch();
        //       updatedBranch.calledPenalizeNotEnoughReports = true;
        //       self.dispatch(constants.branch.UPDATE_CURRENT_BRANCH_SUCCESS, {updatedBranch})
        //     }
        //   });
        // }

        (function incrementPeriod() {
          self.flux.augur.getCurrentPeriod(currentBranch.id, function (currentPeriod) {
            currentPeriod = Math.floor(currentPeriod);
            self.flux.augur.getReportPeriod(currentBranch.id, function (reportPeriod) {
              reportPeriod = parseInt(reportPeriod);
              var isCurrent = reportPeriod < (currentPeriod - 1) ? false : true;
              if (!isCurrent) {
                var periodsBehind = currentPeriod - 1 - reportPeriod;
                console.warn("branch", currentBranch.id, "behind", periodsBehind, "periods, incrementing period...");
                self.flux.augur.incrementPeriodAfterReporting({
                  branch: currentBranch.id,
                  onSent: function (result) {
                    // console.log("incrementPeriod sent:", result);
                  },
                  onSuccess: function (result) {
                    self.flux.augur.getReportPeriod(currentBranch.id, function (reportPeriod) {
                      reportPeriod = parseInt(reportPeriod);
                      console.debug("incremented", currentBranch.id, "to period", reportPeriod);
                      isCurrent = reportPeriod < (currentPeriod - 1) ? false : true;
                      if (!isCurrent) return incrementPeriod();
                      console.debug("branch caught up!");
                      self.flux.augur.getCurrentPeriod(currentBranch.id, function (currentPeriod) {
                        currentPeriod = Math.floor(currentPeriod);
                        self.flux.augur.rpc.blockNumber(function (blockNumber) {
                          var percentComplete = (blockNumber % currentBranch.periodLength) / currentBranch.periodLength * 100;
                          var updatedBranch = _.merge(currentBranch, {
                            currentPeriod: currentPeriod,
                            reportPeriod: reportPeriod,
                            isCurrent: isCurrent,
                            percentComplete: percentComplete,
                            calledPenalizeNotEnoughReports: false,
                            calledPenalizeWrong: false,
                            calledCollectFees: false
                          });
                          self.dispatch(constants.branch.UPDATE_CURRENT_BRANCH_SUCCESS, updatedBranch);
                          self.flux.actions.report.loadEventsToReport();
                        });
                      });
                    });
                  },
                  onFailed: function (err) {
                    console.log("incrementPeriod:", err);
                  }
                });
              } else {
                var updatedBranch = currentBranch;
                updatedBranch.currentPeriod = currentPeriod;
                updatedBranch.reportPeriod = reportPeriod;
                updatedBranch.isCurrent = isCurrent;
                updatedBranch.percentComplete = percentComplete;
                self.dispatch(constants.branch.UPDATE_CURRENT_BRANCH_SUCCESS, updatedBranch);
                self.flux.actions.report.loadEventsToReport();
              }
            });
          });
        })();
      });
    });
  }

};
