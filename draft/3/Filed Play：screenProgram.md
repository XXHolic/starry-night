# Filed Play：简介
## <a name="index"></a> 目录
- [引子](#start)
- [核心思想](#core)
- [顶点着色器](#vertex)
- [片元着色器](#fragment)
- [着色器程序](#program)
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

## <a name="vertex"></a> 顶点着色器

```js
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

```
- a_pos
- v_tex_pos
- u_transform

## <a name="fragment"></a> 片元着色器
```js
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
```
- u_screen
- u_opacity
- u_opacity_border
- v_tex_pos

## <a name="program"></a> 着色器程序

<div align="right"><a href="#index">Back to top :arrow_up:</a></div>


## <a name="reference"></a> 参考资料
- [fieldplay github][url-1]

[url-1]:https://github.com/anvaka/fieldplay
[url-2]:https://github.com/XXHolic/starry-night/issues/2
[url-3]:https://github.com/XXHolic/starry-night/issues/1

[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html

[url-local-1]:./image/1.png



<details>
<summary>:wastebasket:</summary>

最近看了十几年前的一部电影[《李米的猜想》][url-last]，故事还是蛮不错的，里面的演员感觉真的好年轻。

</details>

[url-last]:https://movie.douban.com/subject/3230459/
