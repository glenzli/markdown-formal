# 第一章：基础对象

:::section {#b3-s1-objects title="对象与局部模型"}
:::

我们考虑带边界的紧流形族，并为每个局部图表指定一个可控的解析模型。

:::def {#b3-def-controlled-chart title="受控图表"}
受控图表是三元组 $(U,E,D)$，其中 $U$ 是局部坐标域，$E\to U$ 是向量丛，$D$ 是一阶椭圆算子，并且其主符号在边界附近满足一致估计。
:::

:::lemma {#b3-lem-local-parametrix title="局部参数列引理"}
每个 @b3-def-controlled-chart 都存在局部参数列 $P$，使得 $DP-I$ 与 $PD-I$ 都是紧算子。
:::

:::section {#b3-s1-compat title="相容性"}
:::

:::prop {#b3-prop-chart-gluing title="图表粘合命题"}
若两个受控图表在交叠区域上具有相同主符号类，则它们的局部参数列可在紧扰动意义下粘合。
:::

技术估计的截断版本见 @b3-app1-lem-cutoff。

