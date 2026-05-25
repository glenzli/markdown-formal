# 第三章：指标公式

:::section {#b3-s3-local-density title="局部密度"}
:::

由 @b3-thm-duality 出发，我们将指标写成局部密度的积分。

:::def {#b3-def-index-density title="指标密度"}
指标密度是微分形式
$$
\alpha(D)=\widehat{A}(TX)\operatorname{ch}(\sigma(D)),
$$
其中 $\sigma(D)$ 表示椭圆算子的主符号类。
:::

:::theorem {#b3-thm-index-formula title="受控指标公式"}
若受控图表族满足 @b3-app1-prop-compact-error，则全局 Fredholm 指数等于 $\int_X \alpha(D)$。
:::

:::section {#b3-s3-boundary title="边界修正"}
:::

:::cor {#b3-cor-boundary-correction title="边界修正推论"}
在带边界情形中，@b3-thm-index-formula 需要加入由边界算子 eta 不变量给出的修正项。
:::

第二卷附录 A 给出用于数值验证的局部表格，见 @b3-app2-ex-table-row。

