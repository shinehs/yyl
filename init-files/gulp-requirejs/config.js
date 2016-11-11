'use strict';
var 
    config = {
        src: 'src',
        global: {
            components: '../commons/pc/components',
            lib: '../commons/pc/lib'
        },
        dest: {
            hostname: 'http://yyweb.yystatic.com',
            revAddr: 'http://yyweb.yystatic.com/pc/assets/rev-manifest.json',
            path: {
                'root': '',
                'js': 'js',
                'jsLib': 'js/lib',
                'css': 'css',
                'images': 'images',
                'html': 'html',
                'assets': 'assets'
            },
            concat: {
                './src/js/vendors.js': [
                    '../commons/pc/lib/jQuery/jquery-1.11.1.min.js'
                ],
                './dist/js/vendors.js': [
                    './src/js/vendors.js'
                ]
            }
        },
        git: {
            update: [
                // '{$SRC}/components',
                // '{$SRC}/images',
                // '{$SRC}/js',
                // '{$SRC}/psd',
                // '{$SRC}/sass',
                // '{$SRC}/templates'
            ]
        },
        
        svn: {
            path: {
                dev: '../../../svn.yy.com/yy-music/web/dev/trunk/src/EntLobby/entlobby-web/src/main/webapp',
                trunk: '../../../svn.yy.com/yy-music/web/dev/publish/src/entlobby'
            },

            update: [
                '{$PATH}/static',
                '{$PATH}/WEB-INF/jsp'
            ],
            copy: {
                'dist': [
                    '{$PATH}/static'
                ]
            },
            'commit': [
                '{$PATH}/static/css',
                '{$PATH}/static/js',
                '{$PATH}/static/html',
                '{$PATH}/static/images',
                '{$PATH}/static/assets'
            ],
            onBeforeCommit: function(type){
                // var
                //     iPath = '{$PATH}/yyweb-web/src/main/webapp/WEB-INF/jsp-tmpl/pc/module/refresh.jsp'.replace('{$PATH}', this.path[type]),
                //     fs = require('fs'),
                //     path = require('path'),
                //     addZero = function(num) {
                //         return num < 10 ? '0' + num : num;
                //     },
                //     configFile = path.join(__dirname, iPath),
                //     now = new Date(),
                //     cssjsdate = now.getFullYear() + addZero(now.getMonth() + 1) + addZero(now.getDate()) + addZero(now.getHours()) + addZero(now.getMinutes()) + addZero(now.getSeconds()),
                //     content = fs.readFileSync(configFile).toString().replace(/(\$\{global.put\("cdnVersion",")[^"]+("\)\})/g, '$1' + cssjsdate + '$2');

                // fs.writeFileSync(configFile, content);
            }
        }
    };

module.exports = config;
