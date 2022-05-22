# Filed Play：简介
## <a name="index"></a> 目录
- [引子](#start)
- [核心思想](#core)
- [顶点着色器](#vertex)
- [片元着色器](#fragment)
- [绘制](#draw)
- [参考资料](#reference)

## <a name="start"></a> 引子
基于[简介][url-2]说明，了解了 [Runge-Kutta][url-3] ，接着去看了 WebGL 绘制的相关主要逻辑，在此记录分析。

- 源码版本：1.0.0

## <a name="core"></a> 核心思想
[简介][url-2]里面说了实现的核心原理，在源码中的体现就是下面一部分代码：
```js
// 源库路径 src/lib/scene.js
import createScreenProgram from './programs/screenProgram';
import createDrawParticlesProgram from './programs/drawParticlesProgram';

// 代码省略

var currentCapturer = null;

// 代码省略

// screen rendering;
var screenProgram = createScreenProgram(ctx);
var drawProgram = createDrawParticlesProgram(ctx);

// 代码省略

function nextFrame() {
  if (lastAnimationFrame) return;

  if (isPaused) return;

  lastAnimationFrame = requestAnimationFrame(draw);
}

// 代码省略

function drawScreen() {
  screenProgram.fadeOutLastFrame()
  drawProgram.drawParticles();
  screenProgram.renderCurrentScreen();
  drawProgram.updateParticlesPositions();
}

// 代码省略

function draw() {
  lastAnimationFrame = 0;

  drawScreen();

  if (currentCapturer) currentCapturer.capture(gl.canvas);

  nextFrame();
}
```
基于这段主要的逻辑，接下来深入看看 `screenProgram` 的实现。

```js
// 源库路径 src/lib/programs/screenProgram.js
export default function makeScreenProgram(ctx) {
  var {gl, canvasRect} = ctx;

  // 代码省略

  updateScreenTextures();
  var screenProgram = glUtils.createProgram(gl, getScreenVertexShader(), getScreenFragmentShader());

  var api = {
    fadeOutLastFrame,
    renderCurrentScreen,
    updateScreenTextures,
    boundingBoxUpdated: false
  };

  return api;

  // 代码省略
}
```

## <a name="vertex"></a> 顶点着色器
```js
// 源库路径 src/lib/programs/screenProgram.js
const NO_TRANSFORM = {dx: 0, dy: 0, scale: 1};

function getScreenVertexShader() {
  return `// screen program
    precision highp float;

    attribute vec2 a_pos;
    varying vec2 v_tex_pos;
    uniform vec3 u_transform;

    void main() {
        v_tex_pos = a_pos;
        vec2 pos = a_pos;

        // This transformation tries to move texture (raster) to the approximate position
        // of particles on the current frame. This is needed to avoid rendering artifacts
        // during pan/zoom: https://computergraphics.stackexchange.com/questions/5754/fading-particles-and-transition

        // PS: I must admit, I wrote this formula through sweat and tears, and
        // I still have no idea why I don't need to apply (pos.y - 0.5) to Y coordinate.
        // Is it because I use aspect ratio for bounding box?
        pos.x = (pos.x - 0.5) / u_transform.z - u_transform.x + 0.5 * u_transform.z;
        pos.y = pos.y / u_transform.z + u_transform.y;

        pos = 1.0 - 2.0 * pos;
        gl_Position = vec4(pos, 0, 1);
    }`
}

function drawTexture(texture, opacity, textureTransform) {
  var program = screenProgram;
  gl.useProgram(program.program);
  glUtils.bindAttribute(gl, ctx.quadBuffer, program.a_pos, 2);
  // 代码省略
  gl.uniform3f(program.u_transform, textureTransform.dx, textureTransform.dy, textureTransform.scale);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

drawTexture(screenTexture, 1.0, NO_TRANSFORM);

// 源库路径 src/lib/scene.js
var ctx = {
  // This is used only to render full-screen rectangle. Main magic happens inside textures.
  quadBuffer: util.createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])),
  // 代码省略
}

```
从这些分散的逻辑中，找到着色器中变量对应的实际值：
- `a_pos`：渲染的整个矩形区域顶点 `quadBuffer` 。
- `v_tex_pos`：会在片元着色器中用到，值实际上也是 `quadBuffer` 。
- `u_transform`：对应平移和缩放的值，默认是 `NO_TRANSFORM` 。

结合源码中的注释可以知道，这个主要是为了绘制整个可见的矩形区域，针对平移和缩放做了一些处理。至于为什么使用这个转换计算方法，注释中也给出了[说明链接][url-4]。


## <a name="fragment"></a> 片元着色器
```js
// 源库路径 src/lib/programs/screenProgram.js
function getScreenFragmentShader() {
  return `precision highp float;
    uniform sampler2D u_screen;
    uniform float u_opacity;
    uniform float u_opacity_border;

    varying vec2 v_tex_pos;

    void main() {
      vec2 p = 1.0 - v_tex_pos;
      vec4 color = texture2D(u_screen, p);

      // For some reason particles near border leave trace when we translate the texture
      // This is my dirty hack to fix it: https://computergraphics.stackexchange.com/questions/5754/fading-particles-and-transition
      if (p.x < u_opacity_border || p.x > 1. - u_opacity_border || p.y < u_opacity_border || p.y > 1. - u_opacity_border) {
        gl_FragColor = vec4(0.);
      } else {
        // opacity fade out even with a value close to 0.0
        gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
      }
    }`
}

function drawTexture(texture, opacity, textureTransform) {
  var program = screenProgram;
  gl.useProgram(program.program);
  // 代码省略
  // TODO: This index is very fragile. I need to find a way
  glUtils.bindTexture(gl, texture, ctx.screenTextureUnit);
  gl.uniform1i(program.u_screen, ctx.screenTextureUnit);
  gl.uniform1f(program.u_opacity_border, 0.02);
  gl.uniform1f(program.u_opacity, opacity);
  // 代码省略
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// 源库路径 src/lib/scene.js
var ctx = {
  // 代码省略
  // How quickly we should fade previous frame (from 0..1)
  fadeOpacity: appState.getFadeout(),
  // This defines texture unit for screen rendering. First few indices are taken by textures
  // that compute particles position/color
  screenTextureUnit: 3,
  // 代码省略
}

// 源库路径 src/lib/appState.js
var defaults = {
  timeStep: 0.01,
  dropProbability: 0.009,
  particleCount: 10000,
  fadeout: .998,
  colorMode: ColorModes.UNIFORM
}
function getFadeout() {
  let fadeout = qs.get('fo');
  return defined(fadeout) ? fadeout : defaults.fadeout;
}

```
从这些分散的逻辑中，找到着色器中变量对应的实际值：
- `u_screen`：采集颜色信息的纹理，对应变量 `screenTextureUnit` 。
- `u_opacity`：设置的透明度，默认是 `.998` ，转换过程中会变成 `1.0` 。
- `u_opacity_border`：为了解决边界粒子位移问题增加的判定参数，固定值 0.02 。
- `v_tex_pos`：顶点着色器那边传过来的。

这里主要是从动态纹理中采集颜色信息，与透明度结合达到渐变的效果。

## <a name="draw"></a> 绘制
结合上面提到的核心思想，看看执行的两个方法做了什么：
- `screenProgram.fadeOutLastFrame()`
- `screenProgram.renderCurrentScreen()`

### fadeOutLastFrame
```js

var screenTexture, backgroundTexture;

function fadeOutLastFrame() {
  // render to the frame buffer
  glUtils.bindFramebuffer(gl, ctx.framebuffer, screenTexture);
  gl.viewport(0, 0, canvasRect.width, canvasRect.height);

  if (api.boundingBoxUpdated && lastRenderedBoundingBox) {
    // We move the back texture, relative to the bounding box change. This eliminates
    // particle train artifacts, though, not all of them: https://computergraphics.stackexchange.com/questions/5754/fading-particles-and-transition
    // If you know how to improve this - please let me know.
    boundBoxTextureTransform.dx = -(ctx.bbox.minX - lastRenderedBoundingBox.minX)/(ctx.bbox.maxX - ctx.bbox.minX);
    boundBoxTextureTransform.dy = -(ctx.bbox.minY - lastRenderedBoundingBox.minY)/(ctx.bbox.maxY - ctx.bbox.minY);
    boundBoxTextureTransform.scale = (ctx.bbox.maxX - ctx.bbox.minX) / (lastRenderedBoundingBox.maxX - lastRenderedBoundingBox.minX);
    drawTexture(backgroundTexture, ctx.fadeOpacity, boundBoxTextureTransform);
  } else {
    drawTexture(backgroundTexture, ctx.fadeOpacity, NO_TRANSFORM)
  }
}
```
- 切换到了帧缓冲区绘制，将帧缓冲区的颜色关联对象指定纹理对象 `screenTexture` ，这里进行 `drawTexture` 是视觉上看不到的。
- `boundingBoxUpdated` 属性针对的是缩放功能，暂不做讨论。

### renderCurrentScreen
```js
// TODO: Allow customization? Last time I tried, I didn't like it too much.
// It was very easy to screw up the design, and the tool looked ugly :-/
let backgroundColor = { r: 19/255, g: 41/255, b: 79/255, a: 1 };
// 代码省略
function renderCurrentScreen() {
  glUtils.bindFramebuffer(gl, null);

  saveLastBbox();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawTexture(screenTexture, 1.0, NO_TRANSFORM);
  gl.disable(gl.BLEND);

  var temp = backgroundTexture;
  backgroundTexture = screenTexture;
  screenTexture = temp;
  // 代码省略
}
```
- 解除帧缓冲区绑定，绘制的目标变成了颜色缓冲区，也就是说从这里开始，绘制是视觉可见的。
- `saveLastBbox()` 是为了保持比例进行的处理，这里不做讨论。
- 开启 α 混合，清空缓冲，绘制 `screenTexture` 纹理。
- `backgroundTexture` 与 `screenTexture` 进行交互。

<div align="right"><a href="#index">Back to top :arrow_up:</a></div>


## <a name="reference"></a> 参考资料
- [fieldplay github][url-1]

[url-1]:https://github.com/anvaka/fieldplay
[url-2]:https://github.com/XXHolic/starry-night/issues/2
[url-3]:https://github.com/XXHolic/starry-night/issues/1
[url-4]:https://computergraphics.stackexchange.com/questions/5754/fading-particles-and-transition

[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html

[url-local-1]:./image/1.png



<details>
<summary>:wastebasket:</summary>

最近看了十几年前的一部电影[《李米的猜想》][url-last]，故事还是蛮不错的，里面的演员感觉真的好年轻。

</details>

[url-last]:https://movie.douban.com/subject/3230459/
