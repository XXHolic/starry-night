# Filed Play：简介
## <a name="start"></a> 引子
在尝试数学函数可视化的时候，发现了一个有趣的库 [Field Play][url-1] ，对 README 中的说明进行部分翻译记录，做个初步了解。
- [Origin][url-origin]
- [My GitHub][url-my-github]
## <a name="what"></a> What?
让我们为网格上的每个点指定一个向量 `(1, 0)` 。这意味着我们有一个箭头，指向右边：
![2-1][url-local-1]
假设这些向量代表速度。如果我们把一千个粒子扔到这个网格上呢？它们会怎么行动？
![2-2][url-local-2]
当我们给空白区上的每个点分配一个向量时，我们创建了一个称为 `向量场(Vector Field)` 的数学结构。
让我们创建一个更有趣的向量场：
- `y` 坐标为偶数的点得到向量 `(1, 0)`；
- `y` 坐标为奇数的点得到一个相反的向量 `(-1, 0)`；
![2-3][url-local-3]
我们再次投下几千个粒子，看看会发生什么：
![2-4][url-local-4]
上述可以用一个公式表示：
```
v.x = -2.0 * mod(floor(y), 2.0) + 1.0;
v.y = 0.0;
```
整数相除 `y/2` 后的余数可能是 1 或 0 。然后我们变换余数，使最终向量为 `(-1, 0)` 或 `(1, 0)` 。
到目前为止，我们只使用了速度向量的一个分量 `v.x` ，粒子只水平移动。让我们试着设置所有两个分量，看看会发生什么
```
v.x = -2.0 * mod(floor(y), 2.0) + 1.0;
v.y = -2.0 * mod(floor(x), 2.0) + 1.0;
```
![2-5][url-local-5]
![2-6][url-local-6]
哇！两个简单的操作，最终的动画看起来像一件艺术品！
![2-7][url-local-7]
事实证明，向量场是非常灵活的生成框架。
## <a name="how"></a> How this project works?
这个项目的灵感来自 Vladimir Agafonkin 的文章：[How I built a wind map with WebGL][url-2]。Vladimir 演示了如何完全在 GPU 上以每秒 60 帧的速度渲染多达 100 万个粒子。
我使用了几乎相同的技术，但做了一些修改：
1. 向量场是用着色器语言 GLSL 代码定义的，因此数学公式可以自由表示。
2. 粒子的位置在 GPU 上用四阶 [Runge-Kutta][url-3] 法计算。
3. 每个维度 X 和 Y 都是独立计算的，因此我们可以更准确地存储位置。
4. 使用 [panzoom][url-4] 库添加了平移/缩放功能。
5. 向量场定义使用 [query-state][url-5] 库保存在 URL 中。这样你可以方便的把你的向量场加入书签/分享。
## <a name="float"></a> Float packing
基于 WebGL 计算的核心思想非常简单。
GPU 可以非常快速地渲染图像。每个图像都是像素的集合。每个像素只是一个代表颜色的数字，通常以 32 位（RGBA 格式）写入。
但谁说每像素的 32 位必须代表一种颜色？为什么我们不能计算一些数字，并将其存储到 32 位？这个数字可以是，例如，沿着某个速度向量的粒子的位置...
如果我们这样做，GPU 仍然会将这些数字视为颜色：
![2-8][url-local-8]
幸运的是，我们不必让用户看到这些看似随机的图像。WebGL 允许在称为`帧缓冲区(frame buffers)`的“虚拟”屏幕上渲染内容。
这些虚拟屏幕只是视频存储器中的图像（纹理）。有了两种纹理，我们可以利用 GPU 来解决数学问题。在每一帧上，算法的工作原理如下：
1. 告诉 GPU 从 “background” 纹理读取数据；
2. 告诉 GPU 使用帧缓冲区将数据写入 “screen” 纹理；
3. 用 “screen” 替换 “background” ；
从理论上讲，这应该能很好的运行。实际上存在一个问题。WebGL 不允许将浮点数写入纹理。所以我们需要将一个浮点数转换成 `RGBA` 格式，每个通道 8 位。
在 Vladimir 的文章中，使用了以下编码/解码模式：
```glsl
// decode particle position (x, y) from pixel RGBA color
vec2 pos = vec2(
    color.r / 255.0 + color.b,
    color.g / 255.0 + color.a);
... // move the position
// encode the position back into RGBA
gl_FragColor = vec4(
    fract(pos * 255.0),
    floor(pos * 255.0) / 255.0);
```
在这里，粒子的 `X` 和 `Y` 坐标都存储在一个 32 位的数字中。我一开始就使用了这种方法，它在桌面和 Android 手机上运行良好。
然而，当我在 iPhone 上打开一个网站时，令人不快的惊喜正等着我。没有任何明显的原因就出现了严重的瑕疵。
比较同样的代码在桌面（左）和 iPhone（右）上运行
![2-9][url-local-9]
![2-10][url-local-10]
更糟糕的是，当向量场是静态的（所有地方速度为 0 ）时，iPhone 上的粒子一直在移动：
![2-11][url-local-11]
![2-12][url-local-12]
我检查了请求的浮点分辨率是否设置为最高可用（highp）。然而，这些瑕疵还是显而易见。
### How can we fix this?
我不想使用启用浮点纹理这种最简单的解决方法。它们[没有像我希望的那样得到广泛支持][url-6]。相反，我做了多年来非 GPU 编程告诉我不要做的事情。
我决定解决数千个常微分方程，而不是每帧一次。但每个维度都有一次。我将向着色器传递一个属性，告诉它需要将哪个维度写入此 “draw” 调用的输出：
``` glsl
if (u_out_coordinate == 0) gl_FragColor = encodeFloatRGBA(pos.x);
else if (u_out_coordinate == 1) gl_FragColor = encodeFloatRGBA(pos.y);
```
在伪代码中，它如下所示：
```
Frame 1:
  Step 1: 嘿，WebGL，将 u_out_coordinate 设为 0 ，并将所有内容渲染进 `texture_x` ；
  Step 2: 嘿，WebGL，把 u_out_coordinate 设为 1 ，然后把所有内容再次渲染进 `texture_y` ；
```
我们解决了同样的问题，除了解决方案中的 `x` 分量，我们扔掉了所有东西。然后对 `y` 重复一遍。
这对我来说似乎很疯狂，因为我认为这会影响性能。但使用这种方法，就连我的低端安卓手机也没有遇到问题。
`encodeFloatRGBA()` 使用所有 32 位将浮点编码为 RGBA 向量。我在 stackoverflow 的某个地方发现了它的[应用][url-7]，我不确定这是否是最好的处理方式（如果你知道得更好，请让我知道）。
好消息是瑕疵消失了：
![2-13][url-local-13]
## <a name="reference"></a> 参考资料
- [fieldplay github][url-1]
[url-1]:https://github.com/anvaka/fieldplay
[url-2]:https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f
[url-3]:https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods
[url-4]:https://github.com/anvaka/panzoom
[url-5]:https://github.com/anvaka/query-state
[url-6]:https://webglstats.com/search?query=OES_texture_float
[url-7]:https://github.com/anvaka/fieldplay/blob/master/src/lib/utils/floatPacking.js
[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html
[url-local-1]:https://xxholic.github.io/starry-night/draft/2/image/1.png
[url-local-2]:https://xxholic.github.io/starry-night/draft/2/image/2.gif
[url-local-3]:https://xxholic.github.io/starry-night/draft/2/image/3.png
[url-local-4]:https://xxholic.github.io/starry-night/draft/2/image/4.gif
[url-local-5]:https://xxholic.github.io/starry-night/draft/2/image/5.png
[url-local-6]:https://xxholic.github.io/starry-night/draft/2/image/6.gif
[url-local-7]:https://xxholic.github.io/starry-night/draft/2/image/7.png
[url-local-8]:https://xxholic.github.io/starry-night/draft/2/image/8.png
[url-local-9]:https://xxholic.github.io/starry-night/draft/2/image/9.gif
[url-local-10]:https://xxholic.github.io/starry-night/draft/2/image/10.gif
[url-local-11]:https://xxholic.github.io/starry-night/draft/2/image/11.gif
[url-local-12]:https://xxholic.github.io/starry-night/draft/2/image/12.gif
[url-local-13]:https://xxholic.github.io/starry-night/draft/2/image/13.gif
<details>
<summary></summary>
最近看了十几年前的一部电影[《李米的猜想》][url-last]，故事还是蛮不错的，里面的演员感觉真的好年轻。
</details>
[url-last]:https://movie.douban.com/subject/3230459/
[url-origin]:https://github.com/XXHolic/starry-night/issues/2
[url-my-github]:https://github.com/XXHolic