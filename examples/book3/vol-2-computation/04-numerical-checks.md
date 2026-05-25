# 第四章：数值验证

:::section {#b3-s4-discretization title="离散化"}
:::

我们将 @b3-thm-index-formula 离散化到有限元网格上，并检查误差项如何随网格细化收敛。

:::lemma {#b3-lem-grid-convergence title="网格收敛引理"}
若局部网格保持形状正则，则离散指标密度弱收敛到 @b3-def-index-density。
:::

:::prop {#b3-prop-numeric-stability title="数值稳定性命题"}
在 @b3-lem-grid-convergence 的条件下，离散指标在穿过有限个临界网格尺度后保持常值。
:::

:::section {#b3-s4-tests title="测试协议"}
:::

:::remark {#b3-rem-test-protocol title="测试协议"}
所有表格均采用第二卷附录 A 的局部模板，并以 @b3-cor-boundary-correction 作为边界修正项。
:::

