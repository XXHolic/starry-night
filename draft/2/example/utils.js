var Utils = (function () {
  function exp2(exponent) {
    return Math.exp(exponent * Math.LN2);
  }
  function decodeFloatRGBA(r, g, b, a) {
    var A = Math.floor(r + 0.5);
    var B = Math.floor(g + 0.5);
    var C = Math.floor(b + 0.5);
    var D = Math.floor(a + 0.5);

    var exponent = A - 127.0;
    var sign = 1.0 - (D % 2.0) * 2.0;
    var mantissa =
      (A > 0.0 ? 1 : 0) +
      B / 256.0 +
      C / 65536.0 +
      Math.floor(D / 2.0) / 8388608.0;
    return sign * mantissa * exp2(exponent);
  }

  function textureCollection(gl, dimensions, particleStateResolution) {
    var textures = dimensions.map((d, index) => {
      var textureInfo = {
        texture: glUtils.createTexture(
          gl,
          gl.NEAREST,
          d.particleState,
          particleStateResolution,
          particleStateResolution
        ),
        index: index,
        name: d.name,
      };

      return textureInfo;
    });

    return {
      dispose,
      bindTextures,
      assignProgramUniforms,
      length: dimensions.length,
      textures,
      get(i) {
        return textures[i];
      },
    };

    function assignProgramUniforms(program) {
      textures.forEach((tInfo) => {
        gl.uniform1i(program["u_particles_" + tInfo.name], tInfo.index);
      });
    }

    function dispose() {
      textures.forEach((tInfo) => gl.deleteTexture(tInfo.texture));
    }

    function bindTextures(gl, program) {
      textures.forEach((tInfo) => {
        glUtils.bindTexture(gl, tInfo.texture, tInfo.index);
        gl.uniform1i(program["u_particles_" + tInfo.name], tInfo.index);
      });
    }
  }

  /**
   * A simple interface to compute eventual min/max
   */
  function makeStatCounter() {
    var min, max;

    var api = {
      getMin() {
        return min;
      },
      getMax() {
        return max;
      },
      add(x) {
        if (x < min) min = x;
        if (x > max) max = x;
      },
      reset: reset,
    };

    return api;

    function reset() {
      min = Number.POSITIVE_INFINITY;
      max = Number.NEGATIVE_INFINITY;
    }
  }

  return {
    decodeFloatRGBA,
    textureCollection,
    makeStatCounter,
  };
})();
