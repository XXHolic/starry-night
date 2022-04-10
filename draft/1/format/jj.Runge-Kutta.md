# Runge-Kutta
## <a name="start"></a> 引子
查看源码，发现用到了这个方法，查资料了解了一下。
- [Origin][url-origin]
- [My GitHub][url-my-github]
## <a name="concept"></a> 相关概念
### 极限
有时不能直接计算某个值，但可以看看逐渐接近时的情况，看下面的例子：
![1-1][url-local-1]
当 `x = 1` 时，发现结果是 `0/0` ，这个在数学上是未定式，是不确定的。那看看接近的情况：
| x | f(x) |
| --- | --- |
| 0.5 | 1.5 |
| 0.9 | 1.9 |
| 0.99 | 1.99 |
| 0.9999 | 1.9999 |
| 0.999999 | 1.999999 |
发现当 `x` 接近 1 的时候，`f(x)` 越来越接近 2 ，这种情况就是**极限**。
我们可以说当 `x` 趋近 1 时，`f(x)` 的极限是 2 ，用符号表示就是：
![1-2][url-local-2]
更加正式的定义见[这里][url-6]。
### 导数
设函数 f(x) 在 x<sub>0</sub> 有定义，如果以下极限存在：
![1-3][url-local-3]
则称 f(x) 在 x<sub>0</sub> 处**可导**，上述极限值为 f(x) 在 x<sub>0</sub> 处的**导数**，记作 f<sup>'</sup>(x<sub>0</sub>) 。
导数描述的是函数的**变化率**，在几何中可以通过导数计算出某一点切线的斜率。
求导法则见[这里][url-7]。
### 微分
设函数 y=f(x) 在 x<sub>0</sub> 处连续，若存在实数 A ，使得:
![1-4][url-local-4]
其中 △x -> 0 ，则称 f(x) 在 x<sub>0</sub> 处**可微**，线性部分 A△x 为 f(x) 在 x<sub>0</sub> 处的**微分**，记作 dy 。
微分的几何意义是线性替代，线性替代的思想可以推广至高阶替代。
更加详细的介绍见[这里][url-8]。
### 微分方程
**微分方程**指的是含有函数及其导数的方程。微分方程中有的有无穷多解，有的无解，有的则仅有有限个解。
微分方程的**阶数**取决于方程中出现的最高次导数阶数。
- 常微分方程：仅含有一个独立变量的微分方程。
- 偏微分方程：函数包含两个或两个以上的独立变量。
- 特解：满足微分方程的某一个解。
- 通解：满足微分方程的一组解。
- 初值问题：满足初值条件的常微分方程的解。
- 单步法：计算下一个点的值 y<sub>n+1</sub> 只需要用到前面一个点的值 y<sub>n</sub> 。
- 多步法：计算下一个点的值 y<sub>n+1</sub> 需要用到前面 m 个点的值 y<sub>m</sub> 。
更多信息见[这里][url-9]和[这里][url-10]。
## <a name="rk"></a> Runge-Kutta
龙格－库塔法是一种求解常微分方程数值解的单步算法。其中有一个在工程上应用很广泛，称为 RK4 。
对于一阶微分方程初值问题：
![1-5][url-local-5]
其中，t<sub>0</sub> 为初始时间（已知常数），y<sub>0</sub>为初始状态（已知向量），f(t,y) 是关于时间 t 和状态 y 的函数（已知函数）。
RK4 求解算法为：
![1-6][url-local-6]
其中：
![1-7][url-local-7]
h 为时间步长。
## <a name="reference"></a> 参考资料
- [Runge–Kutta methods wiki][url-1]
- [Runge–Kutta methods mathworld][url-4]
- [Runge-Kutta方法及其推导][url-2]
- [龙格库塔法][url-3]
[url-1]:https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods
[url-2]:https://blog.zyuzhi.me/2020/03/28/181.html
[url-3]:https://baike.baidu.com/item/%E9%BE%99%E6%A0%BC%E5%BA%93%E5%A1%94%E6%B3%95/3016350
[url-4]:https://mathworld.wolfram.com/Runge-KuttaMethod.html
[url-5]:https://www.shuxuele.com/calculus/introduction.html
[url-6]:https://www.shuxuele.com/calculus/limits-formal.html
[url-7]:https://www.shuxuele.com/calculus/derivatives-rules.html
[url-8]:https://www.zhihu.com/question/22199657
[url-9]:https://zhuanlan.zhihu.com/p/85151812
[url-10]:https://www.shuxuele.com/calculus/differential-equations.html
[url-example1]:https://xxholic.github.io/lab/starry-night/translate.html
[url-local-1]:https://xxholic.github.io/starry-night/draft/1/image/1.svg
[url-local-2]:https://xxholic.github.io/starry-night/draft/1/image/2.svg
[url-local-3]:https://xxholic.github.io/starry-night/draft/1/image/3.svg
[url-local-4]:https://xxholic.github.io/starry-night/draft/1/image/4.svg
[url-local-5]:https://xxholic.github.io/starry-night/draft/1/image/5.svg
[url-local-6]:https://xxholic.github.io/starry-night/draft/1/image/6.svg
[url-local-7]:https://xxholic.github.io/starry-night/draft/1/image/7.svg
<details>
<summary></summary>
最近看了[《贝奥武夫》][url-see]，看到里面的反派怎么这么眼熟，去查了下原来这个电影是本人动作捕捉后再 CG 化。
![1-see][url-local-see]
</details>
[url-see]:https://movie.douban.com/subject/1792917/
[url-local-see]:https://xxholic.github.io/starry-night/draft/1/image/poster.png
[url-origin]:https://github.com/XXHolic/starry-night/issues/1
[url-my-github]:https://github.com/XXHolic