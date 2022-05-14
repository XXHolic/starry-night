# filed play
## <a name="index"></a> 目录
- [引子](#start)
- [参考资料](#reference)

## <a name="start"></a> 引子
在探索数学函数绘制的时候，发现了一个
### 关键逻辑
```js
// scene.js
  import createScreenProgram from './programs/screenProgram';
import createDrawParticlesProgram from './programs/drawParticlesProgram';


  var screenProgram = createScreenProgram(ctx);
  var drawProgram = createDrawParticlesProgram(ctx);
  var cursorUpdater = createCursorUpdater(ctx);


  function nextFrame() {
    if (lastAnimationFrame) return;

    if (isPaused) return;

    lastAnimationFrame = requestAnimationFrame(draw);
  }

  function drawScreen() {
    screenProgram.fadeOutLastFrame()
    drawProgram.drawParticles();
    screenProgram.renderCurrentScreen();
    drawProgram.updateParticlesPositions();
  }

  function draw() {
    lastAnimationFrame = 0;

    drawScreen();

    if (currentCapturer) currentCapturer.capture(gl.canvas);

    nextFrame();
  }
```

## screenProgram
### VertexShader
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



### FragmentShader
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

## drawProgram


这个是动态的。

```js
// ./programs/drawParticlesProgram
  function initDrawProgram() {
    if (drawProgram) drawProgram.unload();

    const drawGraph = new DrawParticleGraph(ctx);

    // currentVectorField 在 ./editor/vectorFieldState.js 文件中会用下面方式赋值：
    // drawProgram.updateCode(parserResult.code);
    const vertexShaderCode = drawGraph.getVertexShader(currentVectorField);
    drawProgram = util.createProgram(gl, vertexShaderCode, drawGraph.getFragmentShader());
  }
```

### DrawParticleGraph
```js
import decodeFloatRGBA from './parts/decodeFloatRGBA';
import shaderBasedColor from './shaderBasedColor';

// TODO: this duplicates code from texture position.
export default class DrawParticleGraph {
  constructor(ctx) {
    this.colorMode = ctx.colorMode;
    this.colorFunction = ctx.colorFunction || '';
  }

  getFragmentShader() {
    return `precision highp float;
    varying vec4 v_particle_color;
    void main() {
      gl_FragColor = v_particle_color;
    }`
  }

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

function addMethods(producer, array) {
  if (producer.getMethods) {
    array.push(producer.getMethods());
  }
}

function addMain(producer, array) {
  if (producer.getMain) {
    array.push(producer.getMain());
  }
}

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

### VertexShader
上面 DrawParticleGraph 实例使用 getVertexShader 方法获取
- a_index
- u_particles_res
- u_min
- u_max

### fragmentShader

上面 DrawParticleGraph 实例使用 getFragmentShader 方法获取
```js
  getFragmentShader() {
    return `precision highp float;
    varying vec4 v_particle_color;
    void main() {
      gl_FragColor = v_particle_color;
    }`
  }
```



<div align="right"><a href="#index">Back to top :arrow_up:</a></div>


## <a name="reference"></a> 参考资料
- [矩阵百科][url-1]

[url-1]:https://baike.baidu.com/item/%E7%9F%A9%E9%98%B5/18069?fr=aladdin

[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html

[url-local-1]:./image/1.png


<details>
<summary>:wastebasket:</summary>

最近看了[《红线》][url-waste]这部作品，里面赛车设计和场面看着还是蛮过瘾的！

</details>

[url-waste]:https://movie.douban.com/subject/3903715/
