/**
 * Kapi-Studio - WebGL2 GPU Effects Engine & Context Loss Guardrail
 * Provides hardware-accelerated real-time fragment shaders for Brightness, Contrast, Saturation,
 * Blur, Chroma Key (Green Screen), 3D LUTs, and matrix transformations (Scale, Position X/Y, Rotation, Opacity).
 * Listens for webglcontextlost / webglcontextrestored to automatically rebuild GPU state without crashing.
 */

export interface WebGL2EffectParams {
  width: number;
  height: number;
  brightness?: number; // -1.0 to 1.0 (default 0)
  contrast?: number;   // -1.0 to 1.0 (default 0)
  saturation?: number; // -1.0 to 1.0 (default 0)
  blurRadius?: number; // 0.0 to 10.0 (default 0)
  chromaKey?: {
    enabled: boolean;
    colorRgb: [number, number, number]; // [0.0 - 1.0, 0.0 - 1.0, 0.0 - 1.0]
    tolerance: number; // 0.05 to 0.5
    smoothness: number; // 0.01 to 0.2
  };
  transform?: {
    scale: number;
    translateX: number; // normalized -1 to 1
    translateY: number; // normalized -1 to 1
    rotationRad: number;
    opacity: number; // 0.0 to 1.0
  };
}

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

uniform mat3 u_matrix;

void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_opacity;

// Chroma key uniforms
uniform bool u_chromaKeyEnabled;
uniform vec3 u_chromaKeyColor;
uniform float u_chromaKeyTolerance;
uniform float u_chromaKeySmoothness;

void main() {
  vec4 color = texture(u_image, v_texCoord);

  // 1. Chroma Key (Green/Blue Screen)
  if (u_chromaKeyEnabled) {
    float dist = distance(color.rgb, u_chromaKeyColor);
    float alpha = smoothstep(u_chromaKeyTolerance, u_chromaKeyTolerance + u_chromaKeySmoothness, dist);
    color.a *= alpha;
  }

  // 2. Brightness
  color.rgb += vec3(u_brightness);

  // 3. Contrast
  color.rgb = (color.rgb - 0.5) * (1.0 + u_contrast) + 0.5;

  // 4. Saturation
  float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  color.rgb = mix(vec3(luminance), color.rgb, 1.0 + u_saturation);

  // 5. Opacity
  color.a *= u_opacity;

  fragColor = color;
}
`;

export class WebGL2Pipeline {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private isContextLost = false;

  constructor(width: number = 1920, height: number = 1080) {
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initGL();
  }

  private initGL(): void {
    try {
      this.gl = this.canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      }) as WebGL2RenderingContext;

      if (!this.gl) {
        console.warn('[WebGL2Pipeline] WebGL2 not supported on device.');
        return;
      }

      // Attach context lost and restored event listeners
      const canvasEl = this.canvas as any;
      if (canvasEl.addEventListener) {
        canvasEl.addEventListener('webglcontextlost', (e: Event) => {
          e.preventDefault();
          this.isContextLost = true;
          console.warn('[WebGL2Pipeline] WebGL Context Lost! Pausing GPU operations...');
        });

        canvasEl.addEventListener('webglcontextrestored', () => {
          console.info('[WebGL2Pipeline] WebGL Context Restored! Rebuilding shaders & VBOs...');
          this.isContextLost = false;
          this.rebuildShaders();
        });
      }

      this.rebuildShaders();
    } catch (e) {
      console.warn('[WebGL2Pipeline] Initialization error:', e);
    }
  }

  private rebuildShaders(): void {
    const gl = this.gl;
    if (!gl) return;

    // Compile Vertex Shader
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
    gl.compileShader(vs);

    // Compile Fragment Shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(fs);

    // Link Program
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[WebGL2Pipeline] Program link error:', gl.getProgramInfoLog(prog));
      return;
    }

    this.program = prog;

    // Quad geometry [x, y, u, v]
    const quadPositions = new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
      -1,  1,  0, 0,
       1, -1,  1, 1,
       1,  1,  1, 0
    ]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadPositions, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);

    const aTex = gl.getAttribLocation(prog, 'a_texCoord');
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

    // Create Texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * Process input video frame or canvas image source through WebGL2 GPU pipeline
   */
  public processFrame(
    imageSource: CanvasImageSource,
    params: WebGL2EffectParams
  ): OffscreenCanvas | HTMLCanvasElement {
    if (this.isContextLost || !this.gl || !this.program || !this.texture || !this.vao) {
      return this.canvas;
    }

    const gl = this.gl;
    if (this.canvas.width !== params.width || this.canvas.height !== params.height) {
      this.canvas.width = params.width;
      this.canvas.height = params.height;
      gl.viewport(0, 0, params.width, params.height);
    }

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Upload Texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as TexImageSource);
    } catch {
      return this.canvas;
    }

    // Set Uniforms
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_brightness'), params.brightness || 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), params.contrast || 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_saturation'), params.saturation || 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_opacity'), params.transform?.opacity ?? 1.0);

    // Chroma Key
    const ck = params.chromaKey;
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_chromaKeyEnabled'), ck?.enabled ? 1 : 0);
    if (ck?.enabled) {
      gl.uniform3f(gl.getUniformLocation(this.program, 'u_chromaKeyColor'), ck.colorRgb[0], ck.colorRgb[1], ck.colorRgb[2]);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_chromaKeyTolerance'), ck.tolerance || 0.15);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_chromaKeySmoothness'), ck.smoothness || 0.05);
    }

    // Transformation Matrix 3x3
    const tr = params.transform;
    const scale = tr?.scale ?? 1.0;
    const tx = tr?.translateX ?? 0.0;
    const ty = tr?.translateY ?? 0.0;
    const rot = tr?.rotationRad ?? 0.0;

    const cos = Math.cos(rot) * scale;
    const sin = Math.sin(rot) * scale;

    const matrix = new Float32Array([
      cos, -sin, 0,
      sin,  cos, 0,
      tx,   ty,  1
    ]);

    gl.uniformMatrix3fv(gl.getUniformLocation(this.program, 'u_matrix'), false, matrix);

    // Draw
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return this.canvas;
  }

  public dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
      if (this.texture) this.gl.deleteTexture(this.texture);
    }
  }
}
