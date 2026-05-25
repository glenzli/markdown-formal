# 第三章：模空间与层

:::section {#b2-s3-moduli title="局部模问题"}
:::

令 $\mathfrak{M}$ 表示满足 @b2-thm-descent 条件的对象族所形成的预栈。我们关心它何时由局部图表粘合成全局几何对象。

:::def {#b2-def-atlas title="下降图表"}
一个下降图表是覆盖族 $\{U_i\to\mathfrak{M}\}$ 以及相容的纤维化站点，使得所有交叠 $U_i\times_{\mathfrak{M}}U_j$ 都满足 @b2-prop-base-change。
:::

:::lemma {#b2-lem-effective-atlas title="有效图表引理"}
若下降图表的交叠满足 @b2-lem-compactness，则其 Čech 神经决定唯一的有效粘合对象。
:::

:::section {#b2-s3-gluing title="全局粘合"}
:::

:::theorem {#b2-thm-gluing title="模空间粘合定理"}
任何满足 @b2-def-atlas 的局部模问题都可以粘合为一个全局模空间；其结构层由 @b2-thm-descent 给出的紧生成下降范畴唯一决定。
:::

这个结论会在 @b2-thm-stability-transfer 中被升级为稳定条件的传递定理。

