'use strict';
const util = require('yyl-util');
const print = require('yyl-print');
const chalk = require('chalk');
const vars = require('../lib/vars.js');

const cache = {
  logLevel: -1,
  curType: null,
  curInfo: {
    type: null,
    argv: null,
    padding: 0
  },
  curMark: {
    update: [],
    del: [],
    create: [],
    warn: [],
    error: [],
    success: []
  }
};

const LOADING_CHARS = ['-', '\\', '|', '/'];

const fn = {
  relativeRoot(iPath) {
    return util.path.relative(vars.PROJECT_PATH, iPath);
  }
};

print.log.init({
  type: {
    // + status
    'info': {
      name: 'INFO',
      color: chalk.black.bgWhite
    },
    'Info': {
      name: 'INFO',
      color: chalk.white.bgBlue
    },
    'done': {
      name: 'DONE',
      color: chalk.black.bgGreen
    },
    'warn': {
      name: 'WARN',
      color: chalk.white.bgYellow
    },
    'success': {
      name: 'PASS',
      color: chalk.white.bgCyan
    },
    'create': {
      name: 'ADD>',
      color: chalk.white.bgGreen
    },
    'update': {
      name: 'UPDT',
      color: chalk.white.bgMagenta
    },
    'del': {
      name: 'DEL>',
      color: chalk.white.bgRed
    },
    // - status
    // + task name
    'init': {
      name: 'INIT',
      color: chalk.white.bgBlue.bold
    },

    'server': {
      name: 'SERV',
      color: chalk.white.bgBlue.bold
    },
    'watch': {
      name: 'WATC',
      color: chalk.white.bgBlue.bold
    },
    'optimize': {
      name: 'OPTI',
      color: chalk.white.bgRed.bold
    },
    'proxy': {
      name: 'PROX',
      color: chalk.white.bgBlack.bold
    },
    'commit-copy': {
      name: 'COPY',
      color: chalk.white.bgBlue.bold
    },
    'commit-step01': {
      name: 'ST01',
      color: chalk.white.bgBlue.bold
    },
    'commit-step02': {
      name: 'ST02',
      color: chalk.white.bgBlue.bold
    },
    'commit-step03': {
      name: 'ST03',
      color: chalk.white.bgBlue.bold
    },
    'make': {
      name: 'MAKE',
      color: chalk.white.bgBlue.bold
    },
    'remove': {
      name: 'RM',
      color: chalk.white.bgBlue.bold
    },
    'cmd': {
      name: 'CMD>',
      color: chalk.white.bgBlack.bold
    },
    'yyl': {
      name: 'YYL>',
      color: chalk.white.bgBlack.bold
    }
    // - w-update
  }
});

const log = (module, type, argv) => {
  let iArgv = [];
  if (argv) {
    iArgv = util.type(argv) !== 'array' ? [argv] : argv;
  }
  if (!~cache.logLevel) {
    cache.logLevel = 1;
  }

  print.log.setLogLevel(+cache.logLevel);

  switch (module) {
    case 'start':
      if (type in print.log) {
        print.log[type](...iArgv);
        cache.curType = type;
        cache.curMark.create = [];
        cache.curMark.update = [];
        cache.curMark.del = [];
        cache.curMark.success = [];
        cache.curMark.error = [];
        cache.curMark.warn = [];
        cache.curInfo.type = null;
        cache.curInfo.argv = null;
        cache.curInfo.padding = 0;
        print.fn.cost.start();
      }
      break;
    case 'clear':
      if (cache.logLevel === 1) {
        print.cleanScreen();
      }
      break;

    case 'cmd':
      print.log.cmd(...iArgv);
      break;

    case 'yyl':
      print.log.yyl(...iArgv);
      break;

    case 'finished':
    case 'finish':
      print.fn.cost.end();
      if (cache.logLevel === 1 && cache.curType) {
        if (cache.curMark.success.length) {
          cache.curMark.success.forEach((fArgv) => {
            print.log.success(...fArgv);
          });
        }
        if (cache.curMark.warn.length) {
          cache.curMark.warn.forEach((fArgv) => {
            print.log.warn(...fArgv);
          });
        }
      }
      if (cache.curType) {
        print.log.done(`${cache.curType} finished, total cost ${chalk.yellow.bold(print.fn.cost.format())}, at ${chalk.yellow.green.bold(print.fn.timeFormat())}`);
      }
      cache.curType = null;
      break;
    case 'end':
      break;

    case 'msg':
      var iType = '';

      if (type in print.log) {
        iType = type;
      } else {
        iType = 'info';
      }

      switch (type) {
        case 'concat':
          iType = 'success';
          iArgv = [
            chalk.yellow.bold('concat:'),
            chalk.cyan(fn.relativeRoot(iArgv[0])),
            chalk.gray('<='),
            ...iArgv.slice(1).map((fPath) => fn.relativeRoot(fPath))
          ];
          break;

        case 'rev':
          iType = 'success';
          iArgv.unshift(chalk.yellow('rev:'));
          break;

        case 'del':
        case 'create':
        case 'update':
        case 'optimize':
          iArgv = iArgv.map((fPath) => fn.relativeRoot(fPath));
          break;
      }

      if (cache.logLevel === 1 && cache.curType) {
        let statusStr = '';
        if (cache.curMark[iType]) {
          cache.curMark[iType].push(iArgv);
        }
        if (!/error|success|info/.test(iType)) {
          cache.curInfo.argv = iArgv;
          cache.curInfo.type = iType;
        }

        if (cache.curMark.create.length) {
          statusStr = `${statusStr} ${chalk.green('ADD')} ${chalk.yellow.bold(cache.curMark.create.length)}`;
        }
        if (cache.curMark.update.length) {
          statusStr = `${statusStr} ${chalk.magenta('UPD')} ${chalk.yellow.bold(cache.curMark.update.length)}`;
        }
        if (cache.curMark.del.length) {
          statusStr = `${statusStr} ${chalk.gray('DEL')} ${chalk.yellow.bold(cache.curMark.del.length)}`;
        }
        if (cache.curMark.warn.length) {
          statusStr = `${statusStr} ${chalk.yellow('WARN')} ${chalk.yellow.bold(cache.curMark.warn.length)}`;
        }
        if (cache.curMark.error.length) {
          statusStr = `${statusStr} ${chalk.red('ERR')} ${chalk.yellow.bold(cache.curMark.error.length)}`;
        }
        statusStr = statusStr.trim();
        if (iType === 'error') {
          print.log[iType](...iArgv);
        } else {
          let rArgv = [];
          cache.curInfo.padding++;
          if (cache.curInfo.argv) {
            rArgv = rArgv.concat(cache.curInfo.argv);
            rArgv.unshift(`${chalk.blue.bold(cache.curInfo.type)}${print.fn.makeSpace(10 - cache.curInfo.type.length)}${chalk.gray(LOADING_CHARS[cache.curInfo.padding % LOADING_CHARS.length])}`);
          }

          if (statusStr) {
            rArgv.unshift(statusStr);
          }
          if (rArgv.length) {
            print.log[cache.curType](...rArgv);
          }
        }
      } else {
        print.log[iType](...iArgv);
      }
      break;

    default:
      break;
  }
};
log.update = (lv) => {
  cache.logLevel = lv;
};

module.exports = log;

