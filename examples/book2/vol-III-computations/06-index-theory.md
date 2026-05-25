# 第六章：指标局部性

:::section {#b2-s6-index title="局部指标"}
:::

谱序列比较允许我们把全局指标拆解为局部贡献。这里的“局部”指 @b2-def-atlas 给出的下降图表，而不是拓扑空间中的开集直觉。

:::def {#b2-def-local-index title="局部指标"}
给定下降图表上的椭圆复形族，其局部指标定义为每个图表上的 Euler 类与相应 Todd 类的配对。
:::

:::lemma {#b2-lem-cocycle-cancel title="余循环抵消引理"}
若交叠项满足 @b2-prop-spectral-comparison，则所有二重交叠上的指标误差在 Čech 复形中成边界。
:::

:::section {#b2-s6-locality title="局部性结论"}
:::

:::cor {#b2-cor-index-locality title="指标局部性推论"}
在 @b2-thm-gluing 的假设下，全局指标等于 @b2-def-local-index 给出的局部指标之和；该等式不依赖下降图表的细化。
:::

:::remark {#b2-rem-book-structure title="关于本示例的结构"}
本书刻意包含 `intro.md`、`summary.md`、`vol-*`、`volume-*` 与罗马数字卷目录，用来测试导航层级、连续章号和跨卷返回行为。
:::

