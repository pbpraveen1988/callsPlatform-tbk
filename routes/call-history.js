
const { CallHistory } = require("../models/call-history");
const { Campaign } = require("../models/campaign");

const { message } = require("../global/messages");
const { RinglessDB } = require('../global/constants');

exports.getStatisticsCall = async (req, res) => {
  try {

    const totalData = await Campaign.findOne({
      _id: req.query.selectedId,
      createdAt: {
        $gte: new Date(req.query.startDate),
        $lt: new Date(req.query.endDate)
      }
    })

    let totalCallsCompletedCount = 0;
    let failedCount = 0;
    if (RinglessDB && totalData) {
      const _dbCon = RinglessDB();
      const _totalCallsCompletedCount = await _dbCon.collection('responses').find({ IsError: false, CampaignId: req.query.selectedId }).toArray();
      totalCallsCompletedCount = _totalCallsCompletedCount.length;
      // console.log('_totalCallsCompletedCount', totalCallsCompletedCount);
      const _failedCount = await _dbCon.collection('responses').find({ IsError: true, CampaignId: req.query.selectedId }).toArray();
      failedCount = _failedCount.length;
      // console.log('_totalCallsCompletedCount', failedCount);
    }
    // const totalCallsCompletedCount = await (await CallHistory.find(
    //   {
    //     campaignId: req.query.selectedId,
    //     status: { $in: ['Success', 'success'] },
    //     createdAt: {
    //       $gte: new Date(req.query.startDate),
    //       $lt: new Date(req.query.endDate)
    //     }
    //   })).length;

    // const totalProcessingCount = await (
    //   await CallHistory.find({
    //     campaignId: req.query.selectedId,
    //     status: { $in: ['Success', 'success'] },
    //     createdAt: {
    //       $gte: new Date(req.query.startDate),
    //       $lt: new Date(req.query.endDate)
    //     }
    //   })).length;



    // const failedCount = await (await CallHistory.find(
    //   {
    //     campaignId: req.query.selectedId,
    //     status: { $in: ['Failed', 'failed'] },
    //     createdAt: {
    //       $gte: new Date(req.query.startDate),
    //       $lt: new Date(req.query.endDate)
    //     }
    //   })).length;

    const dropFailedCount = await (await CallHistory.find(
      {
        campaignId: req.query.selectedId,
        status: { $in: ['Failed', 'failed'] },
        // drop_result: 'failed',
        createdAt: {
          $gte: new Date(req.query.startDate),
          $lt: new Date(req.query.endDate)
        }
      })).length;

    let _lastindex = 0;
    if (totalData && totalData.lastIndex) {
      _lastindex = totalData.lastIndex;
    }


    let _processing = totalData && totalData.campaignStatus ? (totalData && totalData.totalCount) - _lastindex : 0;
    if (totalData && totalData.totalCount && totalData.isPause) {
      _processing = totalData.totalCount - _lastindex;
    }


    let _pending = 0;
    if (totalData && totalData.campaignStatus) {
      _pending = _lastindex - (parseInt(failedCount || 0) + parseInt(dropFailedCount || 0) + totalCallsCompletedCount);
    } else if (totalData && !totalData.campaignStatus && totalData.isPause) {
      _pending = _lastindex;
    } else {
      _pending = totalData && totalData.totalCount - (_lastindex + parseInt(failedCount || 0) + parseInt(dropFailedCount || 0) + totalCallsCompletedCount)
    }

    if (_pending < 0) {
      _pending = 0;
    }

    return res.status(200).json([
      {
        title: 'Successfully Completed',
        count: totalCallsCompletedCount,
        color: '#00c0ef'
      },
      {
        title: 'Processing',
        count: _processing,
        color: '#f39c12'
      },
      {
        title: 'Failed',
        count: parseInt(failedCount || 0) + parseInt(dropFailedCount || 0),
        color: '#dd4b39'
      },
      {
        title: 'Pending',
        count: _pending,
        color: '#00a65a'
      },
    ]);

  } catch (error) {
    console.log("gob: getCampaigns error", error);
    return res.status(500).json({
      message: message.SOMETHING_WENT_WRONG,
      error,
    });
  }
};