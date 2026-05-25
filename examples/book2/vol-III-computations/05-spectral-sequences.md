# 第五章：谱序列比较

:::section {#b2-s5-filtration title="滤过对象"}
:::

为了比较局部与全局不变量，我们给 @b2-def-fibered-site 中的对象赋予有限递增滤过。

:::def {#b2-def-filtered-object title="相容滤过对象"}
相容滤过对象是对象 $E$ 及其滤过 $F_\bullet E$，使得所有限制函子都严格保持滤过并诱导相容的分次对象。
:::

:::lemma {#b2-lem-page-one title="第一页退化准则"}
若分次对象满足 @b2-prop-phase-bound 的统一相位界，则其关联谱序列在有限页之后稳定。
:::

:::section {#b2-s5-comparison title="比较定理"}
:::

:::prop {#b2-prop-spectral-comparison title="谱序列比较命题"}
由 @b2-def-filtered-object 产生的局部谱序列，经由 @b2-thm-descent 粘合后，与全局滤过对象的谱序列在 $E_2$ 页之后同构。
:::

@b2-prop-spectral-comparison 是第六章指标局部性的主要输入。

