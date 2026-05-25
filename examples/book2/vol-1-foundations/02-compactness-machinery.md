# 第二章：紧性机器

:::section {#b2-s2-compactness title="紧生成结构"}
:::

第一章的 @b2-lem-descent-kernel 只给出了形式闭合性。为了让构造可计算，我们需要紧生成条件。

:::def {#b2-def-compact-generator title="紧生成元"}
对象 $G\in\mathcal{E}$ 称为紧生成元，如果函子 $\mathrm{Hom}(G,-)$ 与滤过余极限交换，且 $G$ 生成的局部化子等于整个稳定范畴。
:::

:::lemma {#b2-lem-compactness title="相对紧性引理"}
若每个纤维 $\mathcal{E}_U$ 都有紧生成元，且限制函子保持紧对象，则全局下降范畴仍由有限个相对紧对象生成。
:::

:::section {#b2-s2-recognition title="识别准则"}
:::

:::theorem {#b2-thm-descent title="紧生成下降定理"}
在 @b2-prop-base-change 和 @b2-lem-compactness 的条件下，下降范畴 $\mathcal{E}(X)$ 与 Čech 全化范畴等价，并且该等价保持紧生成元。
:::

:::remark {#b2-rem-size title="大小性约定"}
本章默认所有范畴都在一个固定宇宙中小化。这个约定不改变 @b2-thm-descent 的数学内容，但能避免后续卷中出现集合论噪声。
:::

