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
`
vec2 get_velocity(vec2 p) {
  vec2 v = vec2(0., 0.);
  v.x = 0.1 * p.y;
  v.y = -0.2 * p.y;
  return v;
}
`
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
得到 `decodePositions.getVariables()` 值：
```js
`uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;`
```

### colorParts 相关值
```js
let colorParts = shaderBasedColor(this.colorMode, vfCode, this.colorFunction);

${colorParts.getVariables()}

// 源库路径 src/lib/shaderGraph/shaderBasedColor.js
export default function shaderBasedColor(colorMode, vfCode, colorCode) {
  // 代码省略
  return {
    getVariables,
    getMain,
    getMethods
  }
  // 代码省略
}
```
一步步代入默认值，先得到 `udf.getDefines()` 值为：
```js
`
  uniform float frame;
  uniform vec4 cursor;
  // TODO: use inputN instead.
  uniform sampler2D u_audio;

  #define PI 3.1415926535897932384626433832795
  uniform sampler2D input0;
  uniform sampler2D input1;
`
```

在得到 `integrate.getDefines()` 值为：
```js
`uniform float u_h;`
```

最后 `colorParts.getVariables()` 值为：

```js
`
  uniform vec2 u_velocity_range;
  varying vec4 v_particle_color;

  uniform float frame;
  uniform vec4 cursor;
  // TODO: use inputN instead.
  uniform sampler2D u_audio;

  #define PI 3.1415926535897932384626433832795
  uniform sampler2D input0;
  uniform sampler2D input1;
  uniform float u_h;
`
```

### methods 相关值
```js
import shaderBasedColor from './shaderBasedColor';
  // 代码省略
  constructor(ctx) {
    this.colorMode = ctx.colorMode;
    this.colorFunction = ctx.colorFunction || '';
  }
  // 代码省略
let colorParts = shaderBasedColor(this.colorMode, vfCode, this.colorFunction);
let methods = []
addMethods(decodePositions, methods);
addMethods(colorParts, methods);

${methods.join('\n')}

function addMethods(producer, array) {
  if (producer.getMethods) {
    array.push(producer.getMethods());
  }
}

// 源库路径 src/lib/scene.js
var ctx = {
  // 代码省略
  colorMode: appState.getColorMode(),
  colorFunction: appState.getColorFunction(),
  // 代码省略
}

// 源库路径 src/lib/appState.js
import ColorModes from './programs/colorModes';
var defaults = {
  // 代码省略
  colorMode: ColorModes.UNIFORM
}
function getColorMode() {
  let colorMode = qs.get('cm');
  return defined(colorMode) ? colorMode : defaults.colorMode;
}
function getColorFunction() {
  let colorFunction = qs.get('cf');
  return colorFunction || '';
}

// 源库路径 src/lib/programs/colorModes.js
export default {
  /**
   * Each particle gets its own color
   */
  UNIFORM: 1,
  // 代码省略
}

// 源库路径 src/lib/shaderGraph/shaderBasedColor.js
export default function shaderBasedColor(colorMode, vfCode, colorCode) {
  // 代码省略
  return {
    getVariables,
    getMain,
    getMethods
  }
  // 代码省略
}
```
从各个相关地方代入默认值，得到 `methods.join('\n')` 值为：
```js
`
  // 以下都是 colorParts 的 getMethods 方法返回值
  // https://github.com/hughsk/glsl-hsv2rgb
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

    // pseudo-random generator
  const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
  float rand(const vec2 co) {
      float t = dot(rand_constants.xy, co);
      return fract(sin(t) * (rand_constants.z + t));
  }
  // noise 算法开始
  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
  }

  float snoise(vec2 v)
    {
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                      -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0
  // First corner
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);

  // Other corners
    vec2 i1;
    //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
    //i1.y = 1.0 - i1.x;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    // x0 = x0 - 0.0 + 0.0 * C.xx ;
    // x1 = x0 - i1 + 1.0 * C.xx ;
    // x2 = x0 - 1.0 + 2.0 * C.xx ;
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

  // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

  // Gradients: 41 points uniformly over a line, mapped onto a diamond.
  // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

  // Normalise gradients implicitly by scaling m
  // Approximation of: m *= inversesqrt( a0*a0 + h*h );
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

  // Compute final noise value at P
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  // noise 算法结束

  vec2 rotate(vec2 p,float a) {
    return cos(a)*p+sin(a)*vec2(p.y,-p.x);
  }

  // TODO: This will change. Don't use it.
  float audio(float index) {
    float rgbI = floor(index/4.);
    vec2 txPos = vec2(fract(rgbI / 5.), floor(rgbI / 5.) / 5.);
    vec4 rgba = texture2D(u_audio, txPos);

    float offset = mod(index, 4.);
    if (offset == 0.) return rgba[0];
    if (offset == 1.) return rgba[1];
    if (offset == 2.) return rgba[2];
    return rgba[3];
  }
  // vfCode 的值
  vec2 get_velocity(vec2 p) {
    vec2 v = vec2(0., 0.);
    v.x = 0.1 * p.y;
    v.y = -0.2 * p.y;
    return v;
  }
  // RungeKutta 算法
  vec2 rk4(const vec2 point) {
    vec2 k1 = get_velocity( point );
    vec2 k2 = get_velocity( point + k1 * u_h * 0.5);
    vec2 k3 = get_velocity( point + k2 * u_h * 0.5);
    vec2 k4 = get_velocity( point + k3 * u_h);

    return k1 * u_h / 6. + k2 * u_h/3. + k3 * u_h/3. + k4 * u_h/6.;
  }
  // 获取颜色方法
  vec4 get_color(vec2 p) {
    return vec4(0.302, 0.737, 0.788, 1.);
  }

`
```

### main 相关值
```js
  // 代码省略
let main = [];
addMain(decodePositions, main);
addMain(colorParts, main);
  // 代码省略
${main.join('\n')}
  // 代码省略
function addMain(producer, array) {
  if (producer.getMain) {
    array.push(producer.getMain());
  }
}
```
根据前面类似相关模块，得到 `main.join('\n')` 的值为：
```js
`
// decodePositions 的 main 方法返回值
vec2 v_particle_pos = vec2(
  decodeFloatRGBA(texture2D(u_particles_x, txPos)),
  decodeFloatRGBA(texture2D(u_particles_y, txPos))
);
// colorParts 的 main 方法返回值
v_particle_color = get_color(v_particle_pos);
`
```

### 最终合并值
将所有变量得到的值合并整理后得到的顶点着色器：
```js
`
precision highp float;
attribute float a_index;
uniform float u_particles_res;
uniform vec2 u_min;
uniform vec2 u_max;
uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;

uniform vec2 u_velocity_range;
varying vec4 v_particle_color;

uniform float frame;
uniform vec4 cursor;
// TODO: use inputN instead.
uniform sampler2D u_audio;

#define PI 3.1415926535897932384626433832795
uniform sampler2D input0;
uniform sampler2D input1;
uniform float u_h;

highp float decodeFloatRGBA( vec4 v ) {
  float a = floor(v.r * 255.0 + 0.5);
  float b = floor(v.g * 255.0 + 0.5);
  float c = floor(v.b * 255.0 + 0.5);
  float d = floor(v.a * 255.0 + 0.5);

  float exponent = a - 127.0;
  float sign = 1.0 - mod(d, 2.0)*2.0;
  float mantissa = float(a > 0.0)
                  + b / 256.0
                  + c / 65536.0
                  + floor(d / 2.0) / 8388608.0;
  return sign * mantissa * exp2(exponent);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

  // pseudo-random generator
const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}
// noise 算法开始
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x*34.0)+1.0)*x);
}

float snoise(vec2 v)
  {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                    -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
// First corner
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);

// Other corners
  vec2 i1;
  //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
  //i1.y = 1.0 - i1.x;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  // x0 = x0 - 0.0 + 0.0 * C.xx ;
  // x1 = x0 - i1 + 1.0 * C.xx ;
  // x2 = x0 - 1.0 + 2.0 * C.xx ;
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

// Permutations
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));

  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;

// Gradients: 41 points uniformly over a line, mapped onto a diamond.
// The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

// Normalise gradients implicitly by scaling m
// Approximation of: m *= inversesqrt( a0*a0 + h*h );
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

// Compute final noise value at P
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
// noise 算法结束

vec2 rotate(vec2 p,float a) {
  return cos(a)*p+sin(a)*vec2(p.y,-p.x);
}

// TODO: This will change. Don't use it.
float audio(float index) {
  float rgbI = floor(index/4.);
  vec2 txPos = vec2(fract(rgbI / 5.), floor(rgbI / 5.) / 5.);
  vec4 rgba = texture2D(u_audio, txPos);

  float offset = mod(index, 4.);
  if (offset == 0.) return rgba[0];
  if (offset == 1.) return rgba[1];
  if (offset == 2.) return rgba[2];
  return rgba[3];
}
// vfCode 的值
vec2 get_velocity(vec2 p) {
  vec2 v = vec2(0., 0.);
  v.x = 0.1 * p.y;
  v.y = -0.2 * p.y;
  return v;
}
// RungeKutta 算法
vec2 rk4(const vec2 point) {
  vec2 k1 = get_velocity( point );
  vec2 k2 = get_velocity( point + k1 * u_h * 0.5);
  vec2 k3 = get_velocity( point + k2 * u_h * 0.5);
  vec2 k4 = get_velocity( point + k3 * u_h);

  return k1 * u_h / 6. + k2 * u_h/3. + k3 * u_h/3. + k4 * u_h/6.;
}
// 获取颜色方法
vec4 get_color(vec2 p) {
  return vec4(0.302, 0.737, 0.788, 1.);
}

void main() {
  vec2 txPos = vec2(
        fract(a_index / u_particles_res),
        floor(a_index / u_particles_res) / u_particles_res);
  gl_PointSize = 1.0;
  vec2 v_particle_pos = vec2(
    decodeFloatRGBA(texture2D(u_particles_x, txPos)),
    decodeFloatRGBA(texture2D(u_particles_y, txPos))
  );
  v_particle_color = get_color(v_particle_pos);
  vec2 du = (u_max - u_min);
  v_particle_pos = (v_particle_pos - u_min)/du;
  gl_Position = vec4(2.0 * v_particle_pos.x - 1.0, (1. - 2. * (v_particle_pos.y)),  0., 1.);
}

`
```
### 变量对应赋值
```js
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


https://anvaka.github.io/fieldplay/?cx=0.0004500000000002835&cy=0&w=8.540700000000001&h=8.540700000000001&dt=0.01&fo=0.998&dp=0.009&cm=1
<details>
<summary>:wastebasket:</summary>


</details>

[url-last]:https://movie.douban.com/subject/3230459/
