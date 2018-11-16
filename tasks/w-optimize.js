'use strict';
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const extFs = require('yyl-fs');
const Concat = require('concat-with-sourcemaps');
const revHash = require('rev-hash');
const frp = require('yyl-file-replacer');

const wServer = require('./w-server.js');
const util = require('./w-util.js');
const log = require('./w-log');
const SEED = require('./w-seed.js');
const extFn = require('./w-extFn.js');

const wOpzer = async function (ctx, iEnv, configPath) {
  // env format
  if (iEnv.ver == 'remote') {
    iEnv.remote = true;
  }
  if (iEnv.remote) {
    iEnv.ver = 'remote';
  }

  log('msg', 'info', 'parse config start');

  // init config
  let config = null;
  try {
    config = await extFn.parseConfig(configPath, iEnv);
  } catch (er) {
    throw `yyl ${ctx} ${util.envStringify(iEnv)} error, ${er}`;
  }

  wOpzer.saveConfigToServer(config);

  // 版本检查
  const yylPkg = util.requireJs(path.join(__dirname, '../package.json'));

  if (util.compareVersion(config.version, yylPkg.version) > 0) {
    throw `optimize fail, project required yyl at least ${config.version}`;
  }

  const seed = SEED.find(config);
  if (!seed) {
    throw `optimize fail, config.workflow (${config.workflow}) is not in yyl seed, usage: ${Object.keys[SEED]}`;
  }

  const opzer = seed.optimize(config, path.dirname(configPath));

  // handle exists check
  if (!opzer[ctx] || util.type(opzer[ctx]) !== 'function') {
    throw `optimize fail handle [${ctx}] is not exists`;
  }

  // package check
  try {
    await wOpzer.initPlugins(config);
  } catch (er) {
    throw `optimize fail, plugins install error: ${er.message}`;
  }

  // clean dist
  await extFs.removeFiles(config.localserver.root);

  // find usage localserver port
  await extFn.makeAwait((next) => {
    let iPort = config.localserver.port;
    const checkPort = function (canUse) {
      if (canUse) {
        config.localserver.port = iPort;
        next(config, opzer);
      } else {
        iPort = config.localserver.port + Math.round(Math.random() * 1000);
        extFn.checkPort(iPort).then(checkPort);
      }
    };

    extFn.checkPort(iPort).then(checkPort);
  });

  if (ctx === 'watch') {
    let afterConfig = await wServer.start(config, iEnv);
    if (afterConfig) {
      config = afterConfig;
    }

    // proxy server
    const canUse = await extFn.checkPort(8887);
    if (canUse) {
      let cmd = 'yyl proxy start --silent';
      await extFn.makeAwait((next) => {
        util.runCMD(cmd, () => {
          next();
        }, util.vars.PROJECT_PATH, true, true);
      });
    } else {
      log('msg', 'warn', `proxy server start fail, ${chalk.yellow.bold('8887')} was occupied`);
    }
  }

  // optimize
  await extFn.makeAwait((next) => {
    let isUpdate = 0;
    let isError = false;
    opzer[ctx](iEnv)
      .on('start', () => {
        if (isUpdate) {
          log('clear');
          log('start', 'optimize');
        }
      })
      .on('msg', (type, argv) => {
        log('msg', type, argv);
        if (type === 'error') {
          isError = true;
        }
      })
      .on('finished', () => {
        if (ctx === 'all' && isError) {
          throw `${ctx} task run error`;
        }
        log('msg', 'success', [`opzer.${ctx}() finished`]);
        const finishHandle = () => {
          log('msg', 'success', [`task - ${ctx} finished ${chalk.yellow(util.getTime())}`]);
          if (isUpdate) {
            wOpzer.livereload(config, iEnv);
            log('finish');
          } else {
            isUpdate = 1;
            log('finish');
            next(config, opzer);
          }
        };
        wOpzer.afterTask(config, iEnv, isUpdate).then(() => {
          if (
            ctx === 'watch' &&
            !isUpdate &&
            !iEnv.silent &&
            iEnv.proxy
          ) {
            wOpzer.openHomePage(config, iEnv).then(() => {
              finishHandle();
            }).catch(() => {
              finishHandle();
            });
          } else {
            finishHandle();
          }
        }).catch((er) => {
          throw er;
        });
      });
  });
};

wOpzer.afterTask = (config, iEnv, isUpdate) => {
  // return Promise.resolve();
  return new Promise((done) => {
    new util.Promise((next) => { // resoucce
      wOpzer.resource(config, iEnv).then(() => {
        next();
      });
    }).then((next) => { // concat
      wOpzer.concat(config, iEnv).then(() => {
        next();
      });
    }).then((next) => { // var sugar
      wOpzer.varSugar(config, iEnv).then(() => {
        next();
      });
    }).then(() => { // rev
      // return done();
      if (isUpdate) {
        wOpzer.rev.update(config, iEnv).then(() => {
          done();
        });
      } else {
        iEnv.revIgnore = /async_component/;
        wOpzer.rev.build(config, iEnv).then(() => {
          done();
        });
      }
    }).start();
  });
};

// var sugar
wOpzer.varSugar = (config, iEnv) => {
  const varObj = util.extend({}, config.alias);
  let mainPrefix = '/';
  let staticPrefix = '/';
  let root = varObj.destRoot;

  if (iEnv.remote || iEnv.isCommit) {
    mainPrefix = config.commit.mainHost || config.commit.hostname || '/';
    staticPrefix = config.commit.staticHost || config.commit.hostname || '/';
  }

  Object.keys(varObj).forEach((key) => {
    let iPrefix = '';
    if (varObj[key].match(frp.IS_MAIN_REMOTE)) {
      iPrefix = mainPrefix;
    } else {
      iPrefix = staticPrefix;
    }
    varObj[key] = util.path.join(
      iPrefix,
      path.relative(root, varObj[key])
    );
  });


  return new Promise((next) => {
    extFs.readFilePaths(config.destRoot, /\.html$/, true).then((htmls) => {
      htmls.forEach((iPath) => {
        let iCnt = fs.readFileSync(iPath).toString();
        iCnt = frp.htmlPathMatch(iCnt, (rPath) => {
          return extFn.sugarReplace(rPath, varObj);
        });
        fs.writeFileSync(iPath, iCnt);
      });
      next();
    });
  });
};

// concat 操作
wOpzer.concat = (config) => {
  return new Promise((next) => {
    const concatIt = function(dest, srcs) {
      const concat = new Concat(false, dest, '\n');
      srcs.forEach((item) => {
        if (!fs.existsSync(item)) {
          log('msg', 'warn', `${item} is not exists, break`);
          return;
        }

        if (path.extname(item) == '.js') {
          concat.add(null, `;/* ${path.basename(item)} */`);
        } else {
          concat.add(null, `/* ${path.basename(item)} */`);
        }
        concat.add(item, fs.readFileSync(item));
      });

      util.mkdirSync(path.dirname(dest));
      fs.writeFileSync(dest, concat.content);
      log('msg', 'concat', [dest].concat(srcs));
    };
    log('msg', 'info', 'concat start');
    for (var dist in config.concat) {
      if (config.concat.hasOwnProperty(dist)) {
        concatIt(dist, config.concat[dist]);
      }
    }
    log('msg', 'success', 'concat finished');
    next();
  });
};

// resouce 操作
wOpzer.resource = (config) => {
  return new Promise((next) => {
    if (config.resource) {
      extFs.copyFiles(config.resource).then((data) => {
        data.add.forEach((iPath) => {
          log('msg', 'create', iPath);
        });

        data.update.forEach((iPath) => {
          log('msg', 'update', iPath);
        });
        next();
      }).catch((er) => {
        log('msg', 'warn', ['resource error', er]);
        next();
      });
    } else {
      log('msg', 'info', 'config.resource is not defined, break');
      next();
    }
  });
};

wOpzer.rev = {
  use(config) {
    wOpzer.rev.cache.config = config;
  },
  getConfigSync() {
    return wOpzer.rev.cache.config;
  },
  cache: {
    config: null
  },
  fn: {

    mark: {
      source: {
        create: [],
        update: [],
        other: []
      },
      add: function(type, iPath) {
        var self = this;
        self.source[type in self.source? type: 'other'].push(iPath);
      },
      reset: function() {
        var self = this;
        Object.keys(self.source).forEach((key) => {
          self.source[key] = [];
        });
      },
      print: function() {
        var source = this.source;
        log('msg', 'rev', [
          chalk.green('create: ') + chalk.yellow(source.create.length),
          chalk.cyan('update: ') + chalk.yellow(source.update.length),
          chalk.gray('other: ') + chalk.yellow(source.other.length)
        ].join(', '));
      }
    },

    // 路径纠正
    resolveUrl: function(cnt, filePath, revMap, op) {
      var iExt = path.extname(filePath).replace(/^\./g, '');
      var iDir = path.dirname(filePath);
      var config = wOpzer.rev.getConfigSync();
      var iHostname = (function() {
        if (op.isCommit || op.ver  == 'remote' || op.proxy) {
          return config.commit.hostname;
        } else {
          return '/';
        }
      })();
      let r = '';
      const revReplace = function(rPath) {
        let rrPath = rPath;
        Object.keys(revMap).forEach((key) => {
          if (key == 'version') {
            return;
          }
          rrPath = rrPath.split(key).join(revMap[key]);
        });
        return rrPath;
      };
      const htmlReplace = function(iCnt) {
        const rCnt = frp.htmlPathMatch(iCnt, (iPath, type) => {
          const r = (rPath) => {
            switch (type) {
              case '__url':
                return `'${revReplace(rPath)}'`;

              default:
                return revReplace(rPath);
            }
          };

          let rPath = iPath;
          if (rPath.match(frp.REG.HTML_IGNORE_REG)) {
            return r(iPath);
          } else if (rPath.match(frp.REG.HTML_ALIAS_REG)) { // 构建语法糖 {$key}
            var isMatch = false;

            rPath = rPath.replace(
              frp.REG.HTML_ALIAS_REG,
              (str, $1, $2) => {
                if (config.alias[$2]) {
                  isMatch = true;
                  return config.alias[$2];
                } else {
                  return '';
                }
              }
            );

            if (isMatch && rPath && fs.existsSync(rPath)) {
              rPath = util.path.join(
                iHostname,
                util.path.relative(config.alias.destRoot, rPath)
              );

              return r(rPath);
            } else {
              return r(iPath);
            }
          } else {
            // url format
            rPath = util.path.join(rPath);

            // url absolute
            if (!rPath.match(frp.REG.IS_HTTP) && !path.isAbsolute(rPath)) {
              rPath = util.path.join(
                iHostname,
                util.path.relative(config.alias.destRoot, iDir),
                rPath
              );
            }
            return r(rPath);
          }
        });

        return rCnt;
      };
      const cssReplace = function(iCnt) {
        const rCnt = frp.cssPathMatch(iCnt, (iPath) => {
          let rPath = iPath;
          if (rPath.match(frp.REG.CSS_IGNORE_REG)) {
            return iPath;
          } else {
            rPath = util.path.join(rPath);
            // url absolute
            if (!rPath.match(frp.REG.IS_HTTP) && !path.isAbsolute(rPath)) {
              rPath = util.path.join(
                op.remotePath ? op.remotePath : config.commit.hostname,
                util.path.relative(config.alias.destRoot, iDir),
                rPath
              );
            }

            return revReplace(rPath);
          }
        });

        return rCnt;
      };
      const jsReplace = function(iCnt) {
        return frp.jsPathMatch(iCnt, (iPath, type) => {
          const r = (rPath) => {
            switch (type) {
              case '__url':
                return `'${revReplace(rPath)}'`;

              default:
                return revReplace(rPath);
            }
          };
          let rPath = iPath;
          if (rPath.match(frp.REG.CSS_IGNORE_REG)) {
            return r(rPath);
          } else {
            rPath = util.path.join(rPath);
            // url absolute
            if (!rPath.match(frp.REG.IS_HTTP) && !path.isAbsolute(rPath)) {
              rPath = util.path.join(
                op.remotePath ? op.remotePath : config.commit.hostname,
                util.path.relative(config.alias.destRoot, iDir),
                rPath
              );
            }

            return r(rPath);
          }
        });
      };
      switch (iExt) {
        case 'html':
        case 'tpl':
          r = htmlReplace(cnt);
          break;

        case 'css':
          r = cssReplace(cnt);
          break;

        case 'js':
          r = jsReplace(cnt);
          break;

        default:
          r = cnt;
          break;
      }

      return r;
    },
    // hash map 生成
    buildHashMap: function(iPath, revMap) {
      var config = wOpzer.rev.getConfigSync();
      var revSrc = util.joinFormat(path.relative(config.alias.revRoot, iPath));
      var hash = `-${revHash(fs.readFileSync(iPath))}`;
      var revDest = revSrc.replace(/(\.[^.]+$)/g, `${hash}$1`);

      revMap[revSrc] = revDest;
    },
    // 文件 hash 替换
    fileHashPathUpdate: function(iPath, revMap, op) {
      var iCnt = fs.readFileSync(iPath).toString();
      var rCnt = iCnt;
      var selfFn = this;

      // url format
      rCnt = selfFn.resolveUrl(rCnt, iPath, revMap, op);



      if (iCnt != rCnt) {
        selfFn.mark.add('update', iPath);
        fs.writeFileSync(iPath, rCnt);
      }
    },
    buildRevMapDestFiles: function(revMap) {
      var config = wOpzer.rev.getConfigSync();
      var selfFn = this;
      if (!config) {
        return;
      }
      Object.keys(revMap).forEach((iPath) => {
        var revSrc = util.joinFormat(config.alias.revRoot, iPath);
        var revDest = util.joinFormat(config.alias.revRoot, revMap[iPath]);

        if (!fs.existsSync(revSrc)) {
          return;
        }

        selfFn.mark.add(fs.existsSync(revDest)? 'update': 'create', revDest);
        fs.writeFileSync(revDest, fs.readFileSync(revSrc));
      });
    }
  },
  // 文件名称
  filename: 'rev-manifest.json',

  getRemoteManifest: function(op) {
    const config = wOpzer.rev.getConfigSync(op);
    let disableHash = false;

    if (config.disableHash) {
      disableHash = true;
    }

    if (!config.commit.revAddr) {
      disableHash = true;
    }

    return new Promise((next) => {
      if (!disableHash) {
        log('msg', 'info', `get remote rev start: ${config.commit.revAddr}`);
        var requestUrl = config.commit.revAddr;
        requestUrl += `${~config.commit.revAddr.indexOf('?')? '&': '?'  }_=${  +new Date()}`;
        util.get(requestUrl, (content) => {
          var iCnt;
          try {
            iCnt = JSON.parse(content.toString());
            log('msg', 'success', 'get remote finished');
          } catch (er) {
            log('msg', 'warn', ['get remote rev fail', er]);
          }
          next(iCnt);
        });
      } else {
        if (!config.commit.revAddr) {
          log('msg', 'warn', 'get remote rev fail, config.commit.revAddr is null');
        }
        next(null);
      }
    });
  },
  // rev-build 入口
  build: function(config, op) {
    return new Promise((NEXT, err) => {
      const self = this;
      const selfFn = self.fn;
      if (!config) {
        return err('rev-build run fail', 'config not exist');
      }

      self.use(config);

      let disableHash = false;

      if (config.disableHash) {
        disableHash = true;
        log('msg', 'success', 'config.disableHash, rev task ignore');
      }

      if (!config.commit.revAddr) {
        disableHash = true;
        log('msg', 'success', 'config.commit.revAddr not set, rev task ignore');
      }

      new util.Promise((next) => {
        // 如果是 remote 直接执行 rev-update
        if (op.ver) {
          wOpzer.rev.getRemoteManifest(op).then((data) => {
            if (data) {
              log('msg', 'info', 'ver is not blank, remote url exist, run rev-update');
              return wOpzer.rev.update(config, op, data).then(() => {
                NEXT();
              });
            } else {
              next();
            }
          }).catch(() => {
            next();
          });
        } else {
          next();
        }
      }).then(() => {
        // 清除 dest 目录下所有带 hash 文件
        wOpzer.rev.clean(config, op).then(() => {
          const htmlFiles = [];
          const jsFiles = [];
          const cssFiles = [];
          const resourceFiles = [];
          const tplFiles = [];

          util.readFilesSync(config.alias.root, (iPath) => {
            let r;
            const iExt = path.extname(iPath);

            if (/\.(html|json)/.test(iExt)) {
              r = false;
            } else {
              r = true;
            }

            if (op.revIgnore) {
              if (iPath.match(op.revIgnore)) {
                return r;
              }
            }

            switch (iExt) {
              case '.css':
                cssFiles.push(iPath);
                break;

              case '.js':
                jsFiles.push(iPath);
                break;

              case '.html':
                htmlFiles.push(iPath);
                break;

              case '.tpl':
                tplFiles.push(iPath);
                break;

              default:
                if (r) {
                  resourceFiles.push(iPath);
                }
                break;
            }
            return r;
          });

          // 生成 hash 列表
          let revMap = {};
          // 重置 mark
          selfFn.mark.reset();

          // 生成 资源 hash 表
          if (!disableHash) {
            resourceFiles.forEach((iPath) => {
              selfFn.buildHashMap(iPath, revMap);
            });
          }

          // 生成 js hash 表
          jsFiles.forEach((iPath) => {
            // hash路径替换
            selfFn.fileHashPathUpdate(iPath, revMap, op);

            if (!disableHash) {
              // 生成hash 表
              selfFn.buildHashMap(iPath, revMap);
            }
          });

          // css 文件内路径替换 并且生成 hash 表
          cssFiles.forEach((iPath) => {
            // hash路径替换
            selfFn.fileHashPathUpdate(iPath, revMap, op);

            if (!disableHash) {
              // 生成hash 表
              selfFn.buildHashMap(iPath, revMap);
            }
          });

          // tpl 文件内路径替换 并且生成 hash 表
          tplFiles.forEach((iPath) => {
            // hash路径替换
            selfFn.fileHashPathUpdate(iPath, revMap, op);

            if (!disableHash) {
              // 生成hash 表
              selfFn.buildHashMap(iPath, revMap);
            }
          });

          // html 路径替换
          htmlFiles.forEach((iPath) => {
            selfFn.fileHashPathUpdate(iPath, revMap, op);
          });


          if (!disableHash) {
            // 根据hash 表生成对应的文件
            selfFn.buildRevMapDestFiles(revMap);

            // 版本生成
            revMap.version = util.makeCssJsDate();

            // rev-manifest.json 生成
            util.mkdirSync(config.alias.revDest);
            const revPath = util.joinFormat(config.alias.revDest, wOpzer.rev.filename);
            const revVerPath = util.joinFormat(
              config.alias.revDest,
              wOpzer.rev.filename.replace(/(\.\w+$)/g, `-${revMap.version}$1`)
            );

            // 存在 则合并
            if (fs.existsSync(revPath)) {
              let oRevMap = null;
              try {
                oRevMap = JSON.parse(fs.readFileSync(revPath));
              } catch (er) {
                log('msg', 'warn', 'oRegMap parse error');
              }
              if (oRevMap) {
                revMap = util.extend(true, oRevMap, revMap);
                log('msg', 'success', 'original regMap concat finished');
              }
            }

            fs.writeFileSync(revPath, JSON.stringify(revMap, null, 4));
            selfFn.mark.add('create', revPath);

            // rev-manifest-{cssjsdate}.json 生成
            fs.writeFileSync(revVerPath, JSON.stringify(revMap, null, 4));
            selfFn.mark.add('create', revVerPath);
          }

          selfFn.mark.print();
          log('msg', 'success', 'rev-build finished');
          NEXT();
        });
      }).start();
    });
  },
  // rev-update 入口
  update: function(config, op, remoteManifestData) {
    return new Promise((NEXT, err) => {
      const self = this;
      const selfFn = self.fn;
      const config = self.getConfigSync(op);
      if (!config) {
        return err('rev-update run fail', 'config not exist');
      }

      self.use(config);

      let disableHash = false;

      if (config.disableHash) {
        disableHash = true;
        log('msg', 'success', 'config.disableHash, rev task ignore');
      }

      if (!config.commit.revAddr) {
        disableHash = true;
        log('msg', 'success', 'config.commit.revAddr not set, rev task ignore');
      }

      // 重置 mark
      selfFn.mark.reset();

      new util.Promise(((next) => { // 获取 rev-manifest
        if (remoteManifestData) {
          next(remoteManifestData);
        } else {
          if (op.ver == 'remote') { // 远程获取 rev-manifest
            wOpzer.rev.getRemoteManifest(op).then((data) => {
              next(data);
            }).catch(() => {
              next(null);
            });
          } else {
            next(null);
          }
        }
      })).then((revMap, next) => { // 获取本地 rev-manifest
        if (revMap) {
          return next(revMap);
        }

        if (disableHash) {
          return next({});
        }

        var localRevPath = util.joinFormat(
          config.alias.revDest,
          wOpzer.rev.filename
        );

        if (fs.existsSync(localRevPath)) {
          try {
            revMap = JSON.parse(fs.readFileSync(localRevPath).toString());
          } catch (er) {
            log('msg', 'warn', ['local rev file parse fail', er]);
            return err(er);
          }

          next(revMap);
        } else {
          return err(`local rev file not exist: ${chalk.yellow(localRevPath)}`);
        }
      }).then((revMap, next) => { // hash 表内html, css 文件 hash 替换
        // html, tpl 替换
        const htmlFiles = util.readFilesSync(config.alias.root, /\.(html|tpl)$/);

        htmlFiles.forEach((iPath) => {
          selfFn.fileHashPathUpdate(iPath, revMap, op);
        });

        // css or js 替换
        if (disableHash) {
          const jsFiles = util.readFilesSync(config.alias.root, /\.js$/);
          const cssFiles = util.readFilesSync(config.alias.root, /\.css$/);

          jsFiles.forEach((filePath) => {
            self.fn.fileHashPathUpdate(filePath, revMap, op);
          });

          cssFiles.forEach((filePath) => {
            self.fn.fileHashPathUpdate(filePath, revMap, op);
          });
        } else {
          Object.keys(revMap).forEach((iPath) => {
            var filePath = util.joinFormat(config.alias.revRoot, iPath);

            if (fs.existsSync(filePath)) {
              switch (path.extname(filePath)) {
                case '.css':
                  self.fn.fileHashPathUpdate(filePath, revMap, op);
                  break;

                case '.js':
                  self.fn.fileHashPathUpdate(filePath, revMap, op);
                  break;

                default:
                  break;
              }
            }
          });
        }
        next(revMap);
      }).then((revMap, next) => { // hash对应文件生成
        selfFn.buildRevMapDestFiles(revMap);
        next(revMap);
      }).then((revMap) => { // 本地 rev-manifest 更新
        var localRevPath = util.joinFormat(
          config.alias.revDest,
          wOpzer.rev.filename
        );
        var localRevData;
        var revContent = JSON.stringify(revMap, null, 4);

        if (fs.existsSync(localRevPath)) {
          localRevData = fs.readFileSync(localRevPath).toString();

          if (localRevData != revContent) {
            fs.writeFileSync(localRevPath, revContent);
            selfFn.mark.add('update', localRevPath);
          }
        } else {
          util.mkdirSync(config.alias.revDest);
          fs.writeFileSync(localRevPath, revContent);
          selfFn.mark.add('create', localRevPath);
        }

        selfFn.mark.print();
        log('msg', 'success', 'rev-update finished');
        NEXT();
      }).start();
    });
  },
  // rev-clean 入口
  clean: function(config) {
    return new Promise((next, err) => {
      const self = this;
      if (!config) {
        return err('rev-clean run fail, config not exist');
      }

      self.use(config);

      var files = util.readFilesSync(config.alias.root);
      files.forEach((iPath) => {
        if (
          /-[a-zA-Z0-9]{10}\.?\w*\.\w+$/.test(iPath) &&
          fs.existsSync(iPath.replace(/-[a-zA-Z0-9]{10}(\.?\w*\.\w+$)/, '$1'))
        ) {
          try {
            fs.unlinkSync(iPath);
            log('msg', 'del', iPath);
          } catch (er) {
            log('msg', 'warn', `delete file fail: ${iPath}`);
          }
        }
      });
      log('msg', 'success', 'rev-clean finished');
      next();
    });
  }
};

// livereload
wOpzer.livereload = (config, iEnv) => {
  if (!iEnv.silent && iEnv.proxy) {
    const reloadPath = `http://${util.vars.LOCAL_SERVER}:${config.localserver.port}1/changed?files=1`;
    util.get(reloadPath);
  }
  return Promise.resolve();
};


// 更新 packages
wOpzer.initPlugins = (config) => {
  if (!config.plugins || !config.plugins.length) {
    return Promise.resolve();
  }
  const iNodeModulePath = config.resolveModule;

  if (!iNodeModulePath) {
    return new Promise((next, reject) => {
      reject('init plugins fail, config.resolveModule is not set');
    });
  }

  if (!fs.existsSync(iNodeModulePath)) {
    extFs.mkdirSync(iNodeModulePath);
  }
  const installLists = [];

  config.plugins.forEach((str) => {
    let iDir = '';
    let iVer = '';
    const pathArr = str.split(/[\\/]+/);
    let pluginPath = '';
    let pluginName = '';
    if (pathArr.length > 1) {
      pluginName = pathArr.pop();
      pluginPath = pathArr.join('/');
    } else {
      pluginName = pathArr[0];
    }

    if (~pluginName.indexOf('@')) {
      iDir = pluginName.split('@')[0];
      iVer = pluginName.split('@')[1];
    } else {
      iDir = pluginName;
    }
    let iPath = path.join(iNodeModulePath, pluginPath, iDir);
    let iPkgPath = path.join(iPath, 'package.json');
    var iPkg;
    if (fs.existsSync(iPath) && fs.existsSync(iPkgPath)) {
      if (iVer) {
        iPkg = require(iPkgPath);
        if (iPkg.version != iVer) {
          installLists.push(str);
        }
      }
    } else {
      installLists.push(str);
    }
  });

  if (installLists.length) {
    var cmd = `npm install ${installLists.join(' ')} --loglevel http`;
    log('msg', 'info', `run cmd ${cmd}`);
    process.chdir(util.vars.BASE_PATH);

    log('end');
    return new Promise((next, reject) => {
      util.runCMD(cmd, (err) => {
        if (err) {
          return reject(err);
        }

        next();
      }, iNodeModulePath);
    });
  } else {
    return Promise.resolve();
  }
};


// open page
wOpzer.openHomePage = (config, iEnv) => {
  const runner = (next, reject) => {
    extFs.readFilePaths(config.alias.destRoot, /\.html$/, true).then((htmls) => {
      let addr;
      const localServerAddr = `http://${util.vars.LOCAL_SERVER}:${config.localserver.port}`;
      const localServerAddr2 = `http://127.0.0.1:${config.localserver.port}`;
      const iHost = config.commit.hostname.replace(/\/$/, '');

      htmls.sort((a, b) => {
        var aName = path.basename(a);
        var bName = path.basename(b);
        var reg = /^index|default$/;
        var aReg = reg.exec(aName);
        var bReg = reg.exec(bName);

        if (aReg && !bReg) {
          return -1;
        } else if (!aReg && bReg) {
          return 1;
        } else {
          return a.localeCompare(b);
        }
      });

      if (config.proxy && config.proxy.homePage) {
        addr = config.proxy.homePage;
      } else {
        if (iEnv.proxy) {
          let iAddr = '';
          if (config.proxy && config.proxy.localRemote) {
            for (let key in config.proxy.localRemote) {
              iAddr = config.proxy.localRemote[key].replace(/\/$/, '');
              if ((iAddr === localServerAddr || iAddr === localServerAddr2) && key.replace(/\/$/, '') !== iHost) {
                addr = key;
                break;
              }
            }
          }
          if (!addr) {
            addr = config.commit.hostname;
          }
        } else {
          addr = localServerAddr;
        }

        if (htmls.length) {
          addr = util.joinFormat(addr, path.relative(config.alias.destRoot, htmls[0]));
        }
      }

      log('msg', 'success', 'open addr:');
      log('msg', 'success', chalk.cyan(addr));
      util.openBrowser(addr);
      next(addr);
    }).catch((er) => {
      reject(er);
    });
  };

  return new Promise(runner);
};


wOpzer.saveConfigToServer = (config) => {
  if (!config || !config.workflow || !config.name) {
    return Promise.resolve();
  }
  extFs.mkdirSync(util.vars.SERVER_CONFIG_LOG_PATH);
  const filename = `${config.workflow}-${config.name}.js`;
  const serverConfigPath = path.join(util.vars.SERVER_CONFIG_LOG_PATH, filename);
  const printPath = `~/.yyl/${path.relative(util.vars.SERVER_PATH, serverConfigPath)}`;
  fs.writeFileSync(serverConfigPath, JSON.stringify(config, null, 2));
  log('msg', 'success', `config saved ${chalk.yellow(printPath)}`);
  return Promise.resolve();
};

module.exports = wOpzer;

