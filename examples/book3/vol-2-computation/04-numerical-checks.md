# 第四章：数值验证

:::section {#h-e3d9eb2b3af5434d title="离散化"}
:::

我们将 @h-b93016b6b3964db7 离散化到有限元网格上，并检查误差项如何随网格细化收敛。

:::lemma {#h-2d8077b7efe4deb0 title="网格收敛引理"}
若局部网格保持形状正则，则离散指标密度弱收敛到 @h-baff42c4f32c8f4c。
:::

:::prop {#h-96bc74d6fd9beb24 title="数值稳定性命题"}
在 @h-2d8077b7efe4deb0 的条件下，离散指标在穿过有限个临界网格尺度后保持常值。
:::

:::section {#h-e5c796e9b8a3b853 title="测试协议"}
:::

:::remark {#h-d2d8b69c18b1df34 title="测试协议"}
所有表格均采用第二卷附录 A 的局部模板，并以 @h-91b48b8b428c5bac 作为边界修正项。
:::

