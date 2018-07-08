'use strict';
const fs = require('fs');
const path = require('path');
const util = require('./w-util.js');
const log = require('./w-log.js');

var REG = {
  IS_VERSION: /^\d+\.\d+\.\d+$/,
  PACKAGE: /package\.json$/,
  PACKAGE_LOCK: /package-lock\.json$/,
  NODE_MODULES: /node_modules/
};

var INTERFACE = {
  NPM_DOWNLOAD: 'https://registry.npmjs.org/{$name}/-/{$name}-{$version}.tgz',
  NPM_INSTALL: 'npm install {$name}@{$version}',
  VERSION: '~{$version}'
};

var GIT_PATH = 'https://github.com/jackness1208/yyl.git';
var fn = {
  printIt: function(iPath) {
    return path.relative(util.vars.BASE_PATH, iPath);
  },
  render: function(src, obj) {
    if (src && obj) {
      return src.replace(/\{\$(\w+)\}/g, (str, $1) => {
        if (obj[$1]) {
          return obj[$1];
        } else {
          return '';
        }
      });
    } else {
      return src;
    }
  }
};

var
  update = {
    help: function() {
      util.help({
        usage: 'yyl update <package> <version>',
        options: {
          'package': 'package name in yyl',
          'version': 'package version in yyl'
        }
      });
      return Promise.resolve(null);
    },
    package: function(name, version) {
      if (!name || !version) {
        return update.help();
      }

      log('clear');
      log('start', 'update', `update ${name} start...`);

      if (!version.match(REG.IS_VERSION)) {
        log('msg', 'error', `version is not meet the rules: ${version}`);
        log('finish');
        return Promise.resolve();
      }

      var packages = [];
      var packageLocks = [];
      var count = 0;

      util.readFilesSync(util.vars.BASE_PATH, (iPath) => {
        var relativePath = util.joinFormat( path.relative(util.vars.BASE_PATH, iPath) );
        if (relativePath.match(REG.NODE_MODULES)) {
          return;
        } else if (relativePath.match(REG.PACKAGE)) {
          packages.push(iPath);
        } else if (relativePath.match(REG.PACKAGE_LOCK)) {
          packageLocks.push(iPath);
        }
      }, /node_modules/);

      packages.forEach((iPath) => {
        if (!fs.existsSync(iPath)) {
          return;
        }

        var pkg = util.requireJs(iPath);
        var isUpdate = false;

        if (!pkg) {
          return;
        }

        if (pkg.dependencies) {
          Object.keys(pkg.dependencies).some((key) => {
            if (key == name) {
              var r = fn.render(INTERFACE.VERSION, { 'version': version });
              if (pkg.dependencies[key] != r) {
                pkg.dependencies[key] = r;
                isUpdate = true;
              }
              return true;
            }
          });
        }

        if (pkg.devDependencies) {
          Object.keys(pkg.devDependencies).some((key) => {
            if (key == name) {
              var r = fn.render(INTERFACE.VERSION, { 'version': version });
              if (pkg.devDependencies[key] != r) {
                pkg.devDependencies[key] = r;
                isUpdate = true;
                return true;
              }
            }
          });
        }

        if (isUpdate) {
          fs.writeFileSync(iPath, JSON.stringify(pkg, null, 2));
          log('msg', 'update', iPath);
          count++;
        }
      });

      packageLocks.forEach((iPath) => {
        if (!fs.existsSync(iPath)) {
          return;
        }

        var pkg = util.requireJs(iPath);
        var isUpdate = false;

        if (!pkg) {
          return;
        }

        if (pkg.dependencies) {
          Object.keys(pkg.dependencies).some((key) => {
            if (key == name) {
              if (pkg.dependencies[key].version != version) {
                pkg.dependencies[key].version = version;
                isUpdate = true;
              }

              var r = fn.render(INTERFACE.NPM_DOWNLOAD, {
                'name': key,
                'version': version
              });

              if (pkg.dependencies[key].resolved != r) {
                pkg.dependencies[key].resolved = r;
                isUpdate = true;
              }
              return true;
            }
          });
        }

        if (pkg.devDependencies) {
          Object.keys(pkg.devDependencies).some((key) => {
            if (key == name) {
              if (pkg.devDependencies[key].version != version) {
                pkg.devDependencies[key].version = version;
                isUpdate = true;
              }

              var r = fn.render(INTERFACE.NPM_DOWNLOAD, {
                'name': key,
                'versioin': version
              });
              if (pkg.devDependencies[key].resolved != r) {
                pkg.devDependencies[key].resolved = r;
                isUpdate = true;
              }
              return true;
            }
          });
        }

        if (isUpdate) {
          fs.writeFileSync(iPath, JSON.stringify(pkg, null, 2));
          log('msg', 'update', iPath);
          count++;
        }
      });

      log('msg', 'info', 'update finished');
      log('msg', 'success', `updated ${count} files`);
      log('msg', 'warn', [
        'please input the following cmd by yourself:',
        fn.render(INTERFACE.NPM_INSTALL, { 'name': name, 'version': version })
      ].join('\n'));
      log('finish');
      return Promise.resolve(count);
    },
    yyl: function(version) {
      var UPDATE_ERR_MSG = 'udpate error, please run "npm i yyl -g" manual';
      const runner = (done) => {
        new util.Promise(((NEXT) => {
          // 如果有 git 就直接 git 命令更新
          if (fs.existsSync(util.path.join(util.vars.SERVER_UPDATE_PATH, '.git'))) {
            var iCmd = 'git checkout master & git pull';
            if (version) {
              iCmd = `git checkout ${version} & git pull`;
            }
            log('clear');
            log('start', 'update', 'update start...');
            log('end');
            util.runCMD(iCmd, (err) => {
              if (err) { // 出错则需要清空后重试
                util.removeFiles(util.vars.SERVER_UPDATE_PATH, () => {
                  update.yyl(version);
                });
              } else {
                NEXT();
              }
            }, util.vars.SERVER_UPDATE_PATH);
          } else { // 否则就 用 git clone
            new util.Promise(((next) => {
              if (fs.existsSync(util.vars.SERVER_UPDATE_PATH)) { // 先清空目录
                util.removeFiles(util.vars.SERVER_UPDATE_PATH, () => {
                  next();
                });
              } else {
                util.mkdirSync(util.vars.SERVER_UPDATE_PATH);
                next();
              }
            })).then(() => { // 执行 git clone
              var iCmd = `git clone ${GIT_PATH} ${util.vars.SERVER_UPDATE_PATH}`;
              if (version) {
                iCmd = `git clone -b ${version} ${GIT_PATH} ${util.vars.SERVER_UPDATE_PATH}`;
              }

              log('end');
              util.runCMD(iCmd, (err) => {
                if (err) {
                  if (version) {
                    log('msg', 'error', `version is not exist: ${version}`);
                    log('finish');
                    process.exit(1);
                  } else {
                    log('msg', 'warn', UPDATE_ERR_MSG);
                    log('finish');
                    process.exit(1);
                  }
                } else {
                  NEXT();
                }
              }, util.vars.SERVER_UPDATE_PATH);
            }).start();
          }
        })).then((next) => { // package 校验
          var updatePackagePath = util.path.join(util.vars.SERVER_UPDATE_PATH, 'package.json');
          var basePackagePath = util.path.join(util.vars.BASE_PATH, 'package.json');
          let errMsg;

          if (!fs.existsSync(updatePackagePath)) {
            errMsg = `path is not exists ${updatePackagePath}, ${UPDATE_ERR_MSG}`;
            log('msg', 'error', errMsg);
            log('finish');
            process.exit(1);
          } else if (!fs.existsSync(basePackagePath)) {
            errMsg = `path is not exists ${basePackagePath}, ${UPDATE_ERR_MSG}`;
            log('msg', 'error', errMsg);
            log('finish');
            process.exit(1);
          }

          var updatePackage = util.requireJs(updatePackagePath);
          var basePackage = util.requireJs(basePackagePath);
          var isNotMatch = false;

          if (basePackage.version === updatePackage.version) {
            errMsg = `yyl already the latest: ${updatePackage.version}`;
            log('msg', 'warn', errMsg);
            log('finish');
            process.exit(1);
          } else {
            Object.keys(updatePackage.dependencies).forEach((key) => {
              if (updatePackage.dependencies[key] != basePackage.dependencies[key]) {
                isNotMatch = `dependencies ${key}`;
                return true;
              }
            });

            Object.keys(updatePackage.devDependencies).forEach((key) => {
              if (updatePackage.devDependencies[key] !=
                              basePackage.devDependencies[key]) {
                isNotMatch = `devDependencies ${key}`;
                return true;
              }
            });

            if (isNotMatch) {
              errMsg = `the latest yyl package ${isNotMatch} changed,\n please run "npm i yyl -g" manual`;
              log('msg', 'warn', errMsg);
              log('finish');
              process.exit(1);
            } else {
              next();
            }
          }
        }).then((next) => { // copy files
          var updatePath = util.vars.SERVER_UPDATE_PATH;
          let errMsg;

          if (!fs.existsSync(updatePath)) {
            errMsg = `path is not exists: ${updatePath}, ${UPDATE_ERR_MSG}`;
            log('msg', 'error', errMsg);
            log('finish');
            process.exit(1);
          }

          util.copyFiles(updatePath, util.vars.BASE_PATH, (err) => {
            if (err) {
              log('msg', 'warn', UPDATE_ERR_MSG);
              log('finish');
              process.exit(1);
            } else {
              next();
            }
          }, (iPath) => { // 除去 根目录的 package.json 和 .git, .gitignore
            if (util.path.join(iPath) == util.path.join(updatePath, 'package.json') || /(\.git$|\.gitignore$|\.git[/\\])/.test(iPath)) {
              return false;
            } else {
              return true;
            }
          }, null);
        }).then((next) => { // 单独 update .npmignore
          var cp = {};
          util.readFilesSync(util.vars.SERVER_UPDATE_PATH, /\.gitignore/).forEach((iPath) => {
            var targetPath = util.path.join(
              util.vars.BASE_PATH,
              util.path.relative(util.vars.SERVER_UPDATE_PATH, iPath)
            );

            targetPath = targetPath.replace(/\.gitignore$/, '.npmignore');
            cp[iPath] = targetPath;
          });

          util.copyFiles(cp, (err) => {
            if (err) {
              log('msg', 'error', err);
              log('finish');
              process.exit(1);
            } else {
              next();
            }
          });
        }).then(() => {
          log('msg', 'success', 'yyl update finished');
          log('finish');
          done();
        }).start();
      };
      return new Promise((next) => {
        runner(next);
      });
    },
    run: function(argv) {
      const ctx = argv[0];
      const version = argv[1];
      if (ctx) {
        if (ctx.match(REG.IS_VERSION)) { // 正常组件升级
          return update.yyl(ctx);
        } else if (version) { // package 更新 开发用功能
          return update.package(ctx, version);
        } else {
          return update.help();
        }
      } else {
        return update.yyl();
      }
    }
  };

module.exports = update;





