# gulp-requirejs workflow

## 命令说明
```
Useage: yyl <command>

Commands:
    watch     打包并建立本地服务器监听文件
    all       打包文件

Options:
    --ver <remote>   线上rev-manifest 版本
                     remote: 版本信息 如直接拉取最新版 输入 'remote'
```

## 工作流简介
本前端工程采用 vue 1.x + vue-router + vuex 技术架构，通过 webpack 进行整合打包， 把 css 部分通过插件抽离成独立样式表， 并会针对输出的文件生成一份 rev-manifest 文件哈希映射表 给后端使用。适用于移动端 单页面应用场景。

## webpack.config 中的 alias 配置
本前端工程才有 webpack 进行 打包， webpack.config.js 中 alias 选项已整合到 config 中同名属性 alias 当中。

详情可见 [with-global-component](../../examples/webpack-vue/with-global-component) demo

## 入口文件 - boot
* 本前端工程 整个项目的 入口文件是 boot/boot.js, 其他页面都是通过 boot.js 中的 vue-router 路由功能 实现切换替代。
* boot/boot.jade 中的代码在进行 webpack 打包时，会被webpack 中的 插件 独立生成为 单独的 boot.html


## 页面 组件 p-xx 开发规范

### 命名规范
项目中的 页面组件 这边定义需要统一放在 components/page/ 目录下，

采用 单词+ 横杠方式命名如 p-liveplayer-toolbar, 组件目录下的 jade, scss, js 文件命名与 文件目录保持一致如:

```
src
|~ components
|  |- page
|  |  |- p-liveplayer-toolbar
|  |  |  |- p-liveplayer-toolbar.js
|  |  |  |- p-liveplayer-toolbar.jade
|  |  |  |- p-liveplayer-toolbar.scss
|  |  |  `+ images
|  |  `- ...
|  `- widget
|- ...
```

### 开发范例
* p-xx.jade 文件开发范例[点击这里](./src/components/page/p-index/p-index.jade)
* p-xx.scss 文件开发范例[点击这里](./src/components/page/p-index/p-index.scss)
* p-xx.js   文件开发范例[点击这里](./src/components/page/p-index/p-index.js)

## 功能 组件 v-xx 开发规范

### 命名规范
项目中的 页面组件 这边定义需要统一放在 components/widget/ 目录下，

采用 单词+ 横杠方式命名如 v-liveplayer-toolbar, 组件目录下的 jade, scss, js 文件命名与 文件目录保持一致如:

```
src
|~ components
|  |- page
|  `- widget
|     |- v-liveplayer-toolbar
|     |  |- v-liveplayer-toolbar.js
|     |  |- v-liveplayer-toolbar.jade
|     |  |- v-liveplayer-toolbar.scss
|     |  `+ images
|     `- ...
|- ...
```


#### 开发范例
* v-xx.jade 文件开发范例[点击这里](./src/components/widget/v-demo/v-demo.jade)
* v-xx.scss 文件开发范例[点击这里](./src/components/widget/v-demo/v-demo.scss)
* v-xx.js   文件开发范例[点击这里](./src/pc/components/widget/v-demo/v-demo.js)