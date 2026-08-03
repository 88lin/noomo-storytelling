'use strict';

const { test, eq, ok, setFile } = require('./harness');
const { parseRequestUrl } = require('../serve');

setFile(__filename);

test('serve: 根路径去掉查询参数', () => {
  eq(parseRequestUrl('/index.html?cache=1', '/'), { status: 200, url: '/index.html' });
});

test('serve: 子路径根与资源正确剥离挂载前缀', () => {
  eq(parseRequestUrl('/story/', '/story/'), { status: 200, url: '/' });
  eq(parseRequestUrl('/story/_nuxt/app.js?x=1', '/story/'), {
    status: 200,
    url: '/_nuxt/app.js',
  });
});

test('serve: 子路径之外的请求返回 404', () => {
  const result = parseRequestUrl('/_nuxt/app.js', '/story/');
  eq(result.status, 404);
  ok(result.outsideBase);
});

test('serve: 非法百分号编码返回 400', () => {
  eq(parseRequestUrl('/bad-%E0%A4%A', '/'), { status: 400, url: '/bad-%E0%A4%A' });
});

test('serve: NUL 字节请求返回 400', () => {
  eq(parseRequestUrl('/index%00.html', '/'), { status: 400, url: '/index\0.html' });
});

module.exports = {};
