/* no-const-assign: 0 */
'use strict';

const util = require('yyl-util');
const os = require('os');
const path = require('path');
const fs = require('fs');

const SUGAR_REG = /(\{\$)([a-zA-Z0-9@_\-$.~]+)(\})/g;

const USERPROFILE = process.env[process.platform == 'win32'? 'USERPROFILE': 'HOME'];
const CWD = process.cwd();

const rUtil = util.extend(true, util, {
  vars: {
    // 本程序根目录
    BASE_PATH: path.join(__dirname, '..'),

    // init path
    INIT_PATH: path.join(__dirname, '../init'),

    IS_WINDOWS: process.platform == 'win32',

    // svn rev 文件保留多少个版本
    REV_KEEP_COUNT: 3,
    // 当前cmd 所在地址
    PROJECT_PATH: util.joinFormat(CWD),

    // 搜索用 common 目录路径匹配
    COMMIN_PATH_LIKE: 'public/global',
    // COMMIN_PATH_LIKE: 'common/pc',

    // 用户设置文件地址
    USER_CONFIG_FILE: util.joinFormat(CWD, 'config.js'),

    // 用户 package.json 地址
    USER_PKG_FILE: util.joinFormat(CWD, 'package.json'),

    // server 根目录
    SERVER_PATH: util.joinFormat(USERPROFILE, '.yyl'),

    // server 数据存放目录
    SERVER_DATA_PATH: util.joinFormat(USERPROFILE, '.yyl/data'),

    // server plugins 存放目录
    SERVER_PLUGIN_PATH: util.joinFormat(USERPROFILE, '.yyl/plugins'),

    // server proxy mapping 存放地址
    SERVER_PROXY_MAPPING_FILE: util.joinFormat(USERPROFILE, '.yyl/data/proxy-mapping.js'),

    // server 存放 https 证书的目录
    SERVER_CERTS_PATH: util.joinFormat(USERPROFILE, '.yyl/certs'),

    // server 存放构建生成的 config 的缓存文件
    SERVER_CONFIG_LOG_PATH: util.joinFormat(USERPROFILE, '.yyl/config-log'),

    // 本机 ip地址
    LOCAL_SERVER: (function() {
      var ipObj = os.networkInterfaces();
      var ipArr;
      for (var key in ipObj) {
        if (ipObj.hasOwnProperty(key)) {
          ipArr = ipObj[key];
          for (var fip, i = 0, len = ipArr.length; i < len; i++) {
            fip = ipArr[i];
            if (fip.family.toLowerCase() == 'ipv4' && !fip.internal) {
              return fip.address;
            }
          }
        }
      }
      return '127.0.0.1';
    })()
  },
  readJSON: function (path) {
    if (!fs.existsSync(path)) {
      throw new Error(`File not exists: ${path}`);
    }
    return JSON.parse(fs.readFileSync(path));
  },

  checkPort: function (port) {
    return new Promise((next) => {
      util.checkPortUseage(port, (canUse) => {
        next(canUse);
      });
    });
  }
});

rUtil.msg.init({
  maxSize: 8,
  type: {
    rev: {name: 'rev', color: '#ffdd00'},
    concat: {name: 'Concat', color: 'cyan'},
    update: {name: 'Updated', color: 'cyan'},
    proxyTo: {name: 'Proxy =>', color: 'gray'},
    proxyBack: {name: 'Proxy <=', color: 'cyan'},
    supercall: {name: 'Supercal', color: 'magenta'},
    optimize: {name: 'Optimize', color: 'green'},
    cmd: {name: 'CMD', color: 'gray'},
    yyl: {name: 'YYL', color: 'gray'}
  }
});

module.exports = rUtil;
