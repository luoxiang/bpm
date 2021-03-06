var process_model = require('../../bpm_resource/models/process_model');
var mistake_model = require('../models/mistake_model');
var user_model = require('../../bpm_resource/models/user_model');
var process_util = require('../../../utils/process_util');
var mistake_model = require('../models/mistake_model');
var utils = require('../../../../lib/utils/app_utils');
var inst = require('../../bpm_resource/services/instance_service');
var nodeTransferService = require("../../bpm_resource/services/node_transfer_service");
var process_extend_service = require("../../bpm_resource/services/process_extend_service");
var moment = require('moment');
var mongoUtils = require('../../../common/core/mongodb/mongoose_utils');
var mongoose = mongoUtils.init();
var xlsx = require('node-xlsx');
var config = require('../../../../config');
var nodegrass = require("nodegrass");
var dictModel = require('../../workflow/models/dict_model');
/**
 * 查询差错工单列表
 * @param page
 * @param size
 * @param conditionMap
 * @returns {Promise}
 */
exports.getMistakeListPage = function (page, size, conditionMap) {

    var p = new Promise(function (resolve, reject) {
        page = (page == '0') ? 1 : parseInt(page);
        size = parseInt(size);

        mistake_model.$ProcessMistake.aggregate([
            {
                $match: conditionMap

            },

            {
                $skip: (page - 1) * size
            },
            {
                $limit: size
            },
            {
                $sort: {"mistake_time": -1}
            },
            {
                $lookup: {
                    from: "common_bpm_org_info",
                    localField: 'city_code',
                    foreignField: "company_code",
                    as: "city_org"
                }
            },
            {
                $unwind: {path: "$city_org", preserveNullAndEmptyArrays: true}
            },

            {
                $lookup: {
                    from: "common_bpm_org_info",
                    localField: 'channel_id',
                    foreignField: "company_code",
                    as: "channel_org"
                }
            },
            {
                $unwind: {path: "$channel_org", preserveNullAndEmptyArrays: true}
            },
            {
                $addFields: {
                    city_name: "$city_org.org_name",
                    channel_name: "$channel_org.org_name"
                }
            },

        ]).exec(function (err, res) {

            var result = {rows: res, success: true};
            mistake_model.$ProcessMistake.aggregate([
                {
                    $match: conditionMap
                },
                {
                    $group: {
                        _id: null,
                        count: {$sum: 1}
                    }
                }
            ]).exec(function (err, res) {
                if (res.length == 0) {
                    result.total = 0;
                } else {
                    result.total = res[0].count;
                }
                resolve(result);

            })
        })

    });

    return p;
};

/**
 * 差错工单派单
 * @param queryDate
 * @returns {Promise}
 */
exports.dispatch = function (queryDate, check_status, user_no, user_name, role_name, business_code, city_code, work_id, status, mlog_id) {
    //处理流程
    var proc_code = config.mistake_proc_code;

    var p = new Promise(function (resolve, reject) {
        var queryJson = {"status": status};
        if (queryDate) {
            queryJson.mistake_time = queryDate
        }
        if (check_status)
            queryJson.check_status = check_status;
        if (business_code)
            queryJson.business_code = business_code;
        if (city_code)
            queryJson.city_code = city_code;
        //查询状态为0的，即未派单的差错工单
        mistake_model.$ProcessMistake.find(queryJson, function (err, mistakeRes) {
            if (err) {
                console.log('获取差错工单待派单失败', err);
                reject({'success': false, 'code': '1000', 'msg': '获取差错工单待派单失败', "error": err});
            } else {

                //获取差错工单流程配置信息
                process_model.$ProcessDefine.find({"proc_code": proc_code}, function (err, res) {
                    if (err) {
                        console.log('获取差错工单流程信息失败', err);
                        reject({'success': false, 'code': '1000', 'msg': '获取差错工单流程信息失败', "error": err});
                        return;
                    } else {
                        if (res.length > 0) {
                            /** 首先查找差错工单第三节点配置信息，且第三节点只可配置第二配置项**/
                            var proc_name = res[0].proc_name;
                            var proc_define = JSON.parse(res[0].proc_define);
                            var item_config = JSON.parse(res[0].item_config);
                            var lines = proc_define.lines;
                            var nodes = proc_define.nodes;
                            //第三节点配置信息
                            var three_node_config;
                            //获取开始节点
                            for (let item in nodes) {
                                var node = nodes[item];
                                if (node.type == 'start  round') {
                                    //获取第二节点
                                    for (let item1 in lines) {
                                        var line = lines[item1];
                                        if (line.from == item) {
                                            //获取第三节点
                                            for (let item2 in lines) {
                                                var line2 = lines[item2];
                                                if (line2.from == line.to) {
                                                    //获取第三节点配置信息
                                                    for (let item3 in item_config) {
                                                        var node3 = item_config[item3];
                                                        //  console.log(node3);
                                                        if (node3.item_code == line2.to) {
                                                            three_node_config = node3;
                                                            break;
                                                        }
                                                    }
                                                    break;
                                                }
                                            }
                                            break;
                                        }
                                    }
                                    break;
                                }
                            }
                            /** 其次根据第三节点配置就是，然后依据每条差错工单的渠道编码查找对应的指派账号，进行工单指派**/
                            if (three_node_config) {
                                //只能配置参照角色
                                if (three_node_config.item_assignee_type == 2) {
                                    console.log("派单数量", mistakeRes.length);
                                    //开始派单
                                    insertMistakes(mistakeRes, three_node_config, proc_code, proc_name, user_no, user_name, role_name, queryDate, work_id, mlog_id).then(function (result) {
                                        resolve(result);
                                    }).catch(function (err) {
                                        reject(err);
                                    });

                                } else {
                                    return reject({
                                        'success': false,
                                        'code': '1000',
                                        'msg': '差错工单第三节点只可配置参照角色',
                                        "error": null
                                    });

                                }
                            } else {
                                return reject({'success': false, 'code': '1000', 'msg': '第三节点无配置信息', "error": err});

                            }
                        }
                    }
                })

            }
        });
    });

    return p;
};

/**
 * 查询是否有派单日志
 * @param conditionMap
 */
exports.dispatch_logs_date = function (conditionMap) {
    return new Promise(function (resolve, reject) {
        console.log(conditionMap);
        mistake_model.$ProcessMistakeLogs.find(conditionMap, function (err, result) {
            if (err) {
                reject({'success': false, 'code': '1000', 'msg': '按条件查询派单日志失败', "error": err});
            } else {
                var flag = true;
                if (result.length == 0) {
                    flag = true;
                } else {

                    for (let i = 0; i < result.length; i++) {
                        if (result[i].status == 0) {//派单中
                            flag = false;
                            continue;
                        }
                    }
                }
                resolve({
                    'success': true,
                    'code': '1000',
                    'msg': '查询日志成功',
                    'data': flag
                });

            }
        });
    });
};

/**
 * 调用派单接口
 * @param datas
 */
exports.getInterface = function (queryDate, check_status, user_no, user_name, role_name, business_code, city_code, work_id, status, mlog_id) {
    var REQUST_HEADERS = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'token': 'MdHk08AaAwif7X9s6VHPiDkKZ'
    };
    var p = new Promise(function (resolve, reject) {
        nodegrass.post(config.api_interface_url + "/gdgl/api/task/dispatch",
            function (resp, status, headers) {
                if (status == '200') {
                    resolve(JSON.parse(resp));
                } else {
                    resolve({'success': false, 'code': status, 'msg': '差错工单派单异常'});
                }
            },
            REQUST_HEADERS,
            {
                'queryDate': queryDate,
                'check_status': check_status,
                'user_no': user_no,
                'user_name': user_name,
                'role_name': role_name,
                'work_id': work_id,
                'city_code': city_code,
                'business_code': business_code,
                'mlog_id': mlog_id,
                'status': status,
                time: new Date()
            },
            'utf8').on('error', function (e) {
            console.log("Got error: " + e.message);
            mistake_model.$ProcessMistakeLogs.remove({'_id': mlog_id});
            resolve({'success': false, 'code': '1000', 'msg': '差错工单派单异常'});
        });
    });
    return p;
};

/**
 * 新增派单日志
 * @param datas
 * @returns {Promise}
 */
exports.addMistakeLog = function (datas) {
    return new Promise(function (resolve, reject) {
        //将派发结果插入日志表中
        mistake_model.$ProcessMistakeLogs.create(datas, function (err, result) {
            if (err) {
                resolve({'success': false, 'code': '1000', 'msg': '新增派单日志表失败', "error": err});
            } else {
                resolve({
                    'success': true,
                    'code': '1000',
                    'msg': '派单日志新增成功',
                    'data': result
                });

            }
        });
    });
};
/**
 * 获取派单日志详情
 * @param page
 * @param size
 * @param conditionMap
 * @returns {Promise}
 */
exports.dispatch_logs = function (page, size, conditionMap) {

    var p = new Promise(function (resolve, reject) {
        utils.pagingQuery4Eui(mistake_model.$ProcessMistakeLogs, page, size, conditionMap, resolve, '', {});

    });

    return p;
};

/**
 * 派发差错工单
 * @param mistakeRes 差错工单结果集
 * @param queryJson
 * @returns {Promise.<void>}
 */
function insertMistakes(mistakeRes, three_node_config, proc_code, proc_name, user_no, user_name, role_name, queryDate, work_id, mlog_id) {

    return new Promise(function (resolve, reject) {
        //成功数
        let successCount = 0;
        //失败数
        let failCount = 0;
        let batch_size = config.batch_size;
        let length = mistakeRes.length;
        let phone = '';
        //获取派单通知电话
        dictModel.$DictAttr.find({$or: [{"field_name": "mistake_task_order_number"}, {"field_name": "mistake_task_phone"}]}, function (err, res) {
            if (err) {

            } else {
                var data = {};
                for (let item in res) {
                    let dict = res[item];
                    data[dict.field_name] = dict.field_value;
                }
                var params = {}
                if (data.mistake_task_phone && data.mistake_task_phone.length == 11 && data.mistake_task_order_number) {
                    phone = data.mistake_task_phone;
                    //数量为0短信通知
                    if (length == 0) {
                        params.msg = queryDate + "可派单数量为0，请核查!"
                        process_util.sendSMS(phone, params, "MISTAKE_DISTRIBUTE_TASK").then(function (rs) {
                            console.log("短信发送成功");
                        }).catch(function (err) {
                            console.log("短信发送失败", err);
                        });

                    } else if (length > data.mistake_task_order_number) {
                        //如果派单数量超过设置上限短信通知
                        params.msg = queryDate + "可派单数量为:" + length + ",超过系统自动派单上限:" + data.mistake_task_order_number + ",请核查!"
                        process_util.sendSMS(phone, params, "MISTAKE_DISTRIBUTE_TASK").then(function (rs) {
                            console.log("短信发送成功");
                        }).catch(function (err) {
                            console.log("短信发送失败", err);
                        });
                    } else {
                        //分批次派发工单
                        let pool_size = Math.ceil(length / batch_size);
                        console.log("=================总共", pool_size, "次====================");
                        (async function () {
                            for (let i = 0; i < pool_size; i++) {
                                console.log("=================第", i, "次====================");
                                let start = i * batch_size;
                                let end = ((i + 1) * batch_size) > length ? length : ((i + 1) * batch_size);
                                console.log(start, end, length);
                                await new Promise(resolve1 => {
                                    let count = 0;
                                    for (let j = start; j < end; j++) {
                                        let mistake = mistakeRes[j];
                                        insertMistake(mistake, three_node_config, proc_code, user_name, role_name, queryDate, user_no).then(function (result) {
                                            console.log("=================", count, successCount, failCount, end, result, "====================");
                                            //成功派单
                                            if (result == 'successCount') {
                                                successCount++;
                                            } else if (result == 'failCount') {
                                                //派单失败
                                                failCount++;
                                            }
                                            //全部处理完成
                                            if ((failCount + successCount) == length) {
                                                var data = {};
                                                data.dispatch_finish_time = new Date();
                                                //1表示：派单全部成功。2表示：派单部分成功。3表示：派单全部失败。
                                                if (successCount == length) {
                                                    data.status = 1;
                                                } else if (failCount == length) {
                                                    data.status = 3;
                                                } else {
                                                    data.status = 2;
                                                }
                                                data.dispatch_remark = '工单派发:成功数为' + successCount + " 失败数为" + failCount;
                                                var conditions = {_id: mlog_id};
                                                var update = {
                                                    $set: {
                                                        "status": data.status,
                                                        "dispatch_finish_time": data.dispatch_finish_time,
                                                        "dispatch_remark": data.dispatch_remark
                                                    }
                                                };
                                                var options = {};
                                                //将派发结果状态更新到日志表中
                                                mistake_model.$ProcessMistakeLogs.update(conditions, update, options, function (err) {
                                                    if (err) {
                                                        reject({
                                                            'success': false,
                                                            'code': '1000',
                                                            'msg': '更新派单日志失败',
                                                            "error": err
                                                        });
                                                    } else {
                                                        var params = {msg: queryDate+'工单派发成功数为' + successCount + " 失败数为" + failCount}
                                                        //如果派单数据异常，则发送短信
                                                        if (phone && phone.length ==11) {
                                                            process_util.sendSMS(phone, params, "MISTAKE_DISTRIBUTE_TASK").then(function (rs) {
                                                                console.log("短信发送成功");
                                                            }).catch(function (err) {
                                                                console.log("短信发送失败", err);
                                                            });
                                                        }

                                                        resolve({
                                                            'success': true,
                                                            'code': '1000',
                                                            'msg': '工单派发:成功数为' + successCount + " 失败数为" + failCount
                                                        });

                                                    }
                                                })
                                            }

                                            if (count == (end - start - 1))
                                                resolve1()
                                            count++;
                                        }).catch(function (e) {
                                            reject(e);
                                        });
                                    }


                                })

                            }
                        })()
                    }

                }

            }
        })
    })
}

/**
 * 对每条差错工单进行判断，成功则派发工单
 * @param mistake
 * @param business_name
 * @param channel_org
 * @param queryJson
 * @param three_node_config
 * @param proc_code
 * @returns {Promise}
 */
function insertMistake(mistake, three_node_config, proc_code, user_name, role_name, queryDate, admin_user_no) {
    return new Promise(function (resolve, reject) {
        //工号和业务名称必须存在
        if (mistake.salesperson_code && mistake.business_name) {
            //查找用户,存在相同工号不同角色的人，这里限制只能营业员
            user_model.$User.find({
                "work_id": mistake.salesperson_code,
                "user_roles": {$in: ["5a26418c5eb3fe1068448753"]}
            }, function (err, res) {
                if (err) {
                    reject({'success': false, 'code': '1000', 'msg': '找用户系统错误', "error": err});
                } else {
                    //账号只能对于一个
                    if (res.length == 1) {
                        //用户编号
                        var user_no = res[0].user_no;

                        var proc_ver;
                        var proc_title = mistake.business_name + "    (" + mistake.BOSS_CODE + ")";
                        var user_code = admin_user_no;
                        var assign_user_no = user_no;
                        var userName = user_name;
                        var node_code = three_node_config.item_code;
                        //直接向mistake中插入key不可行，这里先将对象转对json字符串再转为json
                        mistake.remark = "上传文件(图片，文档，语音),原因:" + mistake.remark;
                        var mistak_json = JSON.stringify(mistake);
                        mistake = JSON.parse(mistak_json);

                        mistake.start_user = role_name;
                        mistake.start_user_name = user_name;
                        mistake.time = queryDate;//文件中的派单时间
                        mistake.start_time = moment().format('YYYY-MM-DD HH:mm:ss');
                        mistake.work_day = 7;
                        mistake.end_time = moment().add(mistake.work_day, "days").format('YYYY-MM-DD HH:mm:ss');
                        mistake.user_phone = res[0].user_phone;
                        var proc_vars = JSON.stringify(mistake);
                        var biz_vars;
                        var memo = mistake.remark;

                        //创建工单，分发任务
                        inst.createInstance(proc_code, proc_ver, proc_title, "", proc_vars, biz_vars, user_code, userName, "errorSys_node")
                            .then(function (result) {
                                if (result.success) {
                                    var task_id = result.data[0]._id;
                                    inst.acceptTask(task_id, user_code, userName).then(function (rs) {
                                        if (rs.success) {
                                            nodeTransferService.do_payout(task_id, node_code, user_code, assign_user_no, proc_title, biz_vars, proc_vars, memo).then(function (results) {
                                                console.log(results);
                                                //成功派发
                                                if (results.success) {
                                                    var conditions = {_id: mistake._id};
                                                    var update = {
                                                        $set: {
                                                            "status": 1,
                                                            "dispatch_remark": "派发成功",
                                                            "proc_inst_id": results.data[0]._id
                                                        }
                                                    };
                                                    var options = {};
                                                    //修改对应的差错工单状态以及备注
                                                    mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                                                        if (errors) {
                                                            reject({
                                                                'success': false,
                                                                'code': '1000',
                                                                'msg': '修改错误5',
                                                                "error": errors
                                                            });
                                                        } else {
                                                            //将差错工单结果插入统计表
                                                            process_extend_service.addStatistics(results.data[0]._id, queryDate, mistake.channel_id).then(function (rs) {
                                                                console.log("插入统计表成功", rs);
                                                            }).catch(function (e) {
                                                                console.log("插入统计表失败", e);
                                                            });
                                                            resolve("successCount");
                                                        }
                                                    })
                                                } else {
                                                    var conditions = {_id: mistake._id};
                                                    var update = {
                                                        $set: {
                                                            "status": -1,
                                                            "dispatch_remark": "错误原因:派单失败3" + results.msg
                                                        }
                                                    };
                                                    var options = {};
                                                    //修改对应的差错工单状态以及备注
                                                    mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                                                        if (errors) {
                                                            reject({
                                                                'success': false,
                                                                'code': '1000',
                                                                'msg': '修改错误6',
                                                                "error": errors
                                                            });
                                                        } else {
                                                            resolve("failCount");
                                                        }
                                                    })
                                                }
                                            });
                                        } else {
                                            var conditions = {_id: mistake._id};
                                            var update = {
                                                $set: {
                                                    "status": -1,
                                                    "dispatch_remark": "错误原因:派单失败2" + rs.msg
                                                }
                                            };
                                            var options = {};
                                            //修改对应的差错工单状态以及备注
                                            mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                                                if (errors) {
                                                    reject({
                                                        'success': false,
                                                        'code': '1000',
                                                        'msg': '修改错误7',
                                                        "error": errors
                                                    });
                                                } else {
                                                    resolve("failCount");
                                                }
                                            })
                                        }

                                    })
                                } else {
                                    console.log("proc_code",proc_code, "proc_ver",proc_ver, "proc_title",proc_title, "parm","","proc_vars", proc_vars,"biz_vars", biz_vars,"user_code", user_code,"userName", userName, "errorSys_node")
                                    var conditions = {_id: mistake._id};
                                    var update = {
                                        $set: {
                                            "status": -1,
                                            "dispatch_remark": "错误原因:派单失败1" + result.msg
                                        }
                                    };
                                    var options = {};
                                    //修改对应的差错工单状态以及备注
                                    mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                                        if (errors) {
                                            reject({
                                                'success': false,
                                                'code': '1000',
                                                'msg': '修改错误8',
                                                "error": errors
                                            });
                                        } else {
                                            resolve("failCount");
                                        }
                                    })
                                }
                            }).catch(function (err) {
                        });


                    } else if (res.length > 1) {
                        var conditions = {_id: mistake._id};
                        var update = {$set: {"status": -1, "dispatch_remark": "错误原因: 查找用户为多个，无法具体指定"}};
                        var options = {};
                        //修改对应的差错工单状态以及备注
                        mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                            if (errors) {
                                reject({'success': false, 'code': '1000', 'msg': '修改错误4', "error": errors});
                            } else {
                                resolve("failCount");
                            }

                        })
                    } else {
                        var conditions = {_id: mistake._id};
                        var update = {$set: {"status": -1, "dispatch_remark": "错误原因: 找不到对应用户"}};
                        var options = {};
                        //修改对应的差错工单状态以及备注
                        mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
                            if (errors) {
                                reject({'success': false, 'code': '1000', 'msg': '修改错误3', "error": errors});
                            } else {
                                resolve("failCount");
                            }
                        })
                    }

                }
            })
        } else {
            resolve("failCount");
        }
    })
}

/**
 * 删除
 * @param ids
 * @returns {Promise}
 */
exports.remove = function (ids) {

    return new Promise(function (resolve, reject) {

        var objIds = [];
        var idsArr = ids.split(",");
        for (let i in idsArr) {
            objIds.push(new mongoose.Types.ObjectId(idsArr[i]));
        }
        var conditions = {_id: objIds};
        var update = {$set: {"status": -2, "dispatch_remark": "删除"}};
        var options = {multi: true};
        //修改对应的差错工单状态以及备注
        mistake_model.$ProcessMistake.update(conditions, update, options, function (errors) {
            if (errors) {
                reject({'success': false, 'code': '1000', 'msg': '删除错误3', "error": errors});
            } else {
                resolve({'success': true, 'code': '2000', 'msg': '删除成功', "error": null});
            }
        })
    });

};


/**
 * 超时工单
 * @param page
 * @param size
 * @param conditionMap
 * @returns {Promise}
 */
exports.overtimeList = function (page, size, conditionMap, work_order_number) {

    return new Promise(function (resolve, reject) {

        page = parseInt(page);
        size = parseInt(size);
        if (page == 0) {
            page = 1;
        }
        var match = {"is_overtime": 1, "proc_code": "p-201"};
        if (work_order_number) {
            match.work_order_number = work_order_number;
        }
        process_model.$ProcessInst.aggregate([
            {
                $match: match
            },

            {
                $lookup: {
                    from: "common_bpm_proc_task_statistics",
                    localField: '_id',
                    foreignField: "proc_inst_id",
                    as: "statistics"
                }
            },
            {
                $unwind: {path: "$statistics", preserveNullAndEmptyArrays: true}
            },
            {
                $match: conditionMap
            },

            {
                $addFields: {
                    city_code: "$statistics.city_code",
                    city_name: "$statistics.city_name",
                    country_code: "$statistics.country_code",
                    country_name: "$statistics.county_name",
                    channel_code: "$statistics.channel_code",
                    channel_name: "$statistics.channel_name",
                    work_id: "$statistics.work_id",
                }
            },
            {
                $skip: (page - 1) * size
            },
            {
                $limit: size
            },
        ]).exec(function (err, res) {
            if (err) {
                reject(utils.returnMsg(false, '1000', '查询统计失败。', null, err));
            } else {

                //console.log(res);
                var result = {rows: res, success: true};
                process_model.$ProcessInst.aggregate([
                    {
                        $match: {"is_overtime": 1, "proc_code": "p-201"}
                    },
                    {
                        $lookup: {
                            from: "common_bpm_proc_task_statistics",
                            localField: '_id',
                            foreignField: "proc_inst_id",
                            as: "statistics"
                        }
                    },
                    {
                        $unwind: {path: "$statistics", preserveNullAndEmptyArrays: true}
                    },
                    {
                        $match: conditionMap
                    },
                    {
                        $addFields: {
                            "isCount": "1"
                        }
                    },
                    {
                        $sortByCount: "$isCount"
                    }

                ]).exec(function (err, res) {
                    if (err) {
                        reject(utils.returnMsg(false, '1000', '查询统计失败。', null, err));
                    } else {
                        // console.log(res)
                        if (res.length > 0) {
                            result.total = res[0].count;
                        } else {
                            result.total = 0;
                        }
                        resolve(result);
                    }
                })


            }
        })


    });

};


exports.export_overtimeList = function (page, size, conditionMap, work_order_number) {

    return new Promise(function (resolve, reject) {

        page = parseInt(page);
        size = parseInt(size);
        if (page == 0) {
            page = 1;
        }
        var match = {"is_overtime": 1, "proc_code": "p-201"};
        if (work_order_number) {
            match.work_order_number = work_order_number;
        }
        process_model.$ProcessInst.aggregate([
            {
                $match: {"is_overtime": 1, "proc_code": "p-201"}
            },
            {
                $lookup: {
                    from: "common_bpm_proc_task_statistics",
                    localField: '_id',
                    foreignField: "proc_inst_id",
                    as: "statistics"
                }
            },
            {
                $unwind: {path: "$statistics", preserveNullAndEmptyArrays: true}
            },
            {
                $match: conditionMap
            },
            {
                $addFields: {
                    "isCount": "1"
                }
            },
            {
                $sortByCount: "$isCount"
            }

        ]).exec(function (err, res) {
            if (err) {
                reject(utils.returnMsg(false, '1000', '查询统计失败。', null, err));
            } else {
                if (res.length > 0) {
                    let count = res[0].count;
                    console.log("总数：", count);
                    let batch_size = 500;
                    let size = Math.ceil(count / batch_size);
                    let arr = [];
                    for (let i = 0; i < size; i++) {

                        process_model.$ProcessInst.aggregate([
                            {
                                $match: match
                            },
                            {
                                $skip: i * batch_size
                            },
                            {
                                $limit: batch_size
                            },
                            {
                                $lookup: {
                                    from: "common_bpm_proc_task_statistics",
                                    localField: '_id',
                                    foreignField: "proc_inst_id",
                                    as: "statistics"
                                }
                            },
                            {
                                $unwind: {path: "$statistics", preserveNullAndEmptyArrays: true}
                            },
                            {
                                $match: conditionMap
                            },

                            {
                                $addFields: {
                                    city_code: "$statistics.city_code",
                                    city_name: "$statistics.city_name",
                                    country_code: "$statistics.country_code",
                                    country_name: "$statistics.county_name",
                                    channel_code: "$statistics.channel_code",
                                    channel_name: "$statistics.channel_name",
                                    work_id: "$statistics.work_id",
                                }
                            },

                        ]).exec(function (err, res) {
                            if (err) {
                                reject(utils.returnMsg(false, '1000', '查询统计失败。', null, err));
                            } else {
                                arr = arr.concat(res);
                                console.log("長度:", res.length);
                                console.log(arr.length, count);
                                if (arr.length == count) {
                                    resolve({arr});
                                }

                            }
                        })
                    }
                } else {
                    resolve();
                }
            }
        })


    });

};


function createExcelOvertimeList(list) {
    const headers = [
        '地州',
        '区县',
        '渠道ID',
        '营业厅名称',
        '工号',
        '客户号码',
        '客户订单号',
        '受理业务',
        '稽核说明',
        '超时时间',
        '未归档次数',
        '是否归档'
    ];

    var data = [headers];
    list = list.arr;

    list.map(c => {

        var json = JSON.parse(c.proc_vars)
        var end_time = new Date(json.end_time).getTime();
        var now = new Date().getTime();
        var time;
        if (c.proc_inst_status == 4) {
            var json = JSON.parse(c.proc_vars)
            var end_time = new Date(json.end_time).getTime();
            var complete_time = new Date(c.proc_inst_task_complete_time).getTime();
            time = formatDuring(complete_time - end_time);
        } else {
            var now = new Date().getTime();
            time = formatDuring(now - end_time);
        }
        const tmp = [
            c.city_name,
            c.country_name,
            c.channel_code,
            c.channel_name,
            c.work_id,
            JSON.parse(c.proc_vars).client_tel,
            c.work_order_number,
            JSON.parse(c.proc_vars).business_name,
            JSON.parse(c.proc_vars).remark,
            time,
            c.refuse_number,
            c.proc_inst_status == '4' ? '归档' : '未归档'
        ]

        data.push(tmp);
    });
    var ws = {
        s: {
            "!row": [{wpx: 67}]
        }
    };
    ws['!cols'] = [{wpx: 100}, {wpx: 100}, {wpx: 100}, {wpx: 150}, {wpx: 100}, {wpx: 100}, {wpx: 120}, {wpx: 100}, {wpx: 300}, {wpx: 120}, {wpx: 100}];


    return xlsx.build([{name: 'Sheet1', data: data}], ws);
}

exports.createExcelOvertimeList = createExcelOvertimeList;

/**
 * 获取黄河审核通过数据
 */
exports.getHuanghePassOrderList = function (beginDate, endDate, dataCount, tradeTypeCode) {

    return new Promise(function (resolve, reject) {
        if (beginDate && endDate && dataCount) {
            var postData = {
                beginDate: beginDate,
                endDate: endDate,
                dataCount: dataCount,
                tradeTypeCode: tradeTypeCode//业务名称
            }
            var options = config.paperList_huanghe;
            process_util.httpPost(postData, options).then(function (rs) {
                console.log("结果,", rs);
                let rs_json = JSON.parse(rs)
                let result = {};
                if (rs_json.ret_code == '-1') {
                    result.rows = [];
                    result.total = 0;
                } else {
                    result.rows = rs_json.data;
                }
                console.log(result)
                resolve(result)
            });
        } else {
            let result = {rows: [], total: 0};
            resolve(result)
        }

    })

}
exports.huangheFileDownload = function (tradeId) {

    return new Promise(function (resolve, reject) {
        var postData = {
            tradeId: tradeId
        }
        var options = config.paperPdf_huanghe;
        process_util.httpPost(postData, options).then(function (rs) {

            let rs_json = JSON.parse(rs)
            let dataBuffe = '';
            if (rs_json.ret_code == '-1') {
                dataBuffe = '';
            } else {
                dataBuffe = new Buffer(rs_json.data, 'base64');
            }
            resolve(dataBuffe)
        });
    })

}


exports.createHuangheOrder = function (body) {

    return new Promise(function (resolve, reject) {

        //如果差错工单中有数据，则不可重复复核黄河数据
        mistake_model.$ProcessMistake.find({"BOSS_CODE": body.BOSS_CODE}, function (err, res) {
            if (err) {
                reject({'success': false, 'code': '1000', 'msg': '复核失败001', "error": null})
            } else {
                console.log("res", res);
                if (res && res.length > 0) {
                    reject({'success': false, 'code': '1000', 'msg': '不可重复复核', "error": null})
                } else {

                    //复核通过
                    if (body.status == '0') {
                        //查询对应的流程信息
                        process_model.$ProcessDefine.find({"proc_code": "p-201"}, function (err, res) {
                            if (err) {
                                reject({'success': false, 'code': '1000', 'msg': '复核失败002', "error": null})
                            } else if (res && res.length > 0) {
                                let inst = {};
                                inst.proc_name = res[0].proc_name;
                                inst.proc_code = res[0].proc_code;
                                inst.proc_id = res[0].proc_id;
                                inst.proc_define_id = res[0]._id
                                inst.proc_define = res[0].proc_define;
                                inst.item_config = res[0].item_config;
                                inst.proc_title = body.business_name + "    (" + body.BOSS_CODE + ")"
                                var myDate = new Date();
                                var year = myDate.getFullYear();
                                var month = myDate.getMonth() + 1;
                                var day = myDate.getDate();
                                var randomNumber = parseInt(((Math.random() * 9 + 1) * 100000));
                                inst.work_order_number = "GDBH" + year + month + day + randomNumber;
                                inst.proc_cur_arrive_time = new Date();
                                inst.proc_start_user = body.proc_start_user;
                                inst.proc_start_user_name = body.start_user_name;
                                inst.proc_start_time = new Date();
                                inst.proc_inst_status = 4;
                                inst.proc_vars = JSON.stringify(body);
                                inst.is_check = 0;
                                inst.check_time = new Date();
                                inst.check_user_no = body.proc_start_user;
                                inst.check_user_name = body.start_user_name;
                                inst.proc_inst_task_complete_time = new Date();
                                inst.refuse_number = 0;
                                inst.is_overtime = 0;
                                //插入实例
                                process_model.$ProcessInst.create(inst, function (err, inst_doc) {
                                    let his = {};
                                    his.proc_name = inst.proc_name;
                                    his.proc_code = inst.proc_code;
                                    his.proc_task_start_user_role_names = inst.proc_task_start_user_role_names;
                                    his.proc_task_start_name = inst.proc_task_start_name;
                                    his.proc_vars = inst.proc_vars;
                                    his.proc_inst_task_remark = '复核意见：复核通过';
                                    his.proc_inst_task_sign = 1;
                                    his.proc_inst_task_assignee = inst.proc_start_user;
                                    his.proc_inst_task_assignee_name = inst.proc_start_user_name;
                                    his.proc_inst_task_status = 1;
                                    his.proc_inst_task_complete_time = new Date();
                                    his.proc_inst_task_handle_time = new Date();
                                    his.proc_inst_task_arrive_time = new Date();
                                    his.proc_inst_task_title = inst.proc_title;
                                    his.proc_inst_task_name = '黄河工单复核';
                                    his.proc_inst_id = inst_doc._id;
                                    his.work_order_number = inst.work_order_number;
                                    //插入任务
                                    process_model.$ProcessTaskHistroy.create(his, function (err, doc) {
                                        if (err) {
                                            reject({'success': false, 'code': '1000', 'msg': '复核失败003', "error": null})
                                        } else {
                                            if (doc) {
                                                body.status = 4;
                                                body.insert_time = new Date();
                                                body.proc_inst_id = inst_doc._id
                                                //插入差错工单表
                                                mistake_model.$ProcessMistake.create(body, function (err, doc) {
                                                    if (err) {
                                                        reject({
                                                            'success': false,
                                                            'code': '1000',
                                                            'msg': '复核失败003',
                                                            "error": null
                                                        })

                                                    } else {
                                                        resolve({
                                                            'success': true,
                                                            'code': '2000',
                                                            'msg': '复核成功',
                                                            "error": null
                                                        })
                                                    }
                                                })
                                            }

                                        }
                                    })
                                })
                            }

                        })

                    } else {
                        //查找用户,存在相同工号不同角色的人，这里限制只能营业员
                        user_model.$User.find({
                            "work_id": body.salesperson_code,
                            "user_roles": {$in: ["5a26418c5eb3fe1068448753"]}
                        }, function (err, res) {
                            if (err) {
                                reject({'success': false, 'code': '1000', 'msg': '找用户系统错误', "error": err});
                            } else {
                                //账号只能对于一个
                                if (res.length == 1) {
                                    //用户编号
                                    var user_no = res[0].user_no;
                                    var proc_title = body.business_name + "    (" + body.BOSS_CODE + ")";
                                    var user_code = body.proc_start_user;
                                    var assign_user_no = user_no;
                                    var userName = body.start_user_name
                                    var node_code = 'processDefineDiv_node_3';
                                    var mistak_json = JSON.stringify(body);
                                    body = JSON.parse(mistak_json);
                                    body.time = body.mistake_time;//文件中的派单时间
                                    body.start_time = moment().format('YYYY-MM-DD HH:mm:ss');
                                    body.work_day = 7;
                                    body.end_time = moment().add(body.work_day, "days").format('YYYY-MM-DD HH:mm:ss');
                                    body.user_phone = res[0].user_phone;
                                    var proc_vars = JSON.stringify(body);
                                    var biz_vars;
                                    var memo = body.remark;

                                    //创建工单，分发任务
                                    inst.createInstance('p-201', '', proc_title, "", proc_vars, '', user_code, userName, "errorSys_node")
                                        .then(function (result) {
                                            if (result.success) {
                                                var task_id = result.data[0]._id;
                                                inst.acceptTask(task_id, user_code, userName).then(function (rs) {
                                                    if (rs.success) {
                                                        nodeTransferService.do_payout(task_id, node_code, user_code, assign_user_no, proc_title, biz_vars, proc_vars, memo).then(function (results) {
                                                            console.log(results);
                                                            //成功派发
                                                            if (results.success) {
                                                                body.status = 11;
                                                                body.insert_time = new Date();
                                                                body.proc_inst_id = results.data[0]._id
                                                                //插入差错工单表
                                                                mistake_model.$ProcessMistake.create(body, function (err, doc) {
                                                                    if (err) {
                                                                        reject({
                                                                            'success': false,
                                                                            'code': '1000',
                                                                            'msg': '复核失败003',
                                                                            "error": null
                                                                        })

                                                                    } else {
                                                                        process_extend_service.addStatistics(results.data[0]._id, body.mistake_time, body.channel_id).then(function (rs) {
                                                                            process_model.$ProcessInst.update({_id: results.data[0]._id}, {
                                                                                $set: {
                                                                                    is_check: 1,
                                                                                    check_time: new Date(),
                                                                                    check_user_no: user_no,
                                                                                    check_user_name: body.start_user_name
                                                                                }
                                                                            }, {}, function (err) {
                                                                                resolve({
                                                                                    'success': true,
                                                                                    'code': '2000',
                                                                                    'msg': '复核成功',
                                                                                    "error": null
                                                                                })
                                                                            })
                                                                        }).catch(function (e) {
                                                                            reject({
                                                                                'success': false,
                                                                                'code': '1000',
                                                                                'msg': '复核成功，但是插入统计表失败:' + e.msg,
                                                                                "error": null
                                                                            })
                                                                        });

                                                                    }
                                                                })

                                                            } else {
                                                                reject({
                                                                    'success': false,
                                                                    'code': '1000',
                                                                    'msg': '复核失败005',
                                                                    "error": null
                                                                })
                                                            }
                                                        });
                                                    } else {
                                                        reject({
                                                            'success': false,
                                                            'code': '1000',
                                                            'msg': '复核失败006',
                                                            "error": null
                                                        })
                                                    }

                                                })
                                            } else {
                                                reject({
                                                    'success': false,
                                                    'code': '1000',
                                                    'msg': '复核失败007',
                                                    "error": null
                                                })
                                            }
                                        }).catch(function (err) {
                                        reject({'success': false, 'code': '1000', 'msg': '复核失败008', "error": null})
                                    });


                                } else if (res.length > 1) {
                                    reject({'success': false, 'code': '1000', 'msg': '多个营业员无法具体指派', "error": errors});
                                } else {
                                    reject({'success': false, 'code': '1000', 'msg': '无营业员可派单', "error": errors});
                                }

                            }
                        })

                    }
                }
            }
        })


    })

}

function formatDuring(mss) {
    var days = parseInt(mss / (1000 * 60 * 60 * 24));
    var hours = parseInt((mss % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = parseInt((mss % (1000 * 60 * 60)) / (1000 * 60));
    return days + " 天 " + hours + " 小时 " + minutes + " 分钟 ";
}