const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');
const { Campaign } = require('../models/campaign');
const { CallHistory } = require('../models/call-history');
const { PUBLIC_FOLDER_NAME, ASSET_FOLDER_PATH, CALLBACK_URL, LOCAL_CALLBACK_URL, VMDROP_URL, MISSED_CALL_NUMBER, ASTERISKSERVER_URL, API_KEY, TELNYX_TOKEN, TELNYX_URL, LOCAL_URL, PROD_URL, CALLBACK_PATH, AUDIO_FOLDER_PATH, ASTERISKSERVER_URL_MULTIPLE } = require('../global/constants');
const { generateRandomId, isEmpty, getCampaignLog } = require('../utils');
const { MYSQLDB } = require('../global/constants');




const makeCampaignCallParamsUpdated = (campaign, number, carrierName, numbersPhoneFrom, number_type) => {
  const record = {
    audio_url: PROD_URL + AUDIO_FOLDER_PATH + campaign.audioFileName,
    lead_phone: number.toString().trim(),
    phone_from: numbersPhoneFrom.toString().trim(),
    retry: 1,
    provider: 'telnyx',
    carrier: carrierName,
    missed_call: campaign.missedCalls ? 'TRUE' : false,
    missed_call_pool: campaign.missedCallPool,
    forward: campaign.callForwardNumber,
    // callback_url: CALLBACK_URL + CALLBACK_PATH, //TODO, hard coded
    external_id1: campaign.campaignName,
    external_id2: campaign._id,
    external_id3: "3",
    external_id4: new Date(),
    number_type: number_type,
    //new params
    drop_method: 'ringless',
    carrier_raw: carrierName === 'CINGULAR' ? 'VERIZON' : carrierName,
    missed_call_caller_id: campaign.callCenterNumber || MISSED_CALL_NUMBER,
    // NOT USING FOR NOW
    //   phone_from: numbersPhoneFrom.toString().trim(),
    //   send_missed_call: campaign.missed_call,
    //   //callback_url: PROD_URL + CALLBACK_PATH,
    //   //new params

  }

  try {
    getCampaignLog(campaign._id, 'VMDROP PARAMS', record);
  } catch (e) {

  }

  return record;
}

const makeCampaignCallParams = (campaign, number, carrierName, numbersPhoneFrom) => {

  const _record = {
    PhoneTo: number.toString().trim(),
    PhoneFrom: numbersPhoneFrom.toString().trim(),
    Carrier: carrierName || 'VERIZON', // 
    VMAudio: PROD_URL + AUDIO_FOLDER_PATH + campaign.audioFileName,
    Retry: 1,
    Provider: 'telnyx',
    SendMissedCall: campaign.missedCalls ? 'TRUE' : false,
    MissedCallFrom: campaign.callCenterNumber || MISSED_CALL_NUMBER,
    CampaignId: campaign._id,
    forward: campaign.callForwardNumber
  };
  try {
    getCampaignLog(campaign._id, 'VMDROP PARAMS', _record);
  } catch (e) {

  }
  return _record;
};


exports.runCampagins = async timer => {
  console.log('Cron Job Start Count', timer)
  const campaigns = await Campaign.find({
    campaignStatus: true,
    isCalling: false
  });

  campaigns.forEach(async campaign => {
    // if first calling is not completed
    if (campaign.campaignRepeatCount <= 1) {
      // check date range
      if (!(new Date().getTime() > campaign.campaignStartDate.getTime() && new Date().getTime() < campaign.campaignEndDate.getTime())) {
        Campaign.editCampaign({
          _id: campaign._id,
          campaignStatus: false
        });
        return;
      }
      // set calling flag to true to prevent duplicated calling
      Campaign.editCampaign({
        _id: campaign._id,
        isCalling: true
      });
      // read numbers from csv
      let counter = 0;
      let numbersSource = []
      let numbers = [];
      let numbersPhoneFrom = [];
      fs.createReadStream(PUBLIC_FOLDER_NAME + ASSET_FOLDER_PATH + campaign.csvFileName)
        .pipe(csv())
        .on('data', data => {
          if (counter++ >= campaign.lastIndex && counter <= campaign.lastIndex + campaign.intervalMinute) {
            numbersSource = data[Object.keys(data)[0]].split(';');
            numbers.push(numbersSource[0]);
            // numbersPhoneFrom.push(numbersSource[1]);
          }
        })
        .on('end', async () => {
          try {
            getCampaignLog(campaign._id, 'Number to send', numbers.join(','));
          } catch (ex) {

          }
          try {
            const _numbers = await getCarriers(numbers, campaign);
            if (_numbers && _numbers.length > 0) {
              // Passing multiple numbers at once instead of single request.
              await makeVMDropRequestMultiple(_numbers);
            }
          } catch (ex) {
            console.log("exception on VM drop =->", ex);
          }
          //#region  NOT USING TELNYX URL TO GET THE PROVIDER
          // numbers && numbers.forEach((number, index) => {
          //   axios.get(TELNYX_URL + `+1${number}?type=carrier`,
          //     {
          //       headers: {
          //         'Authorization': `Bearer ${TELNYX_TOKEN}`
          //       }
          //     })
          //     .then(response => {
          //       try {
          //         const carrierName = getCarrierName(response.data.data.carrier.name)
          //         const params = makeCampaignCallParams(campaign, number, carrierName, campaign.callBackNumber);
          //         console.log("PARMS", params);
          //         makeVMDropRequest(params, campaign._id, number);
          //       } catch (ex) {
          //         console.log("exception on VM drop =->", ex);
          //       }
          //     })
          //     .catch(error => {
          //       console.log('kevin: TELNYX Response error response', number, error);
          //     });
          // })
          //#endregion

          // update campaign
          const isCallCompleted = campaign.lastIndex + campaign.intervalMinute > counter ? true : false;
          console.log('isCallCompelted', campaign.lastIndex, campaign.intervalMinute, counter, isCallCompleted);

          //          isCallCompelted 0 1 1 false


          Campaign.editCampaign({
            _id: campaign._id,
            totalCount: counter,
            lastIndex: isCallCompleted ? 0 : campaign.lastIndex + campaign.intervalMinute,
            isCalling: false,
            campaignStatus: !isCallCompleted,
            campaignRepeatCount: isCallCompleted ? campaign.campaignRepeatCount + 1 : campaign.campaignRepeatCount,
            lastCompletedCallDate: Date.now()
          });
        });
    } else {
      // set calling flag to true to prevent duplicated calling
      Campaign.editCampaign({
        _id: campaign._id,
        isCalling: true
      });
      const failedHistories = await CallHistory.find(
        {
          campaignId: campaign._id,
          status: 'Failed',
          createdAt: { $lt: campaign.lastCompletedCallDate }
        }).sort({ createdAt: -1 }).limit(campaign.intervalMinute); // REVIEW_CODE



      failedHistories.forEach(history => {
        const params = makeCampaignCallParams(campaign, history.number);
        makeVMDropRequestByHistory(params, campaign._id, history.number, history._id);
      });

      Campaign.editCampaign({
        _id: campaign._id,
        isCalling: false,
        campaignStatus: isEmpty(failedHistories) // REVIEW_CODE
      });
    }
  });
}


const makeVMDropRequestByHistory = async (params, campaignId, number, historyId) => {
  axios.post(VMDROP_URL + "/?apikey=" + API_KEY, params)
    .then(response => {
      const history = {
        _id: historyId,
        campaignId,
        uuid: response.data.uuid, // TODO
        number: response.data.number,
        number_type: response.data.number_type,
        error_message: response.data.error_message || response.data.message,
        status: response.data.status,
        carrier: response.data.carrier
      };
      CallHistory.editCallHistory(history);
    })
    .catch(error => {
      const history = {
        _id: historyId,
        timestamp: Date.now() // REVIEW_CODE
      };
      CallHistory.editCallHistory(history);
    });
}


// GET CARRIER  INFORMATION FROM THE TABLE
const getCarriers = async (numbers, campaign) => {
  return new Promise(function (resolve, reject) {
    console.time('SQL_DATA');
    console.log('calling stored producedure');
    // const query = `SELECT s.name AS 'CarrierName', s.carrier_type , l.TN AS 'Number',l.LRN AS 'XREF' FROM service_providers s INNER JOIN lrn_data l ON  s.SPID = l.SPID WHERE  l.TN IN (${_inArray})`;
    let paramString = '';
    numbers && numbers.forEach((x, index) => {
      if (index != 0) {
        paramString += ',';
      }
      let _newString = "'" + x.toString().trim() + "'";
      _newString = _newString.replace(/'/g, "\\'");
      paramString += _newString;
    });
    if (paramString != '') {
      const query = `CALL GetCarriers('${paramString}')`;
      const connection = MYSQLDB();
      connection.query(query, function (solution, msg) {
        console.log('response from SP');
        if (msg) {
          reject(msg);
          return console.error(msg);
        }
        const result = solution && solution[0];
        const _results = [];
        result && result.forEach((res) => {
          if (res.CarrierName) {
            const _carrierName = getCarrierName(res.CarrierName);
            const number_type = getServiceProviderType(res.sp_type);
            const params = makeCampaignCallParamsUpdated(campaign, res.Number, _carrierName, campaign.callBackNumber, number_type);
            _results.push(params);
          }
        });
        if (result) {
          const _diff = numbers.length - result.length;
          if (_diff > 0) {
            try {
              const values = findDeselectedItem(result, numbers);
              values && values.forEach(n => {
                const number_type = getServiceProviderType(n.sp_type ? n.sp_type : undefined);
                const params = makeCampaignCallParamsUpdated(campaign, n, getCarrierName(undefined), campaign.callBackNumber, number_type);
                _results.push(params);
              });
            } catch (Ex) {
              console.error('Error on delsecting the item');
            }
          }
        }

        console.timeEnd('SQL_DATA');
        resolve(_results);
      });
    }

  })
}

const getServiceProviderType = (service_provider_type) => {
  if (service_provider_type == 1) {
    return 'landline';
  } else if (service_provider_type == 2) {
    return 'cell';
  } else if (service_provider_type == 3) {
    return 'voip';
  } else if (service_provider_type == 4) {
    return 'non-carrier';
  } else
    return 'cell'
}

const findDeselectedItem = (CurrentArray, PreviousArray) => {

  var CurrentArrSize = CurrentArray.length;
  var PreviousArrSize = PreviousArray.length;

  const res = PreviousArray.filter((n) => {
    return CurrentArray.findIndex(y => y.Number === n) === -1;
  })

  return res;
}

const makeVMDropRequestMultiple = async (numbers, campaign) => {
  axios.post(ASTERISKSERVER_URL_MULTIPLE, numbers)
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      // const history = {
      //   _id: generateRandomId(),
      //   campaignId,
      //   uuid: '', // TODO
      //   number: number,
      //   number_type: '',
      //   error_message: error,
      //   status: 'Failed',
      //   carrier: ''
      // };
      // CallHistory.addCallHistory(history);

    });
}



// NOT IN USE , WILL USE THIS FUNCTION WHEN WE SINGLE API FOR EACH NUMBER
const makeVMDropRequest = async (params, campaignId, number) => {
  axios.post(ASTERISKSERVER_URL, params)
    .then(response => {
      const history = {
        _id: generateRandomId(),
        campaignId,
        uuid: response.data.uuid, // TODO
        number: response.data.number,
        number_type: response.data.number_type,
        error_message: response.data.error_message || response.data.message,
        status: (response.data.status === "failed" || response.data.status === "Failed") ? 'Failed' : 'Pending',
        carrier: response.data.carrier
      };
      CallHistory.addCallHistory(history);
    })
    .catch(error => {
      const history = {
        _id: generateRandomId(),
        campaignId,
        uuid: '', // TODO
        number: number,
        number_type: '',
        error_message: error,
        status: 'Failed',
        carrier: ''
      };
      CallHistory.addCallHistory(history);
    });
}


const getCarrierName = (carrierName) => {
  if (!carrierName) {
    return 'VERIZON'; // by default setting as verizon.
  }

  if (carrierName.toString().toUpperCase().includes('CINGULAR')) {
    return 'CINGULAR'
  }
  if (carrierName.toString().toUpperCase().includes('T-MOBILE')) {
    return 'T-MOBILE'
  }
  if (carrierName.toString().toUpperCase().includes('VERIZON')) {
    return 'VERIZON'
  }
  return 'VERIZON';

}