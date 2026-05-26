# 第四章：导出稳定性

:::section {#h-2c84c46aad4dcc1d title="稳定条件的传递"}
:::

有了 @h-1bec2cb6f1af5555 之后，我们可以讨论稳定条件如何从局部图表传递到全局对象。

:::def {#h-9b880a98d1663b88 title="相对切片"}
相对切片是每个纤维范畴上的 Bridgeland 切片族 $\mathcal{P}_U(\phi)$，并且这些切片与所有限制函子相容。
:::

:::prop {#h-fa1056dc63b14c69 title="相位有界性"}
如果相对切片在每个紧生成元上满足统一相位界，则所有由 @h-0dff68c6ee9785a4 粘合出的对象都具有有限 Harder-Narasimhan 分解。
:::

:::section {#h-a78a13596e10678a title="全局稳定性"}
:::

:::theorem {#h-1b10ddb204ee5731 title="稳定性传递定理"}
在 @h-9b880a98d1663b88 和 @h-fa1056dc63b14c69 的条件下，局部稳定条件唯一诱导出 @h-1bec2cb6f1af5555 构造的全局模空间上的稳定条件。
:::

:::cor {#h-320bd410d8ab8530 title="墙交叉有限性"}
若基础站点是 Noetherian 的，则 @h-1b10ddb204ee5731 下产生的墙交叉只在局部有限的实超平面族上发生。
:::

