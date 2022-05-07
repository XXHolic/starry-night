window.onload = () => {
  const encodeFloatRGBA = `
  vec4 encodeFloatRGBA(highp float val) {
      if (val == 0.0) {
          return vec4(0.0, 0.0, 0.0, 0.0);
      }

      float mag = abs(val);
      float exponent = floor(log2(mag));
      // Correct log2 approximation errors.
      exponent += float(exp2(exponent) <= mag / 2.0);
      exponent -= float(exp2(exponent) > mag);

      float mantissa;
      if (exponent > 100.0) {
          // Not sure why this needs to be done in two steps for the largest float to work.
          // Best guess is the optimizer rewriting '/ exp2(e)' into '* exp2(-e)',
          // but exp2(-128.0) is too small to represent.
          mantissa = mag / 1024.0 / exp2(exponent - 10.0) - 1.0;
      } else {
          mantissa = mag / float(exp2(exponent)) - 1.0;
      }

      float a = exponent + 127.0;
      mantissa *= 256.0;
      float b = floor(mantissa);
      mantissa -= b;
      mantissa *= 256.0;
      float c = floor(mantissa);
      mantissa -= c;
      mantissa *= 128.0;
      float d = floor(mantissa) * 2.0 + float(val < 0.0);
      return vec4(a, b, c, d) / 255.0;
  }
  `;

  /**
   * A shader function to decode rgba encoded color into float position.
   */
  const decodeFloatRGBA = `
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
    `;

  class BaseShaderNode {
    constructor() {}
    getDefines() {
      return "";
    }
    getFunctions() {
      return "";
    }
    getMainBody() {
      return "";
    }
  }

  /**
   * Reads/writes particle coordinates from/to a texture;
   */
  class TexturePosition extends BaseShaderNode {
    constructor(isDecode) {
      super();

      // When it's decoding, it must read from the texture.
      // Otherwise it must write to the texture;
      this.isDecode = isDecode;
    }

    getFunctions() {
      if (this.isDecode) {
        return `
    ${encodeFloatRGBA}
    ${decodeFloatRGBA}
`;
      }
    }

    getDefines() {
      if (this.isDecode) {
        // TODO: How to avoid duplication and silly checks?
        return `
precision highp float;

uniform sampler2D u_particles_x;
uniform sampler2D u_particles_y;

// Which coordinate needs to be printed onto the texture
uniform int u_out_coordinate;

varying vec2 v_tex_pos;
`;
      }
    }

    getMainBody() {
      if (this.isDecode) {
        return `
   vec2 pos = vec2(
     decodeFloatRGBA(texture2D(u_particles_x, v_tex_pos)),
     decodeFloatRGBA(texture2D(u_particles_y, v_tex_pos))
   );
`;
      }
      return `
    if (u_out_coordinate == 0) gl_FragColor = encodeFloatRGBA(newPos.x);
    else if (u_out_coordinate == 1) gl_FragColor = encodeFloatRGBA(newPos.y);
    else if (u_out_coordinate == 6) gl_FragColor = encodeFloatRGBA(get_velocity(pos).x);
    else if (u_out_coordinate == 7) gl_FragColor = encodeFloatRGBA(get_velocity(pos).y);
`;
    }
  }

  const renderNodes = (nodes) => {
    let code = [];

    nodes.forEach((node) => {
      if (node.getDefines) addToCode(node.getDefines());
    });
    nodes.forEach((node) => {
      if (node.getFunctions) addToCode(node.getFunctions());
    });

    addToCode("void main() {");
    nodes.forEach((node) => {
      if (node.getMainBody) addToCode(node.getMainBody());
    });
    addToCode("}");
    return code.join("\n");

    function addToCode(line) {
      if (line) code.push(line);
    }
  };

  // 对应原文 ./programs/screenProgram.js
  const createScreenProgram = (ctx) => {
    const NO_TRANSFORM = { dx: 0, dy: 0, scale: 1 };

    var { gl, canvasRect } = ctx;

    var screenTexture, backgroundTexture;
    var boundBoxTextureTransform = { dx: 0, dy: 0, scale: 1 };
    var lastRenderedBoundingBox = null;

    // TODO: Allow customization? Last time I tried, I didn't like it too much.
    // It was very easy to screw up the design, and the tool looked ugly :-/
    let backgroundColor = { r: 19 / 255, g: 41 / 255, b: 79 / 255, a: 1 };

    updateScreenTextures();
    var screenProgram = glUtils.createProgram(
      gl,
      getScreenVertexShader(),
      getScreenFragmentShader()
    );

    var api = {
      fadeOutLastFrame,
      renderCurrentScreen,
      updateScreenTextures,

      boundingBoxUpdated: false,
    };

    return api;

    function fadeOutLastFrame() {
      // render to the frame buffer
      glUtils.bindFramebuffer(gl, ctx.framebuffer, screenTexture);
      gl.viewport(0, 0, canvasRect.width, canvasRect.height);

      if (api.boundingBoxUpdated && lastRenderedBoundingBox) {
        // We move the back texture, relative to the bounding box change. This eliminates
        // particle train artifacts, though, not all of them: https://computergraphics.stackexchange.com/questions/5754/fading-particles-and-transition
        // If you know how to improve this - please let me know.
        boundBoxTextureTransform.dx =
          -(ctx.bbox.minX - lastRenderedBoundingBox.minX) /
          (ctx.bbox.maxX - ctx.bbox.minX);
        boundBoxTextureTransform.dy =
          -(ctx.bbox.minY - lastRenderedBoundingBox.minY) /
          (ctx.bbox.maxY - ctx.bbox.minY);
        boundBoxTextureTransform.scale =
          (ctx.bbox.maxX - ctx.bbox.minX) /
          (lastRenderedBoundingBox.maxX - lastRenderedBoundingBox.minX);
        drawTexture(
          backgroundTexture,
          ctx.fadeOpacity,
          boundBoxTextureTransform
        );
      } else {
        drawTexture(backgroundTexture, ctx.fadeOpacity, NO_TRANSFORM);
      }
    }

    function renderCurrentScreen() {
      glUtils.bindFramebuffer(gl, null);

      saveLastBbox();

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(
        backgroundColor.r,
        backgroundColor.g,
        backgroundColor.b,
        backgroundColor.a
      );
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawTexture(screenTexture, 1.0, NO_TRANSFORM);
      gl.disable(gl.BLEND);

      var temp = backgroundTexture;
      backgroundTexture = screenTexture;
      screenTexture = temp;

      api.boundingBoxUpdated = false;
      if (window.audioTexture) {
        drawTexture(window.audioTexture, 1.0, NO_TRANSFORM);
      }
    }

    function updateScreenTextures() {
      var { width, height } = canvasRect;
      var emptyPixels = new Uint8Array(width * height * 4);
      if (screenTexture) {
        gl.deleteTexture(screenTexture);
      }
      if (backgroundTexture) {
        gl.deleteTexture(backgroundTexture);
      }

      screenTexture = glUtils.createTexture(
        gl,
        gl.NEAREST,
        emptyPixels,
        width,
        height
      );
      backgroundTexture = glUtils.createTexture(
        gl,
        gl.NEAREST,
        emptyPixels,
        width,
        height
      );
    }

    function saveLastBbox() {
      if (!lastRenderedBoundingBox) {
        lastRenderedBoundingBox = {
          minX: ctx.bbox.minX,
          minY: ctx.bbox.minY,
          maxX: ctx.bbox.maxX,
          maxY: ctx.bbox.maxY,
        };

        return;
      }

      lastRenderedBoundingBox.minX = ctx.bbox.minX;
      lastRenderedBoundingBox.minY = ctx.bbox.minY;
      lastRenderedBoundingBox.maxX = ctx.bbox.maxX;
      lastRenderedBoundingBox.maxY = ctx.bbox.maxY;
    }

    function drawTexture(texture, opacity, textureTransform) {
      var program = screenProgram;
      gl.useProgram(program.program);
      glUtils.bindAttribute(gl, ctx.quadBuffer, program.a_pos, 2);

      // TODO: This index is very fragile. I need to find a way
      glUtils.bindTexture(gl, texture, ctx.screenTextureUnit);
      gl.uniform1i(program.u_screen, ctx.screenTextureUnit);

      gl.uniform1f(program.u_opacity_border, 0.02);
      gl.uniform1f(program.u_opacity, opacity);
      gl.uniform3f(
        program.u_transform,
        textureTransform.dx,
        textureTransform.dy,
        textureTransform.scale
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

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
      }`;
    }

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
      }`;
    }
  };
  // ./programs/updatePositionProgram.js
  const makeUpdatePositionProgram = (ctx) => {
    function readFloat(buffer, offset) {
      return Utils.decodeFloatRGBA(
        buffer[offset + 0],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3]
      );
    }
  };

  // ./programs/drawParticlesProgram.js
  const createDrawParticlesProgram = (ctx) => {
    var gl = ctx.gl;

    var particleStateResolution, particleIndexBuffer;
    var numParticles;

    var currentVectorField = "";
    var updatePositionProgram = makeUpdatePositionProgram(ctx);
    var audioProgram;

    var drawProgram;
    initPrograms();

    return {
      updateParticlesCount,
      updateParticlesPositions,
      drawParticles,
      updateCode,
      updateColorMode,
    };

    function initPrograms() {
      // need to update the draw graph because color mode shader has changed.
      initDrawProgram();

      if (config.isAudioEnabled) {
        if (audioProgram) audioProgram.dispose();
        audioProgram = createAudioProgram(ctx);
      }
    }

    function initDrawProgram() {
      if (drawProgram) drawProgram.unload();

      const drawGraph = new DrawParticleGraph(ctx);
      const vertexShaderCode = drawGraph.getVertexShader(currentVectorField);
      drawProgram = glUtils.createProgram(
        gl,
        vertexShaderCode,
        drawGraph.getFragmentShader()
      );
    }

    function updateParticlesPositions() {
      if (!currentVectorField) return;

      ctx.frame += 1;
      ctx.frameSeed = Math.random();

      // TODO: Remove this.
      if (audioProgram) audioProgram.updateTextures();

      updatePositionProgram.updateParticlesPositions();
    }

    function updateColorMode() {
      initDrawProgram();
    }

    function updateCode(vfCode) {
      ctx.frame = 0;
      currentVectorField = vfCode;
      updatePositionProgram.updateCode(vfCode);

      initDrawProgram();
    }

    function updateParticlesCount() {
      particleStateResolution = ctx.particleStateResolution;
      numParticles = particleStateResolution * particleStateResolution;
      var particleIndices = new Float32Array(numParticles);
      var particleStateX = new Uint8Array(numParticles * 4);
      var particleStateY = new Uint8Array(numParticles * 4);

      var minX = ctx.bbox.minX;
      var minY = ctx.bbox.minY;
      var width = ctx.bbox.maxX - minX;
      var height = ctx.bbox.maxY - minY;
      for (var i = 0; i < numParticles; i++) {
        encodeFloatRGBA(Math.random() * width + minX, particleStateX, i * 4); // randomize the initial particle positions
        encodeFloatRGBA(Math.random() * height + minY, particleStateY, i * 4); // randomize the initial particle positions

        particleIndices[i] = i;
      }

      if (particleIndexBuffer) gl.deleteBuffer(particleIndexBuffer);
      particleIndexBuffer = glUtils.createBuffer(gl, particleIndices);

      updatePositionProgram.updateParticlesCount(
        particleStateX,
        particleStateY
      );
    }

    function drawParticles() {
      if (!currentVectorField) return;

      var program = drawProgram;
      gl.useProgram(program.program);

      glUtils.bindAttribute(gl, particleIndexBuffer, program.a_index, 1);

      updatePositionProgram.prepareToDraw(program);
      ctx.inputs.updateBindings(program);

      gl.uniform1f(program.u_h, ctx.integrationTimeStep);
      gl.uniform1f(program.frame, ctx.frame);
      gl.uniform1f(program.u_particles_res, particleStateResolution);
      var bbox = ctx.bbox;
      gl.uniform2f(program.u_min, bbox.minX, bbox.minY);
      gl.uniform2f(program.u_max, bbox.maxX, bbox.maxY);

      var cursor = ctx.cursor;
      gl.uniform4f(
        program.cursor,
        cursor.clickX,
        cursor.clickY,
        cursor.hoverX,
        cursor.hoverY
      );
      gl.drawArrays(gl.POINTS, 0, numParticles);
    }
  };

  // 对应源文件 appState.js
  const appState = (function () {
    const defaults = {
      timeStep: 0.01,
      dropProbability: 0.009,
      particleCount: 100,
      fadeout: 0.998,
      colorMode: ColorModes.UNIFORM,
    };

    function getParticleCount() {
      return defaults.particleCount;
    }

    function getColorMode() {
      return defaults.colorMode;
    }

    function getColorFunction() {
      // let colorFunction = qs.get("cf");
      return "";
    }

    function getIntegrationTimeStep() {
      // let timeStep = qs.get("dt");
      return defaults.timeStep;
    }

    function getDropProbability() {
      // let dropProbability = qs.get("dp");
      return defaults.dropProbability;
    }

    function getFadeout() {
      // let fadeout = qs.get("fo");
      return defaults.fadeout;
    }

    return {
      getParticleCount,
      getColorMode,
      getColorFunction,
      getIntegrationTimeStep,
      getDropProbability,
      getFadeout,
    };
  })();

  // 对应在原文件 scene.js
  const initScene = (gl) => {
    function setWidthHeight(w, h) {
      var dx = Math.max(w * 0.02, 30);
      var dy = Math.max(h * 0.02, 30);
      canvasRect.width = w + 2 * dx;
      canvasRect.height = h + 2 * dy;
      canvasRect.top = -dy;
      canvasRect.left = -dx;

      let canvas = gl.canvas;
      canvas.width = canvasRect.width;
      canvas.height = canvasRect.height;
      canvas.style.left = -dx + "px";
      canvas.style.top = -dy + "px";
    }
    var canvasRect = { width: 0, height: 0, top: 0, left: 0 };
    setWidthHeight(gl.canvas.width, gl.canvas.height);

    var particleCount = appState.getParticleCount();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    // Context variable is a way to share rendering state between multiple programs. It has a lot of stuff on it.
    // I found that it's the easiest way to work in state-full world of WebGL.
    // Until I discover a better way to write WebGL code.
    var ctx = {
      gl,
      // bbox,
      canvasRect,

      inputs: null,

      framebuffer: gl.createFramebuffer(),

      // This is used only to render full-screen rectangle. Main magic happens inside textures.
      quadBuffer: glUtils.createBuffer(
        gl,
        new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])
      ),

      colorMode: appState.getColorMode(),
      colorFunction: appState.getColorFunction(),

      // This defines texture unit for screen rendering. First few indices are taken by textures
      // that compute particles position/color
      // TODO: I need to find a better way to manage this.
      screenTextureUnit: 3,

      integrationTimeStep: appState.getIntegrationTimeStep(),

      // On each frame the likelihood for a particle to reset its position is this:
      dropProbability: appState.getDropProbability(),

      // current frame number. Reset every time when new shader is compiled
      frame: 0,

      // Information about mouse cursor. Could be useful to simplify
      // exploration
      cursor: {
        // Where mouse was last time clicked (or tapped)
        clickX: 0,
        clickY: 0,
        // where mouse was last time moved. If this is a touch device
        // this is the same as clickX, clickY
        hoverX: 0,
        hoverY: 0,
      },

      // Texture size to store particles' positions
      particleStateResolution: 0,

      // How quickly we should fade previous frame (from 0..1)
      fadeOpacity: appState.getFadeout(),

      // Ignore this one for a moment. Yes, the app support web audio API,
      // but it's rudimentary, so... shhh! it's a secret.
      // Don't shhh on me!
      audioTexture: null,
    };

    // Frame management
    var lastAnimationFrame;
    var isPaused = false;

    // screen rendering;
    var screenProgram = createScreenProgram(ctx);
    var drawProgram = createDrawParticlesProgram(ctx);
    var cursorUpdater = createCursorUpdater(ctx);
    var vectorFieldEditorState = createVectorFieldEditorState(drawProgram);
  };

  var canvas = document.getElementById("scene");
  if (canvas) initVectorFieldApp(canvas);

  function initVectorFieldApp(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctxOptions = { antialiasing: false };

    var gl =
      canvas.getContext("webgl", ctxOptions) ||
      canvas.getContext("experimental-webgl", ctxOptions);

    if (gl) {
      window.webGLEnabled = true;
      var scene = initScene(gl);
      scene.start();
      // initAutoMode(scene);
      window.scene = scene;
    } else {
      window.webGLEnabled = false;
    }
  }
};
