# 第三章：指标公式

:::section {#h-485638318eca1788 title="局部密度"}
:::

由 @h-d049444d7f71d2e9 出发，我们将指标写成局部密度的积分。

:::def {#h-baff42c4f32c8f4c title="指标密度"}
指标密度是微分形式
$$
\alpha(D)=\widehat{A}(TX)\operatorname{ch}(\sigma(D)),
$$
其中 $\sigma(D)$ 表示椭圆算子的主符号类。
:::

:::theorem {#h-b93016b6b3964db7 title="受控指标公式"}
若受控图表族满足 @h-0d0e407b15f778fb，则全局 Fredholm 指数等于 $\int_X \alpha(D)$。
:::

:::section {#h-7fd1b27facda9f05 title="边界修正"}
:::

:::cor {#h-91b48b8b428c5bac title="边界修正推论"}
在带边界情形中，@h-b93016b6b3964db7 需要加入由边界算子 eta 不变量给出的修正项。
:::

第二卷附录 A 给出用于数值验证的局部表格，见 @h-feb4d6cc9507cce4。

