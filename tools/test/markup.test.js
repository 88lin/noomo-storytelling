'use strict';
const { test, eq, throws, setFile } = require('./harness');
const { compile, cssLen } = require('../markup');

setFile('markup');

test('markup: plain text wraps in <p> with size + align', () => {
  eq(compile('你好', { size: '50/30', align: 'center' }),
    '<p class="lg:text-sans-50 xs:text-sans-30 text-center">你好</p>');
});

test('markup: single size applies to both breakpoints', () => {
  eq(compile('x', { size: '66' }), '<p class="text-sans-66">x</p>');
});

test('markup: [[...]] emits serif italic matching the block size', () => {
  eq(compile('世界正在[[流动]]', { size: '50/30' }),
    '<p class="lg:text-sans-50 xs:text-sans-30">'
    + '世界正在<i class="lg:text-serif-50 xs:text-serif-30 ns-em ns-em--on-dark">流动</i></p>');
});

test('markup: {em} is the paired form of [[...]]', () => {
  eq(compile('{em}流动{/em}', { size: '66' }),
    '<p class="text-sans-66"><i class="text-serif-66 ns-em ns-em--on-dark">流动</i></p>');
});

test('markup: {sz} changes size and the nested emphasis follows it', () => {
  eq(compile('{sz 38/26}从[[清晰]]开始{/sz}', { size: '26/18' }),
    '<p class="lg:text-sans-26 xs:text-sans-18">'
    + '<span class="lg:text-sans-38 xs:text-sans-26">'
    + '从<i class="lg:text-serif-38 xs:text-serif-26 ns-em ns-em--on-dark">清晰</i>开始</span></p>');
});

test('markup: emphasisTone selects the accent class, null opts out', () => {
  eq(compile('[[x]]', { size: '26', emphasisTone: 'light' }),
    '<p class="text-sans-26"><i class="text-serif-26 ns-em ns-em--on-light">x</i></p>');
  eq(compile('[[x]]', { size: '26', emphasisTone: null }),
    '<p class="text-sans-26"><i class="text-serif-26">x</i></p>');
  throws(() => compile('[[x]]', { emphasisTone: 'blue' }), /emphasisTone must be/);
});

test('markup: family=serif drives the block and {sz} classes', () => {
  eq(compile('{sz 66}A{/sz}', { size: '200/100', family: 'serif' }),
    '<p class="lg:text-serif-200 xs:text-serif-100">'
    + '<span class="text-serif-66">A</span></p>');
  throws(() => compile('x', { family: 'mono' }), /family must be/);
});

test('markup: {em} attributes force size, extra classes and nudges', () => {
  eq(compile('{em sz=38 cls="whitespace-nowrap" lg-x=-2 xs-y=1/4}走进{/em}', { size: '26' }),
    '<p class="text-sans-26"><i class="text-serif-38 ns-em ns-em--on-dark whitespace-nowrap '
    + 'ns-t inline-block" style="--ns-tx-lg:-2px;--ns-ty-xs:25%">走进</i></p>');
  throws(() => compile('{em bold}x{/em}', {}), /takes attributes, not flags/);
  throws(() => compile('{em weight=700}x{/em}', {}), /unknown \{em\} attribute "weight"/);
});

test('markup: backslash at end of line continues the same rendered line', () => {
  eq(compile('一\\\n    {icon bird}\n二', { size: '26' }),
    '<p class="text-sans-26">一<span class="text-icon-bird ic inline-block"></span>'
    + '<br>\n二</p>');
  eq(compile('a\\b', {}), '<p class="">a\\b</p>');
});

test('markup: newline becomes <br> and eats following indent', () => {
  eq(compile('一\n    二', { size: '26' }),
    '<p class="text-sans-26">一<br>\n二</p>');
});

test('markup: trailing newlines are trimmed', () => {
  eq(compile('一\n', { size: '26' }), '<p class="text-sans-26">一</p>');
});

test('markup: {line} builds the decorative rule with width and nudges', () => {
  eq(compile('{line w=600 x=-8% y=-4 half dark}', {}),
    '<p class=""><span class="text-line from-scale half dark ic ns-w ns-t" '
    + 'style="--ns-w-lg:600px;--ns-w-xs:600px;--ns-tx-xs:-8%;--ns-tx-lg:-8%;'
    + '--ns-ty-xs:-4px;--ns-ty-lg:-4px"></span></p>');
});

test('markup: {line} responsive width and per-breakpoint overrides', () => {
  eq(compile('{line w=300/200 x=1/3 xs-x=1/2 xs-y=-5 lg-only}', {}),
    '<p class=""><span class="text-line from-scale xs:!hidden lg:!block ic ns-w ns-t" '
    + 'style="--ns-w-lg:300px;--ns-w-xs:200px;--ns-tx-xs:50%;--ns-tx-lg:33.3333%;'
    + '--ns-ty-xs:-5px"></span></p>');
});

test('markup: {line no-scale} drops from-scale', () => {
  eq(compile('{line w=100 no-scale}', {}),
    '<p class=""><span class="text-line ic ns-w" '
    + 'style="--ns-w-lg:100px;--ns-w-xs:100px"></span></p>');
});

test('markup: {line my=20/10} emits responsive margin', () => {
  eq(compile('{line w=600 my=20/10 dark}', {}),
    '<p class=""><span class="text-line from-scale dark ic ns-w lg:my-20 xs:my-10" '
    + 'style="--ns-w-lg:600px;--ns-w-xs:600px"></span></p>');
});

test('markup: {line} widths and offsets accept any value, not just the bundled ones', () => {
  eq(compile('{line w=418 x=[3vw] no-scale}', {}),
    '<p class=""><span class="text-line ic ns-w ns-t" '
    + 'style="--ns-w-lg:418px;--ns-w-xs:418px;--ns-tx-xs:3vw;--ns-tx-lg:3vw"></span></p>');
});

test('markup: {icon} names map to the bundled decorations', () => {
  eq(compile('{icon bird mb=20}', {}),
    '<p class=""><span class="text-icon-bird ic inline-block mb-20"></span></p>');
  eq(compile('{icon feather block mb=56/20}', {}),
    '<p class=""><span class="text-icon-feather-white ic !block mx-auto '
    + 'lg:mb-56 xs:mb-20"></span></p>');
  eq(compile('{icon bird2 rotate mb=20}', {}),
    '<p class=""><span class="text-icon-bird-2 ic rotate-180 inline-block mb-20"></span></p>');
});

test('markup: {grad} {z} {lg} {xs} {nbsp} {br}', () => {
  eq(compile('{grad}叙事{/grad}{nbsp}{z}A{/z}{lg}桌面{/lg}{xs}手机{/xs}{br}', {}),
    '<p class=""><span class="gradient-text">叙事</span>&nbsp;'
    + '<span class="relative z-2">A</span>'
    + '<span class="xs:hidden lg:inline-block">桌面</span>'
    + '<span class="xs:inline lg:hidden">手机</span><br></p>');
});

test('markup: {g} needs gradientDir and honours it', () => {
  eq(compile('{g}一行{/g}', { gradientDir: 'right' }),
    '<p class=""><span class="lines-text-gradient">一行</span></p>');
  eq(compile('{g}一行{/g}', { gradientDir: 'left' }),
    '<p class=""><span class="lines-text-gradient-left">一行</span></p>');
  throws(() => compile('{g}x{/g}', {}), /gradientDir/, '{g} without dir must fail');
});

test('markup: {span "..."} is the arbitrary-class escape hatch', () => {
  eq(compile('{span "inline-block lg:mr-110 relative z-2"}引导{/span}', {}),
    '<p class=""><span class="inline-block lg:mr-110 relative z-2">引导</span></p>');
});

test('markup: {raw} passes through verbatim', () => {
  eq(compile('{raw}<span class="x">&amp;<b>1</b></span>{/raw}', {}),
    '<p class=""><span class="x">&amp;<b>1</b></span></p>');
});

test('markup: bare < and > are escaped, entities are preserved', () => {
  eq(compile('a < b &amp; c', {}), '<p class="">a &lt; b &amp; c</p>');
});

test('markup: unknown shorthand is a hard error naming the token', () => {
  throws(() => compile('{wobble}', { where: 'story.big[2]' }),
    /story\.big\[2\].*unknown shorthand "\{wobble\}"/,
    'unknown token must name the block');
});

test('markup: unknown {line} flag/attr is a hard error', () => {
  throws(() => compile('{line w=600 sparkle}', {}), /unknown \{line\} flag "sparkle"/);
  throws(() => compile('{line z=3}', {}), /unknown \{line\} attribute "z"/);
});

test('markup: unknown icon is a hard error listing the allowed names', () => {
  throws(() => compile('{icon dragon}', {}), /unknown icon "dragon".*bird, bird2, feather, flower/);
});

test('markup: unbalanced tags are hard errors', () => {
  throws(() => compile('{grad}x', {}), /\{grad\} is never closed/);
  throws(() => compile('x{/grad}', {}), /stray \{\/grad\}/);
  throws(() => compile('{grad}x{/z}', {}), /\{\/z\} closes \{grad\}/);
  throws(() => compile('[[x', {}), /\[\[ is never closed/);
  throws(() => compile('{raw}x', {}), /\{raw\} is never closed/);
});

test('markup: bad size and offset values are rejected', () => {
  throws(() => compile('x', { size: 'big' }), /size must be/);
  throws(() => compile('{line w=wide}', {}), /line width must be/);
  throws(() => compile('{line x=sideways}', {}), /cannot read x offset/);
});

test('markup: cssLen maps the DSL length forms onto CSS', () => {
  eq(cssLen('4', 'x', 'w'), '4px');
  eq(cssLen('-4', 'x', 'w'), '-4px');
  eq(cssLen('8%', 'x', 'w'), '8%');
  eq(cssLen('-1/3', 'x', 'w'), '-33.3333%');
  eq(cssLen('[calc(2px+1%)]', 'x', 'w'), 'calc(2px+1%)');
  throws(() => cssLen('wide', 'x offset', 'blk'), /blk: cannot read x offset "wide"/);
});
