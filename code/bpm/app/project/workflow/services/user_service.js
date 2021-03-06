var model = require('../../bpm_resource/models/user_model');
var Promise = require("bluebird")
var utils = require('../../../../lib/utils/app_utils');
var tree = require('../../../../lib/utils/tree_utils');
var config = require('../../../../config');
var mongoUtils = require('../../../common/core/mongodb/mongoose_utils');
var mongoose = mongoUtils.init();


/**
 * 获取用户列表
 * @param page
 * @param size
 * @param conditionMap
 */
exports.getUserList= function(page, size, conditionMap) {
    var p = new Promise(function(resolve,reject){
        utils.pagingQuery4Eui(model.$User, page, size, conditionMap, resolve, '',  {});
    });
    return p;
};

/**
 * 校验用户编号是否存在
 * @param user_no
 */
exports.checkUserNo = function(user_no){
    var p = new Promise(function(resolve,reject){
        model.$User.find({user_no:user_no}, function(error, result) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '校验用户编号出现异常', null, error));
            }
            else {
                if(result.length == 0) {
                    resolve(utils.returnMsg(true, '0000', '校验通过', null, null));
                }
                else {
                    resolve(utils.returnMsg(false, '1000', '该用户编号已经存在', null, null));
                }
            }
        });
    });
    return p;
}

/**
 * 新增用户
 */
exports.saveUser = function(data, sysid, roleids, orgid) {
    var p = new Promise(function(resolve,reject){
        // 按规则设置密码
        var password = '123456';
        // var password = data.login_account + config.project.password_suffix;
        data.login_password = utils.encryptDataByMD5(password);

        // var sys = model.$CommonCoreSys({_id:sysid});
        data.user_sys = '';

        var org = model.$CommonCoreOrg({_id:orgid});
        data.user_org = org;

        roleids.forEach(function(roleid) {
            var role = model.$Role({_id:roleid});
            data.user_roles.push(role);
        });

        // 实例模型，调用保存方法
        model.$User(data).save(function(error){
            if(error) {
                resolve(utils.returnMsg(false, '1000', '新增用户时出现异常', null, error));
            }
            else {
                resolve(utils.returnMsg(true, '0000', '新增用户成功', null, null));
            }
        });
    });
    return p;
};

/**
 * 获取所有用户
 * @param orgid
 * @param cb
 */
exports.getUserDatas = function(orgid){
    var p = new Promise(function(resolve,reject){
        model.$User.find({user_org:orgid}, function(error, results) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '获取所有用户信息时出现异常', null, error));
            }
            else {
                if(results.length == 0) {
                    resolve(utils.returnMsg(false, '1001', '未能获取所有用户信息', null, null));
                }
                else {
                    resolve(utils.returnMsg(true, '0000', '获取所有用户信息成功', results, null));
                }
            }
        });
    });
    return p;

};

/**
 * 修改用户信息
 * @param id
 * @param data
 * @param sysid
 * @param roleids
 * @param orgid
 * @param cb
 */
exports.updateUser = function(id, data, sysid, roleids, orgid) {
    var p = new Promise(function(resolve,reject){
        // var sys = model.$CommonCoreSys({_id:sysid});
        data.user_sys = '';

        var org = model.$CommonCoreOrg({_id:orgid});
        data.user_org = org;

        roleids.forEach(function(roleid) {
            var role = model.$Role({_id:roleid});
            data.user_roles.push(role);
        });

        var conditions = {_id: id};
        var update = {$set: data};

        var options = {};
        model.$User.update(conditions, update, options, function (error) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '修改用户信息时出现异常。', null, error));
            }
            else {
                resolve(utils.returnMsg(true, '0000', '修改用户信息成功。', null, null));
            }
        });
    });
    return p;
}

/**
 * 重置密码
 * @param userid
 * @param cb
 */
exports.resetPwd = function(userid) {


    var p = new Promise(function(resolve,reject){
        model.$User.find({_id:userid}, function(error, result) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '重置密码时出现异常', null, error));
            }
            else {
                if(result.length == 0) {
                    resolve(utils.returnMsg(false, '1001', '重置密码时未能找到该用户', null, null));
                }
                else {

                    var user = result[0];
                    //var password = user.login_account + '';
                    // var password = user.login_account + config.project.password_suffix;
                    var password = '123456';

                    var conditions = {_id: userid};
                    var update = {$set: {login_password:utils.encryptDataByMD5(password)}};

                    var options = {};
                    model.$User.update(conditions, update, options, function (error) {
                        if(error) {
                            resolve(utils.returnMsg(false, '1002', '重置密码时出现异常', null, error));
                        }
                        else {
                            resolve(utils.returnMsg(true, '0000', '重置密码成功。', null, null));
                        }
                    });
                }
            }
        });
    });
    return p;
}

/**
 * 获取用户详情
 * @param userid
 * @param cb
 */
exports.getUser = function(userid,userno){

    var p = new Promise(function(resolve,reject){
        model.$User.find({"$or":[{'_id':userid},{'user_no':userno}]}, function(error, result) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '获取用户信息时出现异常', null, error));
            }
            else {
                if(result.length == 0) {
                    resolve(utils.returnMsg(false, '1001', '未能获取该用户信息', null, null));
                }
                else {
                    resolve(utils.returnMsg(true, '0000', '获取用户信息成功', result[0], null));
                }
            }
        });
    });
    return p;
};

/**
 * 根据user_no获取人员roles id
 * @param page
 * @param size
 * @param conditionMap
 */
exports.getUsreRolesByUserNo= function(userNo) {
    var p = new Promise(function(resolve,reject){
        var query = model.$User.find({'user_no':userNo,'user_status':1});
        query.exec(function(error,result){
            if (error) {
                var resuMap = {};
                resuMap.orgs = null;
                resuMap.roles = [];
                resolve(resuMap);
            } else {
                resolve(setRoleIdArr(result));
            }
        });
    });
    return p;
};
/**
 * 根据user_no获取人员姓名
 * @param page
 * @param size
 * @param conditionMap
 */
exports.getUsreNameByUserNo= function(userNo) {
    var p = new Promise(function(resolve,reject){
        var query = model.$User.find({'user_no':userNo});
        query.exec(function(error,result){
            if (error) {
                resolve(null);
            } else {
                if(result.length > 0){
                    resolve(result[0]._doc.user_name);
                }else {
                    resolve(null);
                }
            }
        });
    });
    return p;
};

function setRoleIdArr(arr){
    var resuMap = {};
    var result = [];
    if(arr && arr.length > 0){
        var roles = arr[0]._doc.user_roles;
        for(var i=0;i<roles.length;i++){
            result.push(roles[i].toString());
        }
        resuMap.orgs = arr[0]._doc.user_org?arr[0]._doc.user_org:null;
        resuMap.work_id = arr[0]._doc.work_id?arr[0]._doc.work_id:null;
        resuMap.roles = result;
    }
    return resuMap;
}

/**
 * 获取角色列表
 * @param page
 * @param size
 * @param conditionMap
 */
exports.getRoleList= function(page, size, conditionMap) {

    var p = new Promise(function(resolve,reject){
        utils.pagingQuery4Eui(model.$Role, page, size, conditionMap, resolve, '',  {});
    });
    return p;
};

/**
 * 获取用户角色列表--分页
 * @param page
 * @param size
 * @param conditionMap
 */
exports.getUserRoleList= function(page, size, conditionMap) {

    var p = new Promise(function(resolve,reject){
        utils.pagingQuery4Eui(model.$UserRole, page, size, conditionMap, resolve, '',  {});
    });
    return p;
};
/**
 * 获取角色列表
 */
exports.getRoles= function() {
    var p = new Promise(function(resolve,reject){
        var query = model.$Role.find({'role_status':1});
        query.exec(function(error,result){
            if (error) {
                resolve(new Array());
            } else {
                resolve(result);
            }
        });
    });
    return p;
};

/**
 * 获取机构数据
 * @param cb
 */
exports.getOrgTreeData = function() {

    var p = new Promise(function(resolve,reject){
        var fields = {_id:1, org_name: 1, org_pid: 1}; // 待返回的字段
        var options = {sort: {'org_pid': 1, 'org_order': 1}};
        model.$CommonCoreOrg.find({org_status:1},fields, options, function(error, result) {
            if(error) {
                resolve(new Array());
            }
            else {
                resolve(tree.buildEasyuiTree(result, '_id', 'org_name', 'org_pid'));
            }
        });
    });
    return p;
};

/**
 * 异步获取机构数据
 * @param condition
 * @param cb
 */
exports.getOrgTreeDataAsyn = function(condition) {
    
    var p = new Promise(function(resolve,reject){
        var fields = {_id:1, org_name: 1, org_pid: 1,childCount:1}; // 待返回的字段
        //var fields = {_id:1, org_name: 1, org_pid: 1}; // 待返回的字段
        var options = {sort: {'org_pid': 1,'childCount':-1,  'org_order': 1}};
        model.$CommonCoreOrg.find(condition,fields, options, function(error, result) {
            if(error) {
                resolve(new Array());
            }
            else {
                resolve(tree.buildEasyuiTreeAsyn(result, '_id', 'org_name', 'org_pid','childCount'));
            }
        });
    });
    return p;
};

/**
 * 获取角色
 */
exports.getRoleComboData = function() {

    var p = new Promise(function(resolve,reject){
        var fields = {_id:1, role_name: 1};
        var options = {};
        model.$Role.find({role_status:1}, fields, options, function(error, result) {
            if(error) {
                resolve(new Array());
            }
            else {
                resolve(result);
            }
        });
    });
    return p;
}

/**
 * 根据登录名和密码查询
 */
exports.queryUserByLoginaccount = function(account,password) {

    var p = new Promise(function(resolve,reject){
        model.$User.find({login_account:account,login_password:password}, function(error, result) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '获取用户信息异常', null, error));
            }
            else {
                resolve(utils.returnMsg(true, '0000', '获取用户信息成功', result, null));
            }
        });
    });
    return p;
}

/**
 * 修改密码
 * @param tag 当前用户状态
 * @param user_id _id用户表_id
 * @param new_pwd 新密码
 * @param old_pwd 旧密码
 * @returns {bluebird}
 */
exports.update_password = function(tag,user_id,new_pwd,old_pwd) {
    var p = new Promise(function(resolve,reject){
        model.$User.find({'_id':user_id,'user_status':tag}, function(error, result) {
            if(error) {
                resolve(utils.returnMsg(false, '1000', '获取用户信息异常', null, error));
            }
            else {
                if(result[0].login_password==old_pwd){
                    var udata = {
                       login_password : new_pwd
                    }
                    var update = {$set: udata};
                    var options = {};
                    model.$User.update({'_id':user_id},update,options,function(err,rs){
                        if(err){
                            resolve(utils.returnMsg(false, '1000', '修改密码出错', null, err));
                        }else{
                            resolve(utils.returnMsg(true, '0000', '密码修改成功',rs, null));
                        }
                    });
                }else{
                    resolve(utils.returnMsg(false, '1000', '原密码错误1', null, null));
                }
            }
        });
    });
    return p;
}
/**
 * 获取机构信息
 * @param tag 当前用户状态
 * @param _id _id用户表_id
 * @returns {bluebird}
 */
exports.getInfo = function (tag,_id) {
    var p = new Promise(function(resolve,reject){
        model.$User.find({'_id':_id,'user_status':tag}, function(error, result) {
           if(error){
               resolve(utils.returnMsg(false, '1000', '获取用户信息异常', null, error));
           }else{
               if(result.length>0){
                   var org_id = result[0].user_org;
                   model.$CommonCoreOrg.find({'_id':org_id},function (err,rs){
                       if(err){
                           resolve(utils.returnMsg(false, '1000', '查询出错', null, err));
                       }else{
                           console.log(rs);
                           resolve(utils.returnMsg(true, '0000', '查询成功',rs, null));
                       }
                   });
               }else{
                   resolve(utils.returnMsg(false, '1000', '获取用户信息出错', null, null));
               }
           }
        });
    });
    return p;
}
/**
 * 根据工号获取用户信息。
 * @param workId
 */
exports.queryUserByWorkId = function(workId){
    var p = new Promise(function(resolve,reject){
        model.$User.find({"work_id":workId},function(err,rs){
            if(err){
                resolve(utils.returnMsg(false, '1000', '派单失败:获取用户信息出错', null, err));
            }else{
                if(rs.length == 1){
                    resolve(utils.returnMsg(true, '0000', '获取用户信息成功', rs, null));
                }else if(rs.length == 0){
                    resolve(utils.returnMsg(false, '1000', '派单失败:找不到营业员', null, null));
                }else{
                    resolve(utils.returnMsg(false, '1000', '派单失败:获取用户信息出错', null, null));
                }
            }
        })
    });
    return p;
}
/**
 * 根据工号获取用户信息V2。
 * @param workId
 */
exports.getUserInfo = function(workId){
    // 查询用户信息
    var queryUserInfo = function(workId){
        return new Promise(function (resolve, reject){
            // 根据工号查询用户信息
            model.$User.find({"work_id":workId},function(err,rs){
                if(err){
                    resolve(utils.returnMsg(false, '0000', '查询营业员信息出错', null, err));
                }else{
                    if(rs.length > 0){
                        resolve(utils.returnMsg(true, '0001', '查询成功', rs, null));
                    }else{
                        resolve(utils.returnMsg(false, '0000', '未找到营业员', null, err));
                    }
                }
            });
        });
    }
    // 查询营业厅信息
    var queryChannelInfo = function(result){
        return new Promise(function (resolve, reject){
            if(result.success){
                let userInfo = result.data[0];
                var user = {};
                let orgs = userInfo.user_org;
                user.name = userInfo.user_name;
                user.mobile = userInfo.user_phone;
                if(orgs.length > 0) {
                    var match = {};
                    match["_id"] = {$in: orgs};
                    match["level"] = 6;
                    model.$CommonCoreOrg.find(match,function (err, rs) {
                        if(rs.length > 0) {
                            var orgInfos = [];
                            user.orgInfos = orgInfos;
                            for (let i = 0; i < rs.length; i++) {
                                let org = {};
                                org.channel_id = rs[i]._id;
                                org.channel_name = rs[i].org_fullname;
                                org.grid_id = rs[i].org_pid;
                                orgInfos.push(org);
                            }
                            resolve(utils.returnMsg(true, '0001', '查询成功', user, null));
                        }else{
                            resolve(utils.returnMsg(false, '0000', '非营业员角色不能转派', null, null));
                        }
                    })
                }else{
                    resolve(utils.returnMsg(false, '0000', '非营业员角色不能转派', null, null));
                }
            }else{
                resolve(result);
            }
        });
    }
    // 查询网格信息
    var queryGridInfo = function(result){
        return new Promise(function (resolve, reject){
            if(result.success){
                let org_pids = [];
                let user = result.data;
                let orgs = user.orgInfos;
                for (let item in orgs) {
                    if (orgs[item].grid_id) {
                        org_pids.push(new mongoose.Types.ObjectId(orgs[item].grid_id))
                    }
                }
                model.$CommonCoreOrg.find({"_id":{$in:org_pids}},function(err,rs) {
                    if (rs.length > 0) {
                        for (let item in orgs) {
                            for (let item in rs) {
                                if(orgs[item].grid_id == rs[item]._id){
                                    orgs[item].grid_name = rs[item].org_fullname;
                                    orgs[item].county_id = rs[item].org_pid;
                                }
                            }
                        }
                    }
                    resolve(utils.returnMsg(true, '0001', '查询成功', user, null));
                });
            }else{
                resolve(result);
            }
        });
    }
    // 查询区县信息
    var queryCountyInfo = function(result){
        return new Promise(function (resolve, reject){
            if(result.success){
                let org_pids = [];
                let user = result.data;
                let orgs = user.orgInfos;
                for (let item in orgs) {
                    if (orgs[item].county_id) {
                        org_pids.push(new mongoose.Types.ObjectId(orgs[item].county_id))
                    }
                }
                model.$CommonCoreOrg.find({"_id":{$in:org_pids}},function(err,rs) {
                    if (rs.length > 0) {
                        for (let item in orgs) {
                            for (let item in rs) {
                                if(orgs[item].county_id == rs[item]._id){
                                    orgs[item].county_name = rs[item].org_fullname;
                                    orgs[item].city_id = rs[item].org_pid;
                                }
                            }
                        }
                    }
                    resolve(utils.returnMsg(true, '0001', '查询成功', user, null));
                });
            }else{
                resolve(result);
            }
        });
    }
    // 查询城市信息
    var queryCityInfo = function(result){
        return new Promise(function (resolve, reject){
            if(result.success){
                let org_pids = [];
                let user = result.data;
                let orgs = user.orgInfos;
                for (let item in orgs) {
                    if(orgs[item].city_id){
                        org_pids.push(new mongoose.Types.ObjectId(orgs[item].city_id))
                    }
                }
                model.$CommonCoreOrg.find({"_id":{$in:org_pids}},function(err,rs) {
                    if (rs.length > 0) {
                        for (let item in orgs) {
                            for (let item in rs) {
                                if(orgs[item].city_id == rs[item]._id){
                                    orgs[item].city_name = rs[item].org_fullname;
                                }
                            }
                        }
                    }
                    resolve(utils.returnMsg(true, '0001', '查询成功', user, null));
                });
            }else{
                resolve(result);
            }
        });
    }
    var p = new Promise(function(resolve,reject){
        resolve(workId);
    })
    return p.then(queryUserInfo)
        .then(queryChannelInfo)
        .then(queryGridInfo)
        .then(queryCountyInfo)
        .then(queryCityInfo);
}
