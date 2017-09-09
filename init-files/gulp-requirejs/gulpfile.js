'use strict';
/*!
 * gulpfile.js for yym-FETeam
 *
 * @author: jackness Lau
 */ 


var gulp = require('gulp'),
    fs = require('fs'),
    path = require('path'),
    querystring = require('querystring'),
    util = require('yyl-util'),

    sass = require('gulp-sass'), // sass compiler
    minifycss = require('gulp-minify-css'), // minify css files
    jshint = require('gulp-jshint'), // check js syntac
    uglify = require('gulp-uglify'), // uglify js files
    imagemin = require('gulp-imagemin'), // minify images
    rename = require('gulp-rename'), // rename the files
    concat = require('gulp-concat'), // concat the files into single file
    replacePath = require('gulp-replace-path'), // replace the assets path
    requirejsOptimize = require('gulp-requirejs-optimize'), // requirejs optimizer which can combine all modules into the main js file
    inlinesource = require('gulp-inline-source'), // requirejs optimizer which can combine all modules into the main js file
    filter = require('gulp-filter'), // filter the specified file(s) in file stream
    gulpJade = require('gulp-jade'),
    plumber = require('gulp-plumber'),
    runSequence = require('run-sequence').use(gulp),
    prettify = require('gulp-prettify'),
    rev = require('gulp-rev'),
    override = require('gulp-rev-css-url'),
    clean = require('gulp-clean'),
    through = require('through2'),
    es = require('event-stream'),

    cache = {
        remoteRevData: '',
        localRevData: ''
    },
    TASK_MAP = {
        'js': ['js-task', 'concat', 'rev-update'],
        'html': ['html-task', 'html-task-step02'],
        'css': ['css-component-task', 'css-base-task', 'css-dist', 'concat', 'rev-update'],
        'images': ['images-img', 'images-components', 'rev-update', 'rev-img-update'],
        'rev': ['rev-clean', 'rev-loadRemote', 'rev-build', 'rev-remote-build', 'rev-dataInit', 'rev-replace'],
        'rev-update': ['rev-loadRemote', 'rev-remote-build', 'rev-dataInit', 'rev-replace']
    },
    runQueue = function(){
        var 
            r = util.makeArray(arguments),
            deep = true,
            deepFn = function(){
                deep = false;
                var fr = [];
                r.forEach(function(item){
                    if(typeof item == 'string'){
                        if(TASK_MAP[item] && util.type(TASK_MAP[item]) == 'array'){
                            fr = fr.concat(TASK_MAP[item]);
                            deep = true;
                        } else {
                            fr.push(item);
                        }
                    } else {
                        fr.push(item);
                    }
                });
                r = fr;
            };
        while(deep){
            deepFn();
        }
        util.msg.info('runSequence', r);
        runSequence.apply(runSequence, r);

    };

require('colors');

var 
    config = require('./config.js'),
    localConfig = fs.existsSync('./config.mine.js')? require('./config.mine.js'): {};

config = util.initConfig(util.extend(true, config, localConfig));



var fn = {
    blankPipe: function(){
        return through.obj(function(file, enc, next){next(null, file);});
    },
    relateDest: function(iPath){
        return util.joinFormat( path.relative(gulp.env.vars.destRoot, iPath) );
    },
    taskHelper: function(commands){

        var dirs = [];
        var output;
        if(!config.alias){
            for(var key in config){
                if(config.hasOwnProperty(key)){
                    dirs.push(key);
                }
            }

            output = [
                '',
                '',
                '  Ustage:'.yellow,
                '  yyl '+ commands +' --name <Project>',
                '',
                '  Project:'.yellow,
                (function(){
                    var r = [];
                    dirs.forEach(function(item){
                        r.push('  ' + item.gray);
                    });
                    return r.join('\n');

                }()),
                '',
                ''
            ];
        } else {
            output = [
                '',
                '',
                '  Ustage:'.yellow,
                '  yyl '+ commands +' not work',
                ''
            ];
        }
        console.log(output.join('\n'));
    },

    /**
     * task 执行前初始化函数
     */
    taskInit: function(){
        var 
            commands = process.argv[2],
            iConfig;

        if(gulp.env.ver){
            gulp.env.version = gulp.env.ver;
        }

        if(gulp.env.sub){
            gulp.env.subname = gulp.env.sub;

        }
        if(gulp.env.name){
            iConfig = config[gulp.env.name];

        } else {
            iConfig = config;
        }

        if(!iConfig || !iConfig.alias){
            fn.taskHelper(commands);
            process.exit();
            return;

        } else {
            gulp.env.vars = iConfig.alias;
            gulp.env.remotePath = gulp.env.ver == 'remote' || gulp.env.isCommit? iConfig.commit.hostname: '/';
            return iConfig;
        }

    },
    
};


// + stream event
var 
    streamEvent = {
        jadeToHtml: function(files){
            var 
                iConfig = fn.taskInit(),
                vars = gulp.env.vars,
                taskStream = gulp.src(files)
                    .pipe(plumber())
                    .pipe(filter('**/*.jade'))
                    .pipe(gulpJade({
                        pretty: true,
                        client: false
                    }))
                    .pipe(through.obj(function(file, enc, next){
                        var iCnt = file.contents.toString();
                        var pathReg = /(src|href|data-main|data-original)\s*=\s*(['"])([^'"]*)(["'])/ig;

                        // script 匹配
                        var scriptReg = /(<script[^>]*>)([\w\W]*?)(<\/script\>)/ig;
                        var dirname = util.joinFormat( iConfig.alias.srcRoot, 'html');

                        iCnt = iCnt
                            // 隔离 script 内容
                            .replace(scriptReg, function(str, $1, $2, $3){
                                return $1 + querystring.escape($2) + $3;
                            })
                            .replace(pathReg, function(str, $1, $2, $3, $4){
                                var iPath = $3,
                                    rPath = '';


                                iPath = iPath.replace(/\{\$(\w+)\}/g, function(str, $1){
                                    if(vars[$1]){
                                        
                                        return path.relative( path.dirname(file.path), vars[$1]);
                                    } else {
                                        return str;
                                    }
                                });

                                if(iPath.match(/^(data:image|javascript:|#|http:|https:|\/)/) || !iPath){
                                    return str;
                                }


                                var fDirname = path.dirname(path.relative(dirname, file.path));
                                rPath = util.joinFormat(fDirname, iPath)
                                    .replace(/\\+/g,'/')
                                    .replace(/\/+/, '/')
                                    ;

                                return $1 + '=' + $2 + rPath + $4;
                            })
                            // 取消隔离 script 内容
                            .replace(scriptReg, function(str, $1, $2, $3){
                                return $1 + querystring.unescape($2) + $3;
                            });

                        file.contents = new Buffer(iCnt, 'utf-8');
                        this.push(file);
                        next();
                    }))
                    .pipe(rename(function(path){
                        path.basename = path.basename.replace(/^p-/g,'');
                        path.dirname = '';
                    }))
                    .pipe(prettify({indent_size: 4}))
                    .pipe(gulp.dest(util.joinFormat(vars.srcRoot, 'html')));

            return taskStream;
        },

        htmlToDest: function(files){
            var 
                vars = gulp.env.vars,
                relateHtml = function(iPath){
                    return util.joinFormat(
                        path.relative(
                            path.join(gulp.env.vars.srcRoot, 'html'),
                            iPath
                        )
                    );
                },
                relateDirname = function(iPath){
                    return util.joinFormat(
                        path.relative(
                            path.join(gulp.env.vars.dirname),
                            iPath
                        )
                    );

                },
                remotePath = gulp.env.remotePath;

            return gulp.src(files)
                .pipe(filter('**/*.html'))
                .pipe(plumber())
                .pipe(inlinesource())
                // 删除requirejs的配置文件引用
                .pipe(replacePath(/<script [^<]*local-usage\><\/script>/g, ''))

                // 将用到的 commons 目录下的 images 资源引入到项目里面
                .pipe(through.obj(function(file, enc, next){
                    var iCnt = file.contents.toString();
                    var pathReg = /(url\s*\(['"]?)([^'"]*?)(['"]?\s*\))/ig;
                    var pathReg2 = /(src\s*=\s*['"])([^'" ]*?)(['"])/ig;
                    var gComponentPath = relateHtml(vars.globalcomponents);
                    var copyPath = {};
                    var filterHandle = function(str, $1, $2){
                        var iPath = $2;

                        if(iPath.match(/^(about:|data:)/)){
                            return str;
                        }


                        if(iPath.substr(0, gComponentPath.length) != gComponentPath){
                            return str;
                        }

                        var dirname = iPath.substr(gComponentPath.length);

                        copyPath[util.joinFormat(vars.srcRoot, 'html', iPath)] = util.joinFormat(vars.imagesDest, 'globalcomponents', dirname);

                        return str;

                    };


                    iCnt
                        .replace(pathReg, filterHandle)
                        .replace(pathReg2, filterHandle);

                    this.push(file);

                    // 复制
                    util.msg.info('copy file start', copyPath);
                    util.copyFiles(copyPath, function(){
                        util.msg.success('copy file done');
                        next();
                    });
                }))

                // 替换全局 图片
                .pipe(replacePath(
                    relateHtml(path.join(vars.globalcomponents)),
                    util.joinFormat(remotePath, fn.relateDest(vars.imagesDest), 'globalcomponents')
                ))
                // 替换 common 下 lib
                .pipe(replacePath(
                    relateHtml(path.join(vars.globallib)),
                    util.joinFormat(remotePath, fn.relateDest(vars.jslibDest), 'globallib')
                ))
                // 替换 jslib
                .pipe(replacePath('../js/lib', util.joinFormat(remotePath, fn.relateDest(vars.jslibDest))))
                // 替换 js
                .pipe(replacePath('../js', util.joinFormat(remotePath, fn.relateDest(vars.jsDest))))
                // 替换 components 中的js
                .pipe(replacePath(/\.\.\/components\/p-[a-zA-Z0-9\-]+\/p-([a-zA-Z0-9\-]+).js/g, util.joinFormat( remotePath, fn.relateDest(vars.jsDest), '/$1.js')))


                .pipe(replacePath('../css', util.joinFormat( remotePath, fn.relateDest(vars.cssDest))))

                // 替换公用图片
                .pipe(replacePath('../images', util.joinFormat( remotePath, vars.imagesDest)))
                .pipe(replacePath(/\.\.\/(components\/[pwr]-[a-zA-Z0-9\-]+\/images)/g, util.joinFormat( remotePath, fn.relateDest(vars.imagesDest), '$1')))

                // 把用到的 commons 目录下的 js 引入到 项目的 lib 底下
                .pipe(through.obj(function(file, enc, next){
                    var iCnt = file.contents.toString();

                    iCnt = iCnt
                        .replace(new RegExp('[\'\"]'+ util.joinFormat(remotePath, fn.relateDest(vars.jslibDest), 'globallib') +'([^\'\"]*)[\"\']', 'g'), function(str, $1){
                            var sourcePath = util.joinFormat(vars.globallib, $1);
                            var toPath = util.joinFormat(vars.jslibDest, 'globallib', $1);
                            util.copyFiles(
                                sourcePath,
                                toPath,
                                function(err){
                                    if(!err){
                                        util.msg.create(relateDirname(toPath));
                                    }
                                }
                            );
                            return str;
                        });

                    this.push(file);
                    next();
                }))
                // .pipe(replacePath('../images', + assetsPath.images))
                .pipe(gulp.dest(vars.htmlDest));
        },

        scssToCss: function(files){
            var 
                vars = gulp.env.vars;

            return gulp.src(files)
                .pipe(filter('**/*.scss'))
                .pipe(plumber())
                .pipe(sass({outputStyle: 'nested'}).on('error', sass.logError))
                .pipe(gulp.dest(path.join(vars.srcRoot, 'css')));
        },

        cssToDest: function(files){
            var 
                iConfig = fn.taskInit(),
                vars = gulp.env.vars,
                remotePath = gulp.env.remotePath,
                relateCss = function(iPath){
                    return util.joinFormat(
                        path.relative(
                            path.join(vars.srcRoot, 'css'),
                            iPath
                        )
                    );

                };

            return gulp.src(files)
                .pipe(filter('**/*.css'))
                .pipe(plumber())
                // 将commons components 目录下的 图片 引入到 globalcomponents 里面
                .pipe(through.obj(function(file, enc, next){
                    var iCnt = file.contents.toString();
                    var pathReg = /(url\s*\(['"]?)([^'"]*?)(['"]?\s*\))/ig;
                    var pathReg2 = /(src\s*=\s*['"])([^'" ]*?)(['"])/ig;
                    var gComponentPath = relateCss(vars.globalcomponents);
                    var copyPath = {};

                    var filterHandle = function(str, $1, $2){
                        var iPath = $2;

                        if(iPath.match(/^(about:|data:)/)){
                            return str;
                        }



                        if(iPath.substr(0, gComponentPath.length) != gComponentPath){
                            return str;
                        }

                        iPath = iPath.replace(/\?.*?$/g,'');

                        var dirname = iPath.substr(gComponentPath.length);
                        copyPath[util.joinFormat(vars.srcRoot, 'css', iPath)] = util.joinFormat(vars.imagesDest, 'globalcomponents', dirname);

                        return str;

                    };


                    iCnt
                        .replace(pathReg, filterHandle)
                        .replace(pathReg2, filterHandle);

                    this.push(file);

                    // 复制
                    util.copyFiles(copyPath, function(){
                        util.msg.success('copy file done');
                        next();
                    }, null, null, vars.dirname);
                }))
                // 替换 commons components 里面的 图片
                .pipe(replacePath(
                    relateCss(vars.globalcomponents),
                    util.joinFormat(remotePath, fn.relateDest(path.join(vars.imagesDest, 'globalcomponents')))
                ))

                // 替换图片
                .pipe(replacePath(
                    '../images',
                    util.joinFormat(remotePath, fn.relateDest(vars.imagesDest))
                ))
                // 替换 components 内图片
                .pipe(replacePath(
                    '../components',
                    util.joinFormat( remotePath, fn.relateDest( path.join(vars.imagesDest, 'components')))
                ))
                .pipe(iConfig.isCommit?minifycss({
                    compatibility: 'ie7'
                }): fn.blankPipe())
                
                .pipe(gulp.dest( util.joinFormat(vars.cssDest)));

        },

        componentScssToCss: function(files){
            var iConfig = fn.taskInit();
            if(!iConfig){
                return;
            }
            
            var vars = gulp.env.vars;
            
            return gulp.src( files, {base: path.join(vars.srcRoot)})
                .pipe(sass({outputStyle: 'nested'}).on('error', sass.logError))
                .pipe(through.obj(function(file, enc, next){
                    var iCnt = file.contents.toString();
                    var pathReg = /(url\s*\(['"]?)([^'"]*?)(['"]?\s*\))/ig;
                    var pathReg2 = /(src\s*=\s*['"])([^'" ]*?)(['"])/ig;
                    var dirname = util.joinFormat(vars.srcRoot, 'css');

                    var replaceHandle = function(str, $1, $2, $3){
                        var iPath = $2,
                            rPath = '';

                        if(iPath.match(/^(about:|data:)/)){
                            return str;
                        }

                        var fDirname = path.dirname(path.relative(dirname, file.path));
                        rPath = path.join(fDirname, iPath)
                            .replace(/\\+/g,'/')
                            .replace(/\/+/, '/')
                            ;

                        if(fs.existsSync(util.joinFormat(dirname, rPath).replace(/\?.*?$/g,''))){
                            return $1 + rPath + $3;

                        } else {

                            util.msg.warn('css url replace error', 'path not found:', rPath);
                            return str;
                        }

                    };


                    iCnt = iCnt
                        .replace(pathReg, replaceHandle)
                        .replace(pathReg2, replaceHandle);

                    file.contents = new Buffer(iCnt, 'utf-8');
                    this.push(file);
                    next();
                }))
                .pipe(rename(function(path){

                    path.dirname = '';
                    path.basename = path.basename.replace(/^p-/,'');
                }))
                .pipe(gulp.dest(path.join(vars.srcRoot, 'css')));
        },

        concatToDest: function(concatMap){
            var 
                events = [],
                concatIt = function(dist, list){
                    var iSrcs = [],
                        iDirname = path.dirname(dist),
                        iName = path.basename(dist);

                    list.forEach(function(src){
                        if(!fs.existsSync(src)){
                            util.msg.warn('concat src is not exist:', src);
                            return;
                        }
                        iSrcs.push(util.joinFormat(src));
                    });
                    util.msg.info('concat target:', dist);
                    util.msg.info('concat list:', iSrcs);


                    var iStream = gulp.src(iSrcs, {basePath: iDirname})
                        .pipe(concat(iName))
                        .pipe(gulp.dest(iDirname));

                    return iStream;

                };

            for(var key in concatMap){
                if(concatMap.hasOwnProperty(key)){
                    events.push(concatIt(key, concatMap[key]));
                }
            }

            return es.concat.apply(es, events);


        },

        requirejsToDest: function(files){
            var iConfig = fn.taskInit();
            if(!iConfig){
                return;
            }
            
            var vars = gulp.env.vars;
            return gulp.src(files)
                .filter('**/*.js')
                .pipe(plumber())
                .pipe(jshint.reporter('default'))
                .pipe(jshint())
                /* 合并主文件中通过 requirejs 引入的模块 [start] */
                .pipe(requirejsOptimize({
                    optimize: 'none',
                    mainConfigFile: util.joinFormat(vars.srcRoot, 'js/rConfig/rConfig.js')
                }))
                .pipe(iConfig.isCommit?uglify(): fn.blankPipe())
                .pipe(rename(function(path){
                    path.basename = path.basename.replace(/^[pj]-/g,'');
                    path.dirname = '';
                }))
                .pipe(gulp.dest(util.joinFormat(vars.jsDest)));

        },
        jslibToDest: function(files){
            var iConfig = fn.taskInit();
            if(!iConfig){
                return;
            }
            
            var vars = gulp.env.vars;
            return gulp.src(files)
                .pipe(plumber())
                .filter('**/*.js')
                .pipe(iConfig.isCommit?uglify():fn.blankPipe())
                .pipe(gulp.dest( vars.jslibDest ));
        },
        jsDataToDest: function(files){
            var iConfig = fn.taskInit();
            if(!iConfig){
                return;
            }
            
            var vars = gulp.env.vars;
            return gulp.src(files)
                .filter('**/*.json')
                .pipe(plumber())
                .pipe(iConfig.isCommit?uglify():fn.blankPipe())
                .pipe(gulp.dest( vars.jsDest ));
        },
        imageToDest: function(files){
        var iConfig = fn.taskInit();
        if(!iConfig){
            return;
        }
        var vars = gulp.env.vars;

        return gulp.src( files, {base: util.joinFormat( vars.srcRoot, 'images')})
            .pipe(filter(['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.bmp', '**/*.gif']))
            .pipe(iConfig.isCommit?imagemin({ optimizationLevel: 3, progressive: true, interlaced: true }): fn.blankPipe())
            .pipe(gulp.dest(util.joinFormat(vars.imagesDest)));

        },
        componentImageToDest: function(files){
            var iConfig = fn.taskInit();
            if(!iConfig){
                return;
            }

            var 
                vars = gulp.env.vars;

            return gulp.src( files, {
                    base: util.joinFormat( vars.srcRoot, 'components')
                })
                .pipe(filter(['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.bmp', '**/*.gif']))
                .pipe(plumber())
                .pipe(iConfig.isCommit?imagemin({ optimizationLevel: 3, progressive: true, interlaced: true }): fn.blankPipe())
                .pipe(gulp.dest( util.joinFormat( vars.imagesDest, 'components')));

        },
        resource: function(fileMap){
            var streams = [],
                i = 0;

            for(var key in fileMap){
                if(fileMap.hasOwnProperty(key) && fs.existsSync(key)){
                    streams[i++] = gulp.src(path.join(key, '**/*.*')).pipe(gulp.dest(fileMap[key]));
                }
            }

            return streams.length? es.concat.apply(es, streams): null;

        }

    };
// - stream event

// + html task
gulp.task('html', function(done){
    gulp.env.nowTask = 'html';
    runQueue('jadeToHtml', 'htmlToDest', done);

});

gulp.task('jadeToHtml', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    return streamEvent.jadeToHtml(util.joinFormat(iConfig.alias.srcRoot, 'components/@(p-)*/*.jade'));
});

gulp.task('htmlToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    return streamEvent.htmlToDest(util.joinFormat(iConfig.alias.srcRoot, 'html/*.html'));

});
// - html task
// + css task
gulp.task('css', function(done){
    gulp.env.nowTask = 'html';
    runQueue('componentScssToCss','scssToCss', 'cssToDest', 'cssConcatToDest', 'rev-update', done);
});

gulp.task('componentScssToCss', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    return streamEvent.componentScssToCss(path.join(iConfig.alias.srcRoot,'components/@(p-)*/*.scss'));
});

gulp.task('scssToCss', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    return streamEvent.scssToCss([
        util.joinFormat(iConfig.alias.srcRoot, 'sass/**/*.scss'),
        '!' + util.joinFormat(iConfig.alias.srcRoot, 'sass/base/**/*.*')
    ]);

});
gulp.task('cssToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    return streamEvent.cssToDest(path.join(iConfig.alias.srcRoot, 'css', '**/*.css'));

});

gulp.task('cssConcatToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    if(!iConfig.concat){
        return;
    } else {
        var iMap = {};
        for(var key in iConfig.concat){
            if(iConfig.concat.hasOwnProperty(key)){
                if(path.extname(key) == '.css'){
                    iMap[key] = iConfig.concat[key];
                }
            }
        }

        return streamEvent.concatToDest(iMap);
    }

});
// - css task
// + js task
gulp.task('js', function(done){
    gulp.env.nowTask = 'js';
    runQueue('requirejsToDest', 'jslibToDest', 'jsDataToDest', 'jsConcatToDest', 'rev-update', done);
});

gulp.task('requirejsToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    // TODO

});
gulp.task('jslibToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    return streamEvent.jslibToDest(util.joinFormat(iConfig.alias.srcRoot, 'js/lib/**/*.js'));

});
gulp.task('jsDataToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    return streamEvent.jsDataToDest(util.joinFormat(iConfig.alias.srcRoot, 'js/**/*.json'));

});
gulp.task('jsConcatToDest', function(){
    var 
        iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    if(!iConfig.concat){
        return;
    } else {
        var iMap = {};
        for(var key in iConfig.concat){
            if(iConfig.concat.hasOwnProperty(key)){
                if(path.extname(key) == '.js'){
                    iMap[key] = iConfig.concat[key];
                }
            }
        }

        return streamEvent.concatToDest(iMap);
    }

});
// - js task
// + images task
gulp.task('images', ['imageToDest', 'componentImageToDest'], function(done){
    gulp.env.nowTask = 'images';
    runQueue('rev-update', 'rev-img-update', done);
});
gulp.task('imageToDest', function(){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return;
    }
    return streamEvent.imageToDest(util.joinFormat( iConfig.alias.srcRoot, 'images/**/*.*'));

});

gulp.task('componentImageToDest', function(){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return;
    }
    return streamEvent.componentImageToDest(util.joinFormat( iConfig.alias.srcRoot, 'components/**/*.*'));

});
// - images task
// + resource 自定义资源目录
gulp.task('resource', function(){
    var iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }

    if(iConfig.resource){
        streamEvent.resource(iConfig.resource);
        var streams = [],
            i = 0;

        for(var key in iConfig.resource){
            if(iConfig.resource.hasOwnProperty(key) && fs.existsSync(key)){
                streams[i++] = gulp.src(path.join(key, '**/*.*')).pipe(gulp.dest(iConfig.resource[key]));
            }
        }

        return streams.length? es.concat.apply(es, streams): null;
    }

});
// - resource 自定义资源目录
// + rev task
gulp.task('rev', function(done){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return done();
    }
    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev task not run');
        return done();
    }
    runQueue('rev-clean', 'rev-loadRemote', 'rev-build', 'rev-remote-build', 'rev-dataInit', 'rev-replace', done);
});

gulp.task('rev-clean', function(){
    var 
        iConfig = fn.taskInit(),
        md5Filter = filter(function(file){
            return /-[a-zA-Z0-9]{10}\.?\w*\.\w+$/.test(file.history) && 
                fs.existsSync((file.history + '').replace(/-[a-zA-Z0-9]{10}(\.?\w*\.\w+$)/, '$1'));

        }, {restore: true}),
        vars = gulp.env.vars;

    if(!iConfig){
        return;
    }
     
    return gulp.src( util.joinFormat( vars.root, '**/*.*'), { base: util.joinFormat(vars.destRoot) })
            .pipe(plumber())
            .pipe(md5Filter)
            .pipe(clean({force: true}));
});

gulp.task('rev-loadRemote', function(done){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return;
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-loadRemote task not run');
        return done();
    }

    var
        iVer = gulp.env.version,
        revAddr;

    if(!iVer){
        util.msg.info('rev-loadRemote finish, no version');
        return done();

    } else if(!iConfig.dest.revAddr){
        util.msg.info('rev-loadRemote finish, no config.commit.revAddr');
        return done();

    } else {
        if(iVer == 'remote'){
            revAddr = iConfig.commit.revAddr + '?' + (+new Date());

        } else {
            revAddr = iConfig.commit.revAddr.split('.json').join('-' + iVer + '.json');
        }

        fn.get(revAddr, function(data){
            try{
                cache.remoteRevData = JSON.parse(data);

            } catch(er){
                util.msg.warn('rev get fail');
            }

            done();
        });
    }
});

gulp.task('rev-build', function(){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return;
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-build task not run');
        return;
    }

    var 
        vars = gulp.env.vars;

    gulp.env.cssjsdate = util.makeCssJsDate();

    return gulp.src([
                util.joinFormat( vars.root, '**/*.*'), 
                '!' + util.joinFormat(vars.root, '**/*.html'), 
                '!' + util.joinFormat(vars.root, '**/assets/**/*.*')
            ], { 
                base: vars.revRoot
            })
            .pipe(rev())
            .pipe(override())
            .pipe(gulp.dest(vars.root))
            .pipe(rev.manifest())
            .pipe(through.obj(function(file, enc, next){
                var iCnt = file.contents.toString();
                try{
                    var 
                        iJson = JSON.parse(iCnt);
                    iJson.version = gulp.env.cssjsdate;
                    iCnt = JSON.stringify(iJson, null, 4);
                } catch(er){}

                file.contents = new Buffer(iCnt, 'utf-8');
                this.push(file);
                next();
            }))
            .pipe(gulp.dest(vars.revDest))
            .pipe(rename({suffix: '-' + gulp.env.cssjsdate}))
            .pipe(gulp.dest(vars.revDest));
});

gulp.task('rev-remote-build', function(){
    var 
        iConfig = fn.taskInit(),
        vars = gulp.env.vars,
        md5Filter = filter(function(file){
            return !/-[a-zA-Z0-9]{10}\.?\w*\.\w+/.test(file.history);

        }, {restore: true});

    if(!iConfig ||!cache.remoteRevData){
        util.msg.info('rev-remote-build done, no remoteRevData');
        return;
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-remote-build task not run');
        return;
    }
    
    return gulp.src([
                util.joinFormat( vars.root, '**/*.*'), 
                '!' + util.joinFormat(vars.root, '**/*.html'), 
                '!' + util.joinFormat(vars.root, '**/assets/**/*.*')
            ], { 
                base: vars.destRoot
            })
            .pipe(md5Filter)
            .pipe(
                through.obj(function(file, enc, next){
                    if(cache.remoteRevData){
                        var iPath = cache.remoteRevData[util.joinFormat(path.relative( vars.destRoot, file.path)) ];

                        if(iPath){
                            file.path = util.joinFormat( vars.destRoot, iPath) ;
                        }
                        this.push(file);

                    }

                    next();
                })
             )
            .pipe(gulp.dest(vars.destRoot));
            
});

gulp.task('rev-dataInit', function(done){
    var 
        iConfig = fn.taskInit(),
        vars = gulp.env.vars,
        revPath = util.joinFormat( vars.revDest, 'rev-manifest.json');

    if(!iConfig || !fs.existsSync(revPath)){
        return done();
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-dataInit task not run');
        return done();
    }

    cache.localRevData = util.requireJs(revPath);
    if(cache.remoteRevData){
        cache.localRevData = util.extend(cache.localRevData, cache.remoteRevData);
    }

    done();

});

gulp.task('rev-replace', function(){
    var 
        iConfig = fn.taskInit(),
        vars = gulp.env.vars;

    if(!iConfig || !cache.localRevData){
        return;
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-replace task not run');
        return;
    }

    return gulp.src( util.joinFormat( vars.root, '**/*.+(html|js|css)'), { base: vars.destRoot })
            .pipe(plumber())
            .pipe(through.obj(function(file, enc, next){
                var iCnt = file.contents.toString();

                for(var key in cache.localRevData){
                    if(cache.localRevData.hasOwnProperty(key) && key != 'version'){
                        iCnt = iCnt.replace(new RegExp(key, 'g'), cache.localRevData[key]);
                    }
                }


                file.contents = new Buffer(iCnt, 'utf-8');
                this.push(file);
                next();
            }))
            .pipe(gulp.dest(vars.destRoot))
            .pipe(rev.manifest())
            .pipe(through.obj(function(file, enc, next){
                var iCnt = file.contents.toString();
                try{
                    var 
                        iJson = JSON.parse(iCnt);
                    iJson.version = gulp.env.cssjsdate;
                    iCnt = JSON.stringify(iJson, null, 4);
                } catch(er){}

                file.contents = new Buffer(iCnt, 'utf-8');
                this.push(file);
                next();
            }))
            .pipe(gulp.dest(vars.revDest))
            ;

});

gulp.task('rev-update', function(done){
    var 
        iConfig = fn.taskInit();

    if(!iConfig){
        return done();
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-update task not run');
        return done();
    }

    if(gulp.env.runAll){
        done();
    } else {
        runQueue('rev-loadRemote', 'rev-remote-build', 'rev-dataInit', 'rev-replace', done);
    }
});

gulp.task('rev-img-update', function(){
    var 
        iConfig = fn.taskInit(),
        vars = gulp.env.vars;

    if(!iConfig || !cache.localRevData){
        return;
    }

    if(!iConfig.commit.revAddr){
        util.msg.warn('config.commit.revAddr not set, rev-img-update task not run');
        return;
    }

    return gulp.src( util.joinFormat( vars.imagesDest, '**/*.+(jpg|png|bmp|gif|jpeg)'), { base: vars.revRoot })
            .pipe(plumber())
            .pipe(rename(function(p){
                var iPath = util.joinFormat(p.dirname, p.basename + p.extname);

                if(cache.localRevData && cache.localRevData[iPath]){
                    p.basename = path.basename(cache.localRevData[iPath]).replace(p.extname, '');
                }
            }))
            .pipe(gulp.dest(vars.revRoot));
});

// - rev task



// + all task
gulp.task('all', function(done){
    var iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    var vars = gulp.env.vars;

    gulp.env.runAll = true;
    util.msg.info('start clear dist file');

    util.removeFiles(vars.destRoot, function(){
        util.msg.info('clear dist file done');
        runQueue(['js', 'css', 'images', 'html', 'resource'], 'rev', 'all-done', function(){
            if(!gulp.env.silent){
                util.pop('all task done');
            }
            done();
        });
    });
});

gulp.task('all-done', function(){
    gulp.env.runAll = false;
});

gulp.task('watchAll', ['watch']);

// - all task

gulp.task('connect-reload', function(){
    return util.livereload();
});


// + watch task
gulp.task('watch', ['all'], function() {
    var iConfig = fn.taskInit();
    if(!iConfig){
        return;
    }
    var vars = gulp.env.vars;

    // TODO

});
// - watch task
