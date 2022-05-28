# Filed Play：简介
## <a name="index"></a> 目录
- [引子](#start)
- [核心思想](#core)
- [顶点着色器](#vertex)
- [片元着色器](#fragment)
- [绘制](#draw)
- [参考资料](#reference)

## <a name="start"></a> 引子
基于 [Filed Play：screenProgram][url-pre] 中的核心思想，继续看 `drawProgram` 的实现。

- 源码版本：1.0.0

## <a name="drawProgram"></a> drawProgram
```js
// 源库路径 src/lib/programs/drawParticlesProgram.js
import DrawParticleGraph from '../shaderGraph/DrawParticleGraph';

export default function drawParticlesProgram(ctx) {
  var gl = ctx.gl;
  var currentVectorField = '';

  // 代码省略
    var drawProgram;
  initPrograms();
  return {
    updateParticlesCount,
    updateParticlesPositions,
    drawParticles,
    updateCode,
    updateColorMode
  }
  // 代码省略
  function initPrograms() {
    // need to update the draw graph because color mode shader has changed.
    initDrawProgram();
    // 代码省略
  }
  function initDrawProgram() {
    if (drawProgram) drawProgram.unload();

    const drawGraph = new DrawParticleGraph(ctx);
    const vertexShaderCode = drawGraph.getVertexShader(currentVectorField);
    drawProgram = util.createProgram(gl, vertexShaderCode, drawGraph.getFragmentShader());
  }
}
```
这里可以发现，通过 `DrawParticleGraph` 类生成了相关着色器，涉及到一个动态的变量 `currentVectorField` ，看下那些地方会对这个产生变化：
```js
// 源库路径 src/lib/programs/drawParticlesProgram.js
import makeUpdatePositionProgram from './updatePositionProgram';

var updatePositionProgram = makeUpdatePositionProgram(ctx);

function updateCode(vfCode) {
  ctx.frame = 0;
  currentVectorField = vfCode;
  updatePositionProgram.updateCode(vfCode);

  initDrawProgram();
}

// 源库路径 src/lib/scene.js
import createVectorFieldEditorState from './editor/vectorFieldState';
var vectorFieldEditorState = createVectorFieldEditorState(drawProgram);

// 源库路径 src/lib/editor/vectorFieldState.js
export default function createVectorFieldEditorState(drawProgram) {
  // 代码省略
  drawProgram.updateCode(parserResult.code);
  // 代码省略
}
```
从这几个地方可以看出，`currentVectorField` 对应的就是页面上动态编辑的 GLSL 代码。

## <a name="vertex"></a> 顶点着色器
```js
// 源库路径 src/lib/shaderGraph/DrawParticleGraph.js
import decodeFloatRGBA from './parts/decodeFloatRGBA';
import shaderBasedColor from './shaderBasedColor';

// TODO: this duplicates code from texture position.
export default class DrawParticleGraph {
  constructor(ctx) {
    this.colorMode = ctx.colorMode;
    this.colorFunction = ctx.colorFunction || '';
  }
// 代码省略
  getVertexShader(vfCode) {
    let decodePositions = textureBasedPosition();
    let colorParts = shaderBasedColor(this.colorMode, vfCode, this.colorFunction);
    let methods = []
    addMethods(decodePositions, methods);
    addMethods(colorParts, methods);
    let main = [];
    addMain(decodePositions, main);
    addMain(colorParts, main);

    return `precision highp float;
            attribute float a_index;
            uniform float u_particles_res;
            uniform vec2 u_min;
            uniform vec2 u_max;

            ${decodePositions.getVariables() || ''}
            ${colorParts.getVariables()}

            ${decodeFloatRGBA}

            ${methods.join('\n')}

            void main() {
              vec2 txPos = vec2(
                    fract(a_index / u_particles_res),
                    floor(a_index / u_particles_res) / u_particles_res);
              gl_PointSize = 1.0;

            ${main.join('\n')}

              vec2 du = (u_max - u_min);
              v_particle_pos = (v_particle_pos - u_min)/du;
              gl_Position = vec4(2.0 * v_particle_pos.x - 1.0, (1. - 2. * (v_particle_pos.y)),  0., 1.);
            }`
  }
}

// 代码省略
```
这里里面有动态的进行处理，下面对其中的一些变量进行分析，看看发生了什么。
### vfCode 默认值
按照源代码中默认值找相关逻辑：
```js
// 源库路径 src/lib/editor/vectorFieldState.js
var currentVectorFieldCode = appState.getCode();

// 源库路径 src/lib/appState.js
import wrapVectorField from './wrapVectorField';
var defaultVectorField = wrapVectorField(`v.x = 0.1 * p.y;
  v.y = -0.2 * p.y;`);
function getCode() {
  var vfCode = qs.get('vf');
  if (vfCode) return vfCode;
  // 代码省略
  return defaultVectorField;
}

// 源库路径 src/lib/wrapVectorField.js
export default function wrapVectorField(field) {
  return `// p.x and p.y are current coordinates
// v.x and v.y is a velocity at point p
vec2 get_velocity(vec2 p) {
  vec2 v = vec2(0., 0.);

  // change this to get a new vector field
  ${field}

  return v;
}`
}
```
最终可知，最终默认值为：
```js
`vec2 get_velocity(vec2 p) {
  vec2 v = vec2(0., 0.);
  v.x = 0.1 * p.y;
  v.y = -0.2 * p.y;
  return v;
}`
```
### decodePositions 相关值
```js
let decodePositions = textureBasedPosition();
// 代码省略
 ${decodePositions.getVariables() || ''}
// 代码省略
function textureBasedPosition() {
  return {
    getVariables,
    getMain
  }

  function getVariables() {
    return `
uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;
    `
  }

  function getMain() {
    return `
  vec2 v_particle_pos = vec2(
    decodeFloatRGBA(texture2D(u_particles_x, txPos)),
    decodeFloatRGBA(texture2D(u_particles_y, txPos))
  );
`
  }
}
```
得到一部分值：
```js
`uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;`
```

### colorParts 相关值
```js
import shaderBasedColor from './shaderBasedColor';

let colorParts = shaderBasedColor(this.colorMode, vfCode, this.colorFunction);
```













从这些分散的逻辑中，找到着色器中变量对应的实际值：
- `a_pos`：渲染的整个矩形区域顶点 `quadBuffer` 。
- `v_tex_pos`：会在片元着色器中用到，值实际上也是 `quadBuffer` 。
- `u_transform`：对应平移和缩放的值，默认是 `NO_TRANSFORM` 。

结合源码中的注释可以知道，这个主要是为了绘制整个可见的矩形区域，针对平移和缩放做了一些处理。至于为什么使用这个转换计算方法，注释中也给出了[说明链接][url-4]。


## <a name="fragment"></a> 片元着色器
```js
// 源库路径 src/lib/programs/screenProgram.js

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



<div align="right"><a href="#index">Back to top :arrow_up:</a></div>


## <a name="reference"></a> 参考资料
- [fieldplay github][url-1]

[url-pre]:https://github.com/XXHolic/starry-night/issues/3
[url-1]:https://github.com/anvaka/fieldplay

[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html

[url-local-1]:./image/1.png



<details>
<summary>:wastebasket:</summary>


</details>

[url-last]:https://movie.douban.com/subject/3230459/
