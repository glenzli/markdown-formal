# 第四章：导出稳定性

:::section {#b2-s4-stability title="稳定条件的传递"}
:::

有了 @b2-thm-gluing 之后，我们可以讨论稳定条件如何从局部图表传递到全局对象。

:::def {#b2-def-slicing title="相对切片"}
相对切片是每个纤维范畴上的 Bridgeland 切片族 $\mathcal{P}_U(\phi)$，并且这些切片与所有限制函子相容。
:::

:::prop {#b2-prop-phase-bound title="相位有界性"}
如果相对切片在每个紧生成元上满足统一相位界，则所有由 @b2-lem-effective-atlas 粘合出的对象都具有有限 Harder-Narasimhan 分解。
:::

:::section {#b2-s4-transfer title="全局稳定性"}
:::

:::theorem {#b2-thm-stability-transfer title="稳定性传递定理"}
在 @b2-def-slicing 和 @b2-prop-phase-bound 的条件下，局部稳定条件唯一诱导出 @b2-thm-gluing 构造的全局模空间上的稳定条件。
:::

:::cor {#b2-cor-wall-crossing title="墙交叉有限性"}
若基础站点是 Noetherian 的，则 @b2-thm-stability-transfer 下产生的墙交叉只在局部有限的实超平面族上发生。
:::

